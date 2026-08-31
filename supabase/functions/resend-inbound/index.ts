// Resend inbound email webhook -> threaded inbox
// Receives `email.received` events, fetches the full message from Resend,
// and stores it against a conversation thread.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend'

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Svix signature verification (Resend uses Svix for webhooks)
async function verifySignature(req: Request, payload: string): Promise<boolean> {
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET')
  if (!secret) return true // not configured yet — accept but log
  const id = req.headers.get('svix-id') || req.headers.get('webhook-id')
  const ts = req.headers.get('svix-timestamp') || req.headers.get('webhook-timestamp')
  const sigHeader = req.headers.get('svix-signature') || req.headers.get('webhook-signature')
  if (!id || !ts || !sigHeader) return false

  const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret
  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${payload}`))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))

  return sigHeader
    .split(' ')
    .map((p) => p.split(',')[1] || '')
    .some((s) => s && timingSafeEqual(s, expected))
}

async function fetchReceivedEmail(emailId: string) {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!lovableApiKey || !resendApiKey) throw new Error('Resend credentials are not configured')

  const res = await fetch(`${GATEWAY_URL}/emails/receiving/${emailId}`, {
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      'X-Connection-Api-Key': resendApiKey,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend retrieve failed [${res.status}]: ${body}`.slice(0, 800))
  }
  return await res.json()
}

function parseAddress(value: unknown): { email: string; name: string | null } {
  const raw = typeof value === 'string' ? value : Array.isArray(value) ? String(value[0] ?? '') : ''
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/)
  if (m) return { email: m[2].trim().toLowerCase(), name: m[1].trim() || null }
  return { email: raw.trim().toLowerCase(), name: null }
}

function snippet(text?: string | null, html?: string | null): string {
  const src = (text || html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return src.slice(0, 240)
}

// Strip quoted reply history so the thread stays readable.
function stripQuoted(text: string): string {
  const cut = text.split(/\n\s*On .+ wrote:\s*\n/)[0]
  return cut
    .split('\n')
    .filter((l) => !l.trim().startsWith('>'))
    .join('\n')
    .trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const payload = await req.text()
    if (!(await verifySignature(req, payload))) return json({ error: 'invalid signature' }, 401)

    const event = JSON.parse(payload || '{}')
    if (event?.type !== 'email.received') return json({ ok: true, ignored: event?.type ?? null })

    const data = event.data ?? {}
    const emailId: string | undefined = data.email_id
    if (!emailId) return json({ error: 'missing email_id' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    let full: any = {}
    try {
      full = await fetchReceivedEmail(emailId)
    } catch (e) {
      console.error('retrieve failed, storing metadata only', e)
    }

    const from = parseAddress(full.from ?? data.from)
    const toList: string[] = (full.to ?? data.to ?? []).map((t: string) => parseAddress(t).email).filter(Boolean)
    const mailbox = (toList[0] || '').toLowerCase()
    const subject: string = full.subject ?? data.subject ?? '(no subject)'
    const textBody: string = full.text ? stripQuoted(String(full.text)) : ''
    const htmlBody: string | null = full.html ?? null

    // Resolve owning workspace: configured mailbox first, then creator record.
    let agencyId: string | null = null
    let campaignId: string | null = null
    const { data: mb } = await supabase
      .from('email_mailboxes')
      .select('agency_id, campaign_id')
      .eq('address', mailbox)
      .maybeSingle()
    if (mb) {
      agencyId = mb.agency_id
      campaignId = mb.campaign_id
    }

    const { data: creator } = await supabase
      .from('influencers')
      .select('id, agency_id, full_name')
      .ilike('email', from.email)
      .maybeSingle()
    if (!agencyId && creator?.agency_id) agencyId = creator.agency_id

    // Find or create the thread (one per mailbox + participant).
    const { data: existing } = await supabase
      .from('email_threads')
      .select('id, unread_count')
      .eq('mailbox', mailbox)
      .eq('participant_email', from.email)
      .maybeSingle()

    let threadId = existing?.id as string | undefined
    if (!threadId) {
      const { data: created, error } = await supabase
        .from('email_threads')
        .insert({
          agency_id: agencyId,
          mailbox,
          participant_email: from.email,
          participant_name: from.name || creator?.full_name || null,
          subject,
          influencer_id: creator?.id ?? null,
          campaign_id: campaignId,
          last_message_at: new Date().toISOString(),
          last_snippet: snippet(textBody, htmlBody),
          unread_count: 1,
        })
        .select('id')
        .single()
      if (error) throw error
      threadId = created.id
    } else {
      await supabase
        .from('email_threads')
        .update({
          last_message_at: new Date().toISOString(),
          last_snippet: snippet(textBody, htmlBody),
          unread_count: (existing?.unread_count ?? 0) + 1,
          status: 'open',
          ...(agencyId ? { agency_id: agencyId } : {}),
          ...(creator?.id ? { influencer_id: creator.id } : {}),
        })
        .eq('id', threadId)
    }

    const { error: msgErr } = await supabase.from('email_messages').insert({
      thread_id: threadId,
      direction: 'inbound',
      from_email: from.email,
      from_name: from.name,
      to_emails: toList,
      cc_emails: (full.cc ?? data.cc ?? []).map((c: string) => parseAddress(c).email).filter(Boolean),
      subject,
      text_body: textBody || null,
      html_body: htmlBody,
      attachments: full.attachments ?? data.attachments ?? [],
      provider_id: emailId,
      message_id: full.message_id ?? data.message_id ?? null,
    })
    // Duplicate delivery of the same email is fine — ignore unique violations.
    if (msgErr && msgErr.code !== '23505') throw msgErr

    // Auto-capture RSVPs from the REPLY BODY only — the subject is inherited from
    // our own invite ("Re: … please confirm") and would flag everyone as attending.
    try {
      const first = textBody.trim().toLowerCase().slice(0, 600)
      const no =
        /\b(no|siwezi|sina|nope|sorry|apolog|regret|can(?:no|')?t|cannot|won'?t|will not|unable|not able|not going|not attend|another (?:meeting|commitment)|prior (?:engagement|commitment)|other commitments?|decline|miss(?:ing)? (?:it|this)|unfortunately)\b/.test(
          first,
        )
      const yes =
        /\b(yes|yeah|yep|sure|noted|nitakuja|niko|i(?:'| a)?m in|count me in|will attend|i will be there|i'?ll be there|see you (?:then|there)|attending|confirmed?|confirming)\b/.test(
          first,
        )
      const status = no ? 'no' : yes ? 'yes' : null

      if (status && creator?.id) {
        const { data: links } = await supabase
          .from('campaign_influencers')
          .select('campaign_id, campaigns(created_at)')
          .eq('influencer_id', creator.id)
        const target =
          campaignId ??
          (links ?? []).sort((a: any, b: any) =>
            String(b.campaigns?.created_at ?? '').localeCompare(String(a.campaigns?.created_at ?? '')),
          )[0]?.campaign_id ?? null
        if (target) {
          await supabase.from('event_rsvps').upsert(
            {
              campaign_id: target,
              influencer_id: creator.id,
              email: from.email,
              name: from.name || creator.full_name || null,
              status,
              source: 'email',
              note: textBody.slice(0, 300) || null,
              responded_at: new Date().toISOString(),
            },
            { onConflict: 'campaign_id,email' },
          )
        }
      }
    } catch (e) {
      console.error('rsvp capture failed', e)
    }

    return json({ ok: true, thread_id: threadId })
  } catch (e) {
    console.error('resend-inbound error', e)
    return json({ error: e instanceof Error ? e.message : 'unknown error' }, 500)
  }
})
