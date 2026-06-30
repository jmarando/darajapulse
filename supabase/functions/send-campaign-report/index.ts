// send-campaign-report
// Aggregates campaign/contest data and dispatches a branded email via send-transactional-email.
// Body: { campaign_id, report_type, contest_id?, test_email?, recipient_email? }
//   - test_email   : send only to that address with a [TEST] marker
//   - recipient_email : (internal, called by scheduler) send to one recipient
//   - if neither   : fan out to all opted-in recipients for this campaign

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

type ReportType = 'campaign_weekly' | 'contest_daily' | 'draw_closed'

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' })

async function buildContestDaily(supa: any, campaign_id: string, contest_id?: string) {
  // Pick the most recent active contest if not given
  let contest: any = null
  if (contest_id) {
    const { data } = await supa.from('contests').select('*').eq('id', contest_id).maybeSingle()
    contest = data
  } else {
    const { data } = await supa
      .from('contests').select('*').eq('campaign_id', campaign_id).eq('is_active', true)
      .order('start_date', { ascending: false }).limit(1).maybeSingle()
    contest = data
  }
  if (!contest) return null

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data: entries } = await supa
    .from('contest_entries').select('*')
    .eq('contest_id', contest.id)
  const allRows = entries || []
  const new24 = allRows.filter((e: any) => e.created_at >= since).length

  // Match the in-app/public-report logic: announced winners (status='winner'
  // OR metadata.placement_rank set) are removed from the leaderboard along
  // with their sibling rows. Other rows are grouped per contestant by handle
  // so the same person isn't listed twice.
  const cleanH = (s?: string | null) =>
    (s || '').trim().replace(/^@+/, '').toLowerCase() || null
  const handlesOf = (e: any) =>
    [e.handle, e.instagram_handle, e.tiktok_handle, e.facebook_handle]
      .map(cleanH).filter(Boolean) as string[]
  const isWinner = (e: any) =>
    e.status === 'winner' || (e?.metadata && e.metadata.placement_rank != null)
  const winnerHandles = new Set<string>()
  for (const w of allRows.filter(isWinner)) {
    for (const h of handlesOf(w)) winnerHandles.add(h)
    const tokens = String(w.full_name || w.submitter_name || '')
      .toLowerCase().split(/\s+/).filter((t: string) => t.length >= 5)
    for (const t of tokens) winnerHandles.add(`name:${t}`)
  }
  const isWinnerRelated = (e: any) => {
    if (isWinner(e)) return true
    for (const h of handlesOf(e)) if (winnerHandles.has(h)) return true
    const hay = [e.handle, e.tiktok_handle, e.instagram_handle, e.facebook_handle, e.full_name, e.submitter_name]
      .map((s: any) => String(s || '').toLowerCase()).join(' ')
    for (const k of winnerHandles) {
      if (k.startsWith('name:') && hay.includes(k.slice(5))) return true
    }
    return false
  }

  const eligible = allRows.filter((e: any) =>
    ['approved', 'winner', 'registered'].includes(e.status) && !isWinnerRelated(e)
  )

  // Group by primary handle (or email) so one contestant = one row.
  const groups = new Map<string, any[]>()
  for (const e of eligible) {
    const key = handlesOf(e)[0] || cleanH(e.submitter_email) || e.id
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(e)
  }
  const contestants = Array.from(groups.values()).map((rows) => {
    const reg = rows.find((r: any) =>
      ['registration','csv_import','external_feed'].includes(String(r.source || ''))) || rows[0]
    // Best post per platform — sum across platforms.
    const bestByPlat = new Map<string, any>()
    for (const r of rows) {
      const plat = String(r.platform || 'other').toLowerCase()
      const s = Number(r.shares||0)*3 + Number(r.comments||0)*2 + Number(r.likes||0) + Number(r.views||0)
      const prev = bestByPlat.get(plat)
      if (!prev || s > prev._s) bestByPlat.set(plat, { ...r, _s: s })
    }
    const posts = Array.from(bestByPlat.values())
    return {
      reg,
      handle: reg.handle || reg.tiktok_handle || reg.instagram_handle || reg.facebook_handle || '—',
      name: reg.full_name || reg.submitter_name || reg.handle || '—',
      platform: reg.platform,
      views: posts.reduce((s, p) => s + Number(p.views || 0), 0),
      likes: posts.reduce((s, p) => s + Number(p.likes || 0), 0),
      score: posts.reduce((s, p) => s + p._s, 0),
      post_url: posts[0]?.post_url || reg.post_url,
    }
  }).sort((a, b) => b.score - a.score)

  const totalViews = contestants.reduce((s, c) => s + c.views, 0)
  const totalEng = eligible.reduce(
    (s: number, e: any) => s + (e.likes || 0) + (e.comments || 0) + (e.shares || 0),
    0,
  )
  const top = contestants.slice(0, 10).map((c, i) => ({
    rank: i + 1,
    handle: c.handle,
    platform: c.platform,
    score: Math.round(c.score),
    views: c.views,
    likes: c.likes,
    post_url: c.post_url,
  }))
  const end = new Date(contest.end_date)
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000))

  return {
    contest_name: contest.name,
    contest_hashtag: contest.hashtag,
    prize: contest.prize,
    date_label: fmtDate(new Date()),
    days_remaining: daysLeft,
    total_entries: contestants.length,
    new_entries_24h: new24,
    total_views: totalViews,
    total_engagement: totalEng,
    top_entries: top,
  }
}

