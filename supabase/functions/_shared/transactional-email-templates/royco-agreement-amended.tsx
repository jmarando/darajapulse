import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import { main, container, innerPad, text, muted, buttonStyle } from './_brand.ts'
import { resolveCampaignBrand } from '../campaign-brand.ts'
import type { TemplateEntry } from './registry.ts'

const RoycoAmended = ({ greeting_name = 'there', brief_url, pdf_url, signed = false, review = false }: Record<string, any>) => {
  const royco = resolveCampaignBrand('Royco')
  return <Html><Head /><Preview>Royco agreement: corrected term 16 September to 16 October 2026</Preview>
    <Body style={main}><Container style={container}><Section style={innerPad}>
      <Text style={{ ...text, color: royco.accent, fontWeight: 700 }}>Royco × Daraja Pulse</Text>
      <Heading>{review ? 'Review sample: corrected Royco agreement' : signed ? 'Your amended agreement copy' : 'Please review and re-sign your Royco agreement'}</Heading>
      <Text style={text}>Hello {greeting_name},</Text>
      <Text style={text}>{signed ? 'Thank you for signing the amended agreement.' : 'We are sorry for the inconsistent campaign dates in the earlier agreement and brief.'} The corrected contract period is <strong>16 September to 16 October 2026</strong>.</Text>
      <Text style={text}>All other contract terms remain unchanged. Previously recorded campaign posts and payment eligibility are preserved. Your earlier signed agreement remains on record; its signature is not carried over to the amended wording.</Text>
      {review && <Text style={text}>This is an unsigned review sample. No creator invitations have been sent.</Text>}
      {pdf_url && <Button href={pdf_url} style={buttonStyle(royco.accent)}>{signed ? 'Download my signed agreement' : 'Review unsigned PDF sample'}</Button>}
      {!signed && !review && brief_url && <Button href={brief_url} style={buttonStyle(royco.accent)}>Review and re-sign my agreement</Button>}
      <Text style={muted}>Your existing submission link and drafts are unchanged. Reply to this email if you need help. PDF download links expire after seven days; your brief page can provide a fresh link.</Text>
    </Section></Container></Body></Html>
  }
}
export const template = {
  component: RoycoAmended,
  subject: (d: Record<string, any>) => d.review ? 'Review sample: amended Royco agreement (16 Sep – 16 Oct 2026)' : d.signed ? 'Your signed amended Royco agreement (16 Sep – 16 Oct 2026)' : 'Updated Royco agreement: please re-sign (16 Sep – 16 Oct 2026)',
  displayName: 'Royco amended agreement',
  previewData: { greeting_name: 'Ann', review: true },
} satisfies TemplateEntry