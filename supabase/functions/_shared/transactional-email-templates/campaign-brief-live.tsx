import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  brand_name?: string; campaign_name?: string; greeting_name?: string; brief_url?: string; submit_url?: string
  videos?: number; fee?: string; hashtag?: string; first_post_by?: string; custom_note?: string
  accent?: string; secondary?: string
}
const color = (value: string | undefined, fallback: string) => value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
const Email = ({ brand_name = 'Campaign', campaign_name = 'your campaign', greeting_name = 'there', brief_url, submit_url, videos, fee, hashtag, first_post_by, custom_note, accent, secondary }: Props) => {
  const primary = color(accent, '#146C65')
  const highlight = color(secondary, '#E09A38')
  return <Html lang="en" dir="ltr"><Head /><Preview>Your personal brief and submission link</Preview>
    <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: '#17252b', margin: 0 }}><Container style={{ maxWidth: 620, margin: '32px auto', border: '1px solid #dde5e5' }}>
      <Section style={{ backgroundColor: primary, padding: '24px 32px', borderBottom: `4px solid ${highlight}` }}><Text style={{ color: '#ffffff', fontWeight: 700, margin: 0 }}>{brand_name} × Daraja Pulse</Text></Section>
      <Section style={{ padding: '28px 32px' }}>
        <Heading style={{ fontSize: 24, color: '#17252b' }}>Hello {greeting_name}, your brief is ready</Heading>
        <Text style={{ lineHeight: 1.6 }}>Your personal brief for <strong>{campaign_name}</strong> includes your agreement and video submission link. Read and sign your agreement before uploading a video for approval. Please wait for approval before posting.</Text>
        {brief_url ? <Button href={brief_url} style={{ backgroundColor: primary, color: '#ffffff', padding: '12px 20px', textDecoration: 'none' }}>Open my brief and sign</Button> : null}
        {submit_url ? <Text><a href={submit_url} style={{ color: primary }}>My submission link</a></Text> : null}
        {videos ? <Text>Deliverables: <strong>{videos} Reels</strong>{hashtag ? <> · use <strong>{hashtag}</strong></> : null}.</Text> : null}
        {fee ? <Text>Your contracted fee: <strong>{fee}</strong> gross. Please check your signed agreement for payment terms.</Text> : null}
        {first_post_by ? <Text>First video due: {first_post_by}</Text> : null}
        {custom_note ? <Text>{custom_note}</Text> : null}
        <Text style={{ fontSize: 12, color: '#52616b', marginTop: 30 }}>Personal links are for you only. Reply to this email for help.</Text>
      </Section><Section style={{ backgroundColor: primary, padding: '16px 32px' }}><Text style={{ color: '#ffffff', fontSize: 12, margin: 0 }}>{brand_name} · Powered by Daraja Pulse</Text></Section>
    </Container></Body>
  </Html>
}
export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Your ${d?.brand_name || 'campaign'} brief, agreement and submission link — ${d?.campaign_name || 'Campaign'}`,
  displayName: 'Campaign brief and submission link',
  previewData: { brand_name: 'Campaign', campaign_name: 'New Campaign', greeting_name: 'Mary', brief_url: 'https://darajapulse.com/brief/example' },
} satisfies TemplateEntry