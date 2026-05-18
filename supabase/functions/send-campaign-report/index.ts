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
    .in('status', ['approved', 'winner'])
  const all = entries || []
  const new24 = all.filter((e: any) => e.created_at >= since).length
  const totalViews = all.reduce((s: number, e: any) => s + (e.views || 0), 0)
  const totalEng = all.reduce(
    (s: number, e: any) => s + (e.likes || 0) + (e.comments || 0) + (e.shares || 0),
    0,
  )
  const top = [...all]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 10)
    .map((e, i) => ({
      rank: i + 1,
      handle: e.handle || e.tiktok_handle || e.instagram_handle || e.facebook_handle || '—',
      platform: e.platform,
      score: Number(e.score || 0),
      views: e.views || 0,
      likes: e.likes || 0,
      post_url: e.post_url,
    }))
  const end = new Date(contest.end_date)
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000))

  return {
    contest_name: contest.name,
    contest_hashtag: contest.hashtag,
    prize: contest.prize,
    date_label: fmtDate(new Date()),
    days_remaining: daysLeft,
    total_entries: all.length,
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
    .from('posts').select('id, influencer_id, platform, posted_at, post_url')
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

  const sum = (ps: any[]) => {
    let reach = 0, impressions = 0, engagement = 0
    for (const p of ps) {
      const m = latestByPost.get(p.id)
      if (!m) continue
      reach += m.reach || 0
      impressions += m.impressions || m.views || 0
      engagement += (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0)
    }
    return { reach, impressions, engagement }
  }
  const cur = sum(weekPosts), prev = sum(prevPosts)
  const wow = (c: number, p: number) => (p > 0 ? ((c - p) / p) * 100 : 0)

  // top creators by engagement this week
  const byInf = new Map<string, { views: number; engagement: number; posts: number }>()
  for (const p of weekPosts) {
    const m = latestByPost.get(p.id) || {}
    const rec = byInf.get(p.influencer_id) || { views: 0, engagement: 0, posts: 0 }
    rec.views += m.views || m.impressions || 0
    rec.engagement += (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0)
    rec.posts += 1
    byInf.set(p.influencer_id, rec)
  }
  const top_creators: any[] = []
  if (byInf.size) {
    const ids = [...byInf.keys()]
    const { data: infs } = await supa.from('influencers').select('id, handle, primary_platform').in('id', ids)
    const sorted = [...byInf.entries()].sort((a, b) => b[1].engagement - a[1].engagement).slice(0, 5)
    for (const [id, agg] of sorted) {
      const inf = (infs || []).find((x: any) => x.id === id)
      top_creators.push({ handle: inf?.handle || 'creator', platform: inf?.primary_platform, ...agg })
    }
  }

  const { data: camp } = await supa.from('campaigns').select('budget_kes').eq('id', campaign_id).maybeSingle()

  const weekLabel = `Week of ${new Date(wkStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}–${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`

  return {
    week_label: weekLabel,
    reach: cur.reach,
    impressions: cur.impressions,
    engagement: cur.engagement,
    posts: weekPosts.length,
    wow_engagement_pct: Number(wow(cur.engagement, prev.engagement).toFixed(1)),
    wow_reach_pct: Number(wow(cur.reach, prev.reach).toFixed(1)),
    top_creators,
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
      const { data: rs } = await supa
        .from('report_recipients').select('email').eq('campaign_id', campaign_id).eq(flag, true)
      recipients = rs || []
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
