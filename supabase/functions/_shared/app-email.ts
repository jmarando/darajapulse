import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { EmailAPIError, sendLovableEmail } from 'npm:@lovable.dev/email-js@0.1.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TEMPLATES } from './transactional-email-templates/registry.ts'

// Server-only managed send path that preserves this app's per-campaign sender
// identities (e.g. "OMO x Daraja Pulse <omo@notify.darajapulse.com>").
const SITE_NAME = 'Daraja Pulse'
const SENDER_DOMAIN = 'notify.darajapulse.com'
const FROM_DOMAIN = 'notify.darajapulse.com'

const domainOf = (v: string) =>
  (v.match(/<([^>]+)>/)?.[1] || v).trim().toLowerCase().split('@')[1] || ''

export interface AppEmailInput {
  templateName: string
  recipientEmail?: string
  templateData?: Record<string, any>
  idempotencyKey?: string
  from?: string
  replyTo?: string
}

export type AppEmailResult =
  | { success: true; sent: true }
  | { success: false; reason: 'email_suppressed' }

export async function renderAppEmail(templateName: string, templateData: Record<string, any> = {}) {
  const template = TEMPLATES[templateName]
  if (!template) throw new Error(`Template '${templateName}' not found`)
  const html = await renderAsync(React.createElement(template.component, templateData))
  const subject = typeof template.subject === 'function' ? template.subject(templateData) : template.subject
  return { html, subject }
}

async function log(row: Record<string, unknown>) {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return
  const { error } = await createClient(url, key).from('email_send_log').insert(row)
  if (error) console.error('email_send_log insert failed', { code: error.code, message: error.message })
}

export async function sendAppEmail(input: AppEmailInput): Promise<AppEmailResult> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!apiKey) throw new Error('LOVABLE_API_KEY is not configured')
  const template = TEMPLATES[input.templateName]
  if (!template) throw new Error(`Template '${input.templateName}' not found`)
  const recipient = template.to || input.recipientEmail
  if (!recipient) throw new Error('recipientEmail is required')

  const data = input.templateData ?? {}
  const element = React.createElement(template.component, data)
  const html = await renderAsync(element)
  const text = await renderAsync(element, { plainText: true })
  const subject = typeof template.subject === 'function' ? template.subject(data) : template.subject

  const rawFrom = (input.from || '').trim()
  const from = rawFrom && domainOf(rawFrom).endsWith('darajapulse.com') ? rawFrom : `${SITE_NAME} <noreply@${FROM_DOMAIN}>`
  const rawReply = (input.replyTo || '').trim()
  const replyTo = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawReply) ? rawReply : undefined

  const base = { message_id: null, template_name: input.templateName, recipient_email: recipient }
  try {
    await sendLovableEmail(
      {
        to: recipient,
        from,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: 'transactional',
        label: input.templateName,
        idempotency_key: input.idempotencyKey || crypto.randomUUID(),
        reply_to: replyTo,
      },
      { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') },
    )
  } catch (error) {
    if (error instanceof EmailAPIError && error.code === 'recipient_suppressed') {
      await log({ ...base, status: 'suppressed' })
      return { success: false, reason: 'email_suppressed' }
    }
    await log({ ...base, status: 'failed', error_message: String((error as Error)?.message ?? error).slice(0, 1000) })
    throw error
  }
  await log({ ...base, status: 'sent' })
  return { success: true, sent: true }
}
