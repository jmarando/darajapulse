import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { renderAppEmail, sendAppEmail } from '../_shared/app-email.ts'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'

// Replaces the former app email endpoint used by the dashboard (invites,
// invoices, draft decisions, demo requests, previews). verify_jwt = true.
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON in request body' }, 400) }
  const templateName = body.templateName || body.template_name
  if (!templateName || !TEMPLATES[templateName]) return json({ error: 'Unknown template' }, 404)
  const templateData = body.templateData && typeof body.templateData === 'object' ? body.templateData : {}

  if (body.preview === true) {
    const { html, subject } = await renderAppEmail(templateName, templateData)
    return json({ preview: true, subject, html })
  }
  try {
    const result = await sendAppEmail({
      templateName,
      recipientEmail: body.recipientEmail || body.recipient_email,
      templateData,
      idempotencyKey: body.idempotencyKey || body.idempotency_key,
      from: typeof body.from === 'string' ? body.from : undefined,
      replyTo: typeof body.replyTo === 'string' ? body.replyTo : undefined,
    })
    return json(result.success ? { success: true, sent: true } : result)
  } catch (e) {
    const err = e as { message?: string; code?: string; status?: number }
    console.error('App email send failed', { templateName, code: err.code, status: err.status })
    return json({ error: err.message ?? 'Send failed', code: err.code }, err.status === 429 ? 429 : 500)
  }
})
