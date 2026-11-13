import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import type { RequestEmail } from '../storefront-request.ts'

// To the person who asked: a receipt for their quote request.

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
const footer = { padding: '16px 32px 22px', fontSize: '11px', color: MUTED, textAlign: 'center' as const, letterSpacing: '0.04em', textTransform: 'uppercase' as const }

const StorefrontRequestReceived = (d: Partial<RequestEmail>) => {
  const items = d.items ?? []
  const first = (d.contactName || '').split(/\s+/)[0]
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`Your request to ${d.houseName} is in. Expect a reply within a day.`}</Preview>
      <Body style={main}>
        <Section style={outer}>
          <Container style={container}>
            <Section style={body}>
              <Hr style={accentRule} />
              <Heading style={h1}>We have your request</Heading>
              <Text style={text}>
                {first ? `Thanks, ${first}. ` : 'Thanks. '}Your request for {items.length} item{items.length === 1 ? '' : 's'} from {d.houseName} is in,
                and you'll get a quote within a day. Reply to this email if you want to add anything.
              </Text>

              <Text style={label}>What you picked</Text>
              {items.map((i, n) => (
                <Text key={n} style={item}>
                  {i.title} <span style={quiet}>· {i.kind}{i.deliverable ? ` · ${i.deliverable}` : ''}</span>
                </Text>
              ))}

              {d.budget && (<><Text style={label}>Budget</Text><Text style={value}>{d.budget}</Text></>)}
              {d.dates && (<><Text style={label}>Dates</Text><Text style={value}>{d.dates}</Text></>)}
              {d.message && (<><Text style={label}>Your note</Text><Text style={{ ...text, whiteSpace: 'pre-wrap' }}>{d.message}</Text></>)}
            </Section>
            <Section style={footer}>{d.houseName} storefront · Daraja Pulse</Section>
          </Container>
        </Section>
      </Body>
    </Html>
  )
}

export const template = {
  component: StorefrontRequestReceived,
  subject: (d: Record<string, any>) => `Your request to ${d.houseName || 'the media house'}`,
  displayName: 'Storefront request receipt',
  previewData: {
    houseName: 'Radio Africa Group',
    contactName: 'Wanjiru Kamau',
    contactEmail: 'wanjiru@example.com',
    company: 'Example Agency',
    items: [
      { title: 'Classic 105: breakfast show sponsorship', kind: 'On air', deliverable: 'Show sponsorship, 4 weeks' },
      { title: 'Mpasho on TikTok', kind: 'Channel', deliverable: 'Branded TikTok video' },
    ],
    budget: 'KES 2,500,000',
    dates: '1 Dec 2026 to 31 Dec 2026',
    message: 'Launching a festive campaign for mobile money.',
  },
} satisfies TemplateEntry
