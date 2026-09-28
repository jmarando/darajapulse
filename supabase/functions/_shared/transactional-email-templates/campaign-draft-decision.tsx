import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  brand_name?: string
  campaign_name?: string
  greeting_name?: string
  decision?: string
  review_note?: string
  reviewer_label?: string
  hashtag?: string
  submit_url?: string
  accent?: string
  secondary?: string
}
const color = (value: string | undefined, fallback: string) => value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
const Email = ({ brand_name = 'Campaign', campaign_name = 'your campaign', greeting_name = 'there', decision = 'approved', review_note, reviewer_label, hashtag, submit_url, accent, secondary }: Props) => {
  const primary = color(accent, '#146C65')
  const highlight = color(secondary, '#E09A38')
  const approved = decision === 'approved'
  return <Html lang="en" dir="ltr"><Head /><Preview>{approved ? 'Your video is approved' : 'Changes requested on your video'}</Preview>
    <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: '#17252b', margin: 0 }}>
      <Container style={{ maxWidth: 620, margin: '32px auto', border: '1px solid #dde5e5' }}>
        <Section style={{ backgroundColor: primary, padding: '24px 32px', borderBottom: `4px solid ${highlight}` }}><Text style={{ color: '#ffffff', fontWeight: 700, margin: 0 }}>{brand_name} × Daraja Pulse</Text></Section>
        <Section style={{ padding: '28px 32px' }}>
          <Heading style={{ fontSize: 24, color: '#17252b' }}>{approved ? `Hello ${greeting_name}, your video is approved` : `Hello ${greeting_name}, a few changes are needed`}</Heading>
          <Text style={{ lineHeight: 1.6 }}>{approved ? <>Your video for <strong>{campaign_name}</strong> is approved. You can post it now{hashtag ? <> using <strong>{hashtag}</strong></> : null}. Once live, share the link so it can be tracked.</> : <>Thanks for sending your video for <strong>{campaign_name}</strong>. Please make these changes before posting it.</>}</Text>
          {review_note ? <Text style={{ borderLeft: `4px solid ${highlight}`, padding: '12px 18px', backgroundColor: '#f4f7f7' }}><strong>Feedback{reviewer_label ? ` from ${reviewer_label}` : ''}:</strong> {review_note}</Text> : null}
          {submit_url ? <Button href={submit_url} style={{ backgroundColor: primary, color: '#ffffff', padding: '12px 20px', textDecoration: 'none' }}>{approved ? 'Share my live link' : 'Upload my revised video'}</Button> : null}
          <Text style={{ fontSize: 12, color: '#52616b', marginTop: 30 }}>Questions? Reply to this email and the team will help.</Text>
        </Section>
        <Section style={{ backgroundColor: primary, padding: '16px 32px' }}><Text style={{ color: '#ffffff', fontSize: 12, margin: 0 }}>{brand_name} · Powered by Daraja Pulse</Text></Section>
      </Container>
    </Body>
  </Html>
}
export const template = {
  component: Email,
  subject: (d: Record<string, any>) => d?.decision === 'changes_requested' ? `Changes needed on your ${d?.brand_name || 'campaign'} video` : `Your ${d?.brand_name || 'campaign'} video is approved`,
  displayName: 'Campaign video decision',
  previewData: { brand_name: 'OMO', campaign_name: 'OMO Q4 Nano Influencer Campaign', greeting_name: 'Mary', decision: 'approved', accent: '#0033A0', secondary: '#FF5A00' },
} satisfies TemplateEntry