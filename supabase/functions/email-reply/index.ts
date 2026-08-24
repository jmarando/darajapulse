// Reply to an inbound email thread from the shared inbox.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend'
// Domains verified for *sending* in Resend.
const SEND_DOMAIN = 'darajapulse.com'

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })

    const { data: userData } = await userClient.auth.getUser()
    const user = userData?.user
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const threadId = typeof body.threadId === 'string' ? body.threadId : ''
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (!threadId || !message || message.length > 20000) {
      return json({ error: 'threadId and message (1-20000 chars) are required' }, 400)
    }

    // RLS on email_threads enforces workspace access for this user.
    const { data: thread, error: threadErr } = await userClient
      .from('email_threads')
      .select('id, mailbox, participant_email, participant_name, subject')
      .eq('id', threadId)
      .maybeSingle()
    if (threadErr) throw threadErr
    if (!thread) return json({ error: 'Thread not found' }, 404)

    const localPart = (thread.mailbox.split('@')[0] || 'notifications').replace(/[^a-z0-9._-]/gi, '') || 'notifications'
    const fromAddress = `${localPart}@${SEND_DOMAIN}`
    const subject = thread.subject?.toLowerCase().startsWith('re:')
      ? thread.subject
      : `Re: ${thread.subject || 'Your message'}`

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111">${
      escapeHtml(message).replace(/\n/g, '<br />')
    }</div>`

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!lovableApiKey || !resendApiKey) return json({ error: 'Email is not configured' }, 500)

    const res = await fetch(`${GATEWAY_URL}/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lovableApiKey}`,
        'X-Connection-Api-Key': resendApiKey,
      },
      body: JSON.stringify({
        from: `Daraja Pulse <${fromAddress}>`,
        to: [thread.participant_email],
        subject,
        html,
        text: message,
        reply_to: thread.mailbox,
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      console.error(`Gateway request failed [${res.status}]: ${errorBody}`)
      return json({ error: 'Provider request failed', status: res.status, details: errorBody }, res.status)
    }
    const sent = await res.json()

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false },
    })
    await admin.from('email_messages').insert({
      thread_id: thread.id,
      direction: 'outbound',
      from_email: fromAddress,
      from_name: 'Daraja Pulse',
      to_emails: [thread.participant_email],
      subject,
      text_body: message,
      html_body: html,
      provider_id: sent?.id ?? null,
      sent_by: user.id,
    })
    await admin
      .from('email_threads')
      .update({
        last_message_at: new Date().toISOString(),
        last_snippet: message.slice(0, 240),
        unread_count: 0,
      })
      .eq('id', thread.id)

    return json({ ok: true, id: sent?.id ?? null })
  } catch (e) {
    console.error('email-reply error', e)
    return json({ error: e instanceof Error ? e.message : 'unknown error' }, 500)
  }
})
