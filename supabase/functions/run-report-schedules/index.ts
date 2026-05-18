// run-report-schedules
// Cron-invoked. Picks up enabled schedules whose target time matches the current
// EAT (Africa/Nairobi) clock window and have not been sent yet today/this week.
// Calls send-campaign-report for each due schedule.

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supa = createClient(SUPABASE_URL, SERVICE_KEY)

  // Current time in Africa/Nairobi (UTC+3, no DST)
  const nowUtc = new Date()
  const eat = new Date(nowUtc.getTime() + 3 * 3600 * 1000)
  const eatHour = eat.getUTCHours()
  const eatMin = eat.getUTCMinutes()
  const eatDow = eat.getUTCDay() // 0..6 (Sun..Sat)
  const eatDate = eat.toISOString().slice(0, 10)

  const { data: schedules } = await supa
    .from('report_schedules')
    .select('*')
    .eq('enabled', true)
    .in('report_type', ['contest_daily', 'campaign_weekly'])

  const due: any[] = []
  for (const s of schedules || []) {
    if (s.send_hour !== eatHour) continue
    if (Math.abs((s.send_minute || 0) - eatMin) > 7) continue // 15-min window tolerance
    if (s.report_type === 'campaign_weekly' && s.send_dow != null && s.send_dow !== eatDow) continue
    // dedupe by last_sent_at
    if (s.last_sent_at) {
      const last = new Date(s.last_sent_at)
      const lastEat = new Date(last.getTime() + 3 * 3600 * 1000)
      if (s.report_type === 'contest_daily' && lastEat.toISOString().slice(0, 10) === eatDate) continue
      if (s.report_type === 'campaign_weekly') {
        const diffDays = (nowUtc.getTime() - last.getTime()) / 86400000
        if (diffDays < 6) continue
      }
    }
    due.push(s)
  }

  const results: any[] = []
  for (const s of due) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-campaign-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          campaign_id: s.campaign_id,
          report_type: s.report_type,
          contest_id: s.contest_id || undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      results.push({ schedule_id: s.id, status: res.status, body })
      if (res.ok) {
        await supa.from('report_schedules').update({ last_sent_at: nowUtc.toISOString() }).eq('id', s.id)
      }
    } catch (e) {
      results.push({ schedule_id: s.id, error: String(e) })
    }
  }

  return new Response(JSON.stringify({ ok: true, evaluated: schedules?.length || 0, due: due.length, results }),
    { headers: { ...cors, 'Content-Type': 'application/json' } })
})
