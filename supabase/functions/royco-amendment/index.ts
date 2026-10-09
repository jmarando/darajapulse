import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3.25.76'
import { agreementPdf } from './pdf.ts'
import { sendAppEmail, renderAppEmail } from '../_shared/app-email.ts'
import { resolveCampaignBrand } from '../_shared/campaign-brand.ts'

const campaignId = '00c5d644-349a-4320-8321-3c7aca3db6ac'
const schema = z.object({ action: z.enum(['review', 'process', 'download', 'preview']), token: z.string().min(16).max(128).optional() })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) return json({ error: 'Invalid request' }, 400)
    const { action, token } = parsed.data
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const brand = resolveCampaignBrand('Royco')
    if (action === 'download') {
      if (!token) return json({ error: 'Personal link required' }, 400)
      const { data: contract } = await db.rpc('get_contract_amendment_by_token', { _token: token })
      if (!contract?.amendment_signature_id) return json({ error: 'Amended agreement is not signed yet' }, 404)
      const { data: s } = await db.from('contract_amendment_signatures').select('pdf_path').eq('id', contract.amendment_signature_id).single()
      if (!s?.pdf_path) return json({ error: 'Your PDF is being prepared. Please try again shortly.' }, 409)
      const { data, error } = await db.storage.from('contract-pdfs').createSignedUrl(s.pdf_path, 604800, { download: 'Royco-amended-agreement.pdf' })
      if (error) throw error
      return json({ url: data.signedUrl })
    }
    const { data: key } = await db.from('internal_job_keys').select('key').eq('name', 'royco-amendment').maybeSingle()
    const job = action === 'process' && key?.key && req.headers.get('x-job-key') === key.key
    if (!job) {
      const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
      const { data: user } = await auth.auth.getUser()
      if (!user.user) return json({ error: 'Sign in required' }, 401)
      const [staff, admin] = await Promise.all([db.rpc('agency_staff_on_campaign', { _user_id: user.user.id, _campaign_id: campaignId }), db.rpc('is_super_admin', { _user_id: user.user.id })])
      if (!staff.data && !admin.data) return json({ error: 'You do not have access to this campaign' }, 403)
    }
    if (action === 'review' || action === 'preview') {
      const { data: amendment, error } = await db.from('contract_amendments').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(1).single()
      if (error) throw error
      const sample = amendment.body.replaceAll('{{creator_name}}', 'Ann Kerubo Ongoro').replaceAll('{{handle}}', '@annongoro').replaceAll('{{campaign}}', 'Royco Q3 Nano').replaceAll('{{period}}', '2026-09-16 to 2026-10-16').replaceAll('{{governing_law}}', 'Republic of Kenya')
      const bytes = await agreementPdf(sample)
      const path = `review/${amendment.id}.pdf`
      const uploaded = await db.storage.from('contract-pdfs').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
      if (uploaded.error) throw uploaded.error
      const { data: link, error: linkError } = await db.storage.from('contract-pdfs').createSignedUrl(path, 604800, { download: 'Royco-amended-agreement-UNSIGNED-review.pdf' })
      if (linkError) throw linkError
      const data = { greeting_name: 'Justin', review: true, pdf_url: link.signedUrl }
      if (action === 'preview') return json({ ...await renderAppEmail('royco-agreement-amended', data), pdf_url: link.signedUrl })
      return json(await sendAppEmail({ templateName: 'royco-agreement-amended', recipientEmail: 'justin@glab.africa', templateData: data, from: brand.from, replyTo: brand.replyTo, idempotencyKey: `royco-amend-review-${amendment.id}` }))
    }
    const { data: jobs, error } = await db.rpc('claim_amendment_pdf_jobs')
    if (error) throw error
    let sent = 0; let failed = 0
    for (const s of jobs ?? []) {
      try {
        const { data: ci } = await db.from('campaign_influencers').select('campaign_id,influencer_id').eq('id', s.campaign_influencer_id).single()
        if (ci?.campaign_id !== campaignId) throw new Error('Unexpected campaign')
        const { data: creator } = await db.from('influencers').select('email').eq('id', ci.influencer_id).single()
        if (!creator?.email) throw new Error('Creator email missing')
        const path = s.pdf_path || `signed/${s.amendment_id}/${s.id}.pdf`
        if (!s.pdf_path) {
          const bytes = await agreementPdf(s.contract_text, s.signer_name, s.signed_at, s.signature_data_url)
          const upload = await db.storage.from('contract-pdfs').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
          if (upload.error) throw upload.error
          const saved = await db.from('contract_amendment_signatures').update({ pdf_path: path }).eq('id', s.id)
          if (saved.error) throw saved.error
        }
        const { data: link, error: urlError } = await db.storage.from('contract-pdfs').createSignedUrl(path, 604800, { download: 'Royco-amended-agreement.pdf' })
        if (urlError) throw urlError
        const result = await sendAppEmail({ templateName: 'royco-agreement-amended', recipientEmail: creator.email, templateData: { greeting_name: s.signer_name.split(' ')[0], signed: true, pdf_url: link.signedUrl }, from: brand.from, replyTo: brand.replyTo, idempotencyKey: `royco-amend-signed-${s.id}` })
        const saved = await db.from('contract_amendment_signatures').update({ emailed_at: new Date().toISOString(), processing_at: null, last_error: result.success ? null : 'Email suppressed' }).eq('id', s.id)
        if (saved.error) throw saved.error
        sent += Number(result.success)
      } catch (error) {
        failed++
        await db.from('contract_amendment_signatures').update({ processing_at: null, retry_after: new Date(Date.now() + 3600000).toISOString(), last_error: String(error).slice(0, 500) }).eq('id', s.id)
      }
    }
    await db.rpc('drain_amendment_pdf_retries')
    return json({ sent, failed })
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not prepare agreement' }, 500) }
})