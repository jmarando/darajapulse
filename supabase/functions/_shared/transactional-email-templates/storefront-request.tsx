import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import type { RequestEmail } from '../storefront-request.ts'

// To the media house: someone asked for a quote on its storefront.

const INK = '#1c1714'
const PAPER = '#fbf6ee'
const ACCENT = '#fd1e1e'
const MUTED = '#6b635c'
const BORDER = '#ece4d6'

const main = { backgroundColor: '#ffffff', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', margin: 0, padding: 0, color: INK }
const outer = { backgroundColor: '#ffffff', padding: '32px 0' }
const container = { maxWidth: '560px', margin: '0 auto', backgroundColor: PAPER, borderRadius: '14px', overflow: 'hidden' as const, border: `1px solid ${BORDER}` }
const body = { padding: '28px 32px 12px' }
const h1 = { fontSize: '22px', fontWeight: 700, lineHeight: 1.25, margin: '0 0 12px', color: INK }
const text = { fontSize: 15, lineHeight: 1.6, color: INK, margin: '0 0 12px' }
const label = { fontSize: 11, lineHeight: 1.4, color: MUTED, margin: '16px 0 4px', letterSpacing: '0.06em', textTransform: 'uppercase' as const }
const value = { fontSize: 15, lineHeight: 1.5, color: INK, margin: '0 0 4px', fontWeight: 600 }
const item = { fontSize: 14, lineHeight: 1.5, color: INK, margin: '0 0 6px' }
const quiet = { color: MUTED, fontWeight: 400 }
const accentRule = { border: 'none', borderTop: `3px solid ${ACCENT}`, width: '36px', margin: '0 0 16px' }
const button = { backgroundColor: INK, color: '#ffffff', borderRadius: '999px', padding: '11px 20px', fontSize: 14, fontWeight: 600, textDecoration: 'none', display: 'inline-block', marginTop: 18 }
const footer = { padding: '16px 32px 22px', fontSize: '11px', color: MUTED, textAlign: 'center' as const, letterSpacing: '0.04em', textTransform: 'uppercase' as const }

const StorefrontRequest = (d: Partial<RequestEmail>) => {
  const who = d.company ? `${d.contactName} from ${d.company}` : d.contactName || 'Someone'
  const items = d.items ?? []
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${who} asked for a quote on ${items.length} item${items.length === 1 ? '' : 's'}`}</Preview>
      <Body style={main}>
        <Section style={outer}>
          <Container style={container}>
            <Section style={body}>
              <Hr style={accentRule} />
              <Heading style={h1}>New quote request</Heading>
              <Text style={text}>{who} asked for a quote on {d.houseName}'s storefront. Reply within a day to keep it warm.</Text>

              <Text style={label}>What they picked</Text>
              {items.map((i, n) => (
                <Text key={n} style={item}>
                  {i.title} <span style={quiet}>· {i.kind}{i.deliverable ? ` · ${i.deliverable}` : ''}</span>
                </Text>
              ))}

              {d.budget && (<><Text style={label}>Budget</Text><Text style={value}>{d.budget}</Text></>)}
              {d.dates && (<><Text style={label}>Dates</Text><Text style={value}>{d.dates}</Text></>)}

              <Text style={label}>Contact</Text>
              <Text style={value}>{d.contactName}{d.company ? ` · ${d.company}` : ''}</Text>
              <Text style={item}>{d.contactEmail}{d.contactPhone ? ` · ${d.contactPhone}` : ''}</Text>

              {d.message && (<><Text style={label}>Their note</Text><Text style={{ ...text, whiteSpace: 'pre-wrap' }}>{d.message}</Text></>)}
              {d.brief && (<><Text style={label}>Brief they planned with</Text><Text style={{ ...text, whiteSpace: 'pre-wrap' }}>{d.brief}</Text></>)}

              {d.requestsUrl && <Button href={d.requestsUrl} style={button}>Open requests</Button>}
              <Text style={{ ...text, fontSize: 13, color: MUTED, marginTop: 14 }}>Reply to this email to answer {d.contactName || 'them'} directly.</Text>
            </Section>
            <Section style={footer}>{d.houseName} storefront · Daraja Pulse</Section>
          </Container>
        </Section>
      </Body>
    </Html>
  )
}

export const template = {
  component: StorefrontRequest,
  subject: (d: Record<string, any>) => {
    const n = Array.isArray(d.items) ? d.items.length : 0
    return `Quote request: ${d.company || d.contactName || 'new lead'} (${n} item${n === 1 ? '' : 's'})`
  },
  displayName: 'Storefront quote request',
  previewData: {
    houseName: 'Radio Africa Group',
    contactName: 'Wanjiru Kamau',
    contactEmail: 'wanjiru@example.com',
    contactPhone: '+254 700 000 000',
    company: 'Example Agency',
    items: [
      { title: 'Classic 105: breakfast show sponsorship', kind: 'On air', deliverable: 'Show sponsorship, 4 weeks' },
      { title: 'Maina Kageni', kind: 'Talent', deliverable: 'Show sponsorship or live read' },
      { title: 'Mpasho on TikTok', kind: 'Channel', deliverable: 'Branded TikTok video' },
    ],
    budget: 'KES 2,500,000',
    dates: '1 Dec 2026 to 31 Dec 2026',
    message: 'Launching a festive campaign for mobile money. Can we add presenter reels?',
    brief: null,
    requestsUrl: 'https://darajapulse.com/app/inventory?tab=requests',
  },
} satisfies TemplateEntry