async function buildCampaignWeekly(supa: any, campaign_id: string) {
  const now = Date.now()
  const wkStart = new Date(now - 7 * 86400000).toISOString()
  const prevStart = new Date(now - 14 * 86400000).toISOString()
  const { data: posts } = await supa
    .from('posts').select('id, influencer_id, platform, posted_at, post_url, caption')
    .eq('campaign_id', campaign_id)
  const postIds = (posts || []).map((p: any) => p.id)
  let metrics: any[] = []
  if (postIds.length) {
    const { data: m } = await supa
      .from('post_metrics').select('*').in('post_id', postIds)
    metrics = m || []
  }
  // latest snapshot per post
  const latestByPost = new Map<string, any>()
  for (const m of metrics) {
    const cur = latestByPost.get(m.post_id)
    if (!cur || cur.captured_at < m.captured_at) latestByPost.set(m.post_id, m)
  }

  const weekPosts = (posts || []).filter((p: any) => p.posted_at && p.posted_at >= wkStart)
  const prevPosts = (posts || []).filter(
    (p: any) => p.posted_at && p.posted_at >= prevStart && p.posted_at < wkStart,
  )

  const engOf = (m: any) =>
    (m?.likes || 0) + (m?.comments || 0) + (m?.shares || 0) + (m?.saves || 0)

  const sum = (ps: any[]) => {
    let reach = 0, impressions = 0, engagement = 0,
      views = 0, likes = 0, comments = 0, shares = 0
    for (const p of ps) {
      const m = latestByPost.get(p.id)
      if (!m) continue
      reach += m.reach || 0
      impressions += m.impressions || m.views || 0
      views += m.views || m.impressions || 0
      likes += m.likes || 0
      comments += m.comments || 0
      shares += m.shares || 0
      engagement += engOf(m)
    }
    return { reach, impressions, engagement, views, likes, comments, shares }
  }
  const cur = sum(weekPosts), prev = sum(prevPosts)
  const allTotals = sum(posts || [])
  const wow = (c: number, p: number) => (p > 0 ? ((c - p) / p) * 100 : 0)

  // Platform breakdown (this week)
  const byPlatform = new Map<string, { posts: number; views: number; engagement: number }>()
  for (const p of weekPosts) {
    const m = latestByPost.get(p.id) || {}
    const key = String(p.platform || 'other').toLowerCase()
    const rec = byPlatform.get(key) || { posts: 0, views: 0, engagement: 0 }
    rec.posts += 1
    rec.views += m.views || m.impressions || 0
    rec.engagement += engOf(m)
    byPlatform.set(key, rec)
  }
  const platforms = [...byPlatform.entries()]
    .map(([platform, v]) => ({ platform, ...v }))
    .sort((a, b) => b.engagement - a.engagement)

  // top creators by engagement this week
  const byInf = new Map<string, { views: number; engagement: number; posts: number }>()
  for (const p of weekPosts) {
    const m = latestByPost.get(p.id) || {}
    if (!p.influencer_id) continue
    const rec = byInf.get(p.influencer_id) || { views: 0, engagement: 0, posts: 0 }
    rec.views += m.views || m.impressions || 0
    rec.engagement += engOf(m)
    rec.posts += 1
    byInf.set(p.influencer_id, rec)
  }
  let infMap: Map<string, any> = new Map()
  if (byInf.size) {
    const ids = [...byInf.keys()]
    const { data: infs } = await supa.from('influencers').select('id, handle, primary_platform').in('id', ids)
    for (const inf of (infs || [])) infMap.set(inf.id, inf)
  }
  const top_creators = [...byInf.entries()]
    .sort((a, b) => b[1].engagement - a[1].engagement)
    .slice(0, 5)
    .map(([id, agg]) => {
      const inf = infMap.get(id)
      return { handle: inf?.handle || 'creator', platform: inf?.primary_platform, ...agg }
    })

  // Top posts this week — ranked by engagement
  const scored = weekPosts.map((p: any) => {
    const m = latestByPost.get(p.id) || {}
    const inf = p.influencer_id ? infMap.get(p.influencer_id) : null
    return {
      handle: inf?.handle,
      platform: p.platform,
      post_url: p.post_url,
      posted_at: p.posted_at,
      views: m.views || m.impressions || 0,
      likes: m.likes || 0,
      comments: m.comments || 0,
      shares: m.shares || 0,
      _eng: engOf(m),
    }
  }).sort((a: any, b: any) => b._eng - a._eng).slice(0, 5)
  // Backfill missing influencer handles for posts whose creator wasn't already loaded
  const missingInfIds = weekPosts
    .filter((p: any) => p.influencer_id && !infMap.has(p.influencer_id))
    .map((p: any) => p.influencer_id)
  if (missingInfIds.length) {
    const { data: more } = await supa.from('influencers').select('id, handle').in('id', missingInfIds)
    for (const inf of (more || [])) infMap.set(inf.id, inf)
    for (const s of scored) {
      if (!s.handle) {
        const wp = weekPosts.find((p: any) => p.post_url === s.post_url)
        const inf = wp?.influencer_id ? infMap.get(wp.influencer_id) : null
        if (inf) s.handle = inf.handle
      }
    }
  }
  const top_posts = scored.map(({ _eng, ...rest }: any) => rest)

  const totalCreators = new Set(weekPosts.map((p: any) => p.influencer_id).filter(Boolean)).size

  const { data: camp } = await supa.from('campaigns').select('budget_kes').eq('id', campaign_id).maybeSingle()

  const weekLabel = `Week of ${new Date(wkStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}–${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`

  return {
    week_label: weekLabel,
    reach: cur.reach,
    impressions: cur.impressions,
    engagement: cur.engagement,
    posts: weekPosts.length,
    views: cur.views,
    likes: cur.likes,
    comments: cur.comments,
    shares: cur.shares,
    total_creators: totalCreators,
    wow_engagement_pct: Number(wow(cur.engagement, prev.engagement).toFixed(1)),
    wow_reach_pct: Number(wow(cur.reach, prev.reach).toFixed(1)),
    wow_views_pct: Number(wow(cur.views, prev.views).toFixed(1)),
    platforms,
    top_creators,
    top_posts,
    cumulative_posts: (posts || []).length,
    cumulative_views: allTotals.views,
    cumulative_engagement: allTotals.engagement,
    budget_kes: camp?.budget_kes || 0,
    spend_kes: 0,
  }
}

async function sendOne(templateName: string, recipient: string, templateData: any, idemPrefix: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      templateName,
      recipientEmail: recipient,
      idempotencyKey: `${idemPrefix}-${recipient}`,
      templateData,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error('send-transactional-email failed', res.status, text)
    return { ok: false, status: res.status, error: text }
  }
  return { ok: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json()
    const { campaign_id, report_type, contest_id, test_email } = body as {
      campaign_id: string; report_type: ReportType; contest_id?: string; test_email?: string
    }
    if (!campaign_id || !report_type) {
      return new Response(JSON.stringify({ error: 'campaign_id and report_type required' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const supa = createClient(SUPABASE_URL, SERVICE_KEY)

    // Campaign + client metadata
    const { data: campaign } = await supa
      .from('campaigns').select('id, name, client_id, slug').eq('id', campaign_id).maybeSingle()
    if (!campaign) {
      return new Response(JSON.stringify({ error: 'campaign not found' }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const { data: client } = await supa
      .from('clients').select('name, logo_url, slug').eq('id', campaign.client_id).maybeSingle()
    const { data: link } = await supa
      .from('report_links').select('token').eq('campaign_id', campaign_id).eq('is_active', true).limit(1).maybeSingle()
    const reportUrl = link?.token && client?.slug && campaign.slug
      ? `https://darajapulse.com/${client.slug}/${campaign.slug}/report/${link.token}`
      : link?.token ? `https://darajapulse.com/r/${link.token}` : undefined

    const baseData: any = {
      client_name: client?.name,
      client_logo_url: client?.logo_url,
      client_color: '#111111',
      campaign_name: campaign.name,
      report_url: reportUrl,
    }

    let templateName: string
    let payload: any = { ...baseData }

    if (report_type === 'contest_daily') {
      const data = await buildContestDaily(supa, campaign_id, contest_id)
      if (!data) {
        return new Response(JSON.stringify({ error: 'no active contest' }),
          { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
      }
      templateName = 'contest-daily-summary'
      payload = { ...baseData, ...data }
    } else if (report_type === 'campaign_weekly') {
      const data = await buildCampaignWeekly(supa, campaign_id)
      templateName = 'campaign-weekly-report'
      payload = { ...baseData, ...data }
    } else {
      // draw_closed expects extras passed in body (winner_handle etc.)
      templateName = 'contest-draw-closed'
      payload = { ...baseData, ...(body.draw || {}) }
    }

    const idemBase = `${report_type}-${campaign_id}-${new Date().toISOString().slice(0, 10)}`

    // Recipients
    let recipients: { email: string }[] = []
    if (test_email) {
      recipients = [{ email: test_email }]
      payload.campaign_name = `[TEST] ${payload.campaign_name || ''}`.trim()
    } else if (body.recipient_email) {
      recipients = [{ email: body.recipient_email }]
    } else {
      const flag = report_type === 'contest_daily'
        ? 'receives_contest_daily'
        : report_type === 'campaign_weekly'
        ? 'receives_campaign_weekly'
        : 'receives_draw_closed'
      // Union: campaign-scoped recipients + contest-scoped recipients (if contest_id given)
      const { data: campRs } = await supa
        .from('report_recipients').select('email').eq('campaign_id', campaign_id).is('contest_id', null).eq(flag, true)
      let contestRs: any[] = []
      if (contest_id) {
        const { data } = await supa
          .from('report_recipients').select('email').eq('contest_id', contest_id).eq(flag, true)
        contestRs = data || []
      }
      const seen = new Set<string>()
      recipients = [...(campRs || []), ...contestRs].filter((r: any) => {
        if (seen.has(r.email)) return false
        seen.add(r.email); return true
      })
    }

    if (!recipients.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, note: 'no recipients' }),
        { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const results: any[] = []
    for (const r of recipients) {
      const idem = test_email ? `${idemBase}-test-${Date.now()}` : idemBase
      const out = await sendOne(templateName, r.email, payload, idem)
      results.push({ email: r.email, ...out })
    }

    return new Response(JSON.stringify({ ok: true, sent: results.filter(r => r.ok).length, results }),
      { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
