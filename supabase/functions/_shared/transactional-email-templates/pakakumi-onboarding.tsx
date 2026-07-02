import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  greeting_name?: string
  workspace_url?: string
  tracker_url?: string
  invoice_url?: string
  payment_url?: string
  amount_kes?: string
  invoice_number?: string
  due_date?: string
}

const INK = '#1c1714'
const PAPER = '#fbf6ee'
const ACCENT = '#fd1e1e'
const MUTED = '#6b635c'
const BORDER = '#ece4d6'
const CARD = '#ffffff'
const LOGO_URL = 'https://darajapulse.com/favicon.png'

const main = { backgroundColor: '#ffffff', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', margin: 0, padding: 0, color: INK }
const outer = { backgroundColor: '#ffffff', padding: '32px 0' }
const container = { maxWidth: '620px', margin: '0 auto', backgroundColor: PAPER, borderRadius: '14px', overflow: 'hidden' as const, border: `1px solid ${BORDER}` }
const header = { backgroundColor: INK, padding: '22px 32px' }
const wordmark = { color: '#ffffff', fontSize: '15px', fontWeight: 700, letterSpacing: '0.02em', margin: 0 }
const body = { padding: '32px 32px 8px' }
const h1 = { fontSize: '24px', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em', margin: '0 0 14px', color: INK }
const h2 = { fontSize: '15px', fontWeight: 700, lineHeight: 1.3, margin: '0 0 10px', color: INK, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }
const text = { fontSize: 15, lineHeight: 1.65, color: INK, margin: '0 0 12px' }
const li = { fontSize: 14.5, lineHeight: 1.6, color: INK, margin: '0 0 6px' }
const accentRule = { border: 'none', borderTop: `3px solid ${ACCENT}`, width: '36px', margin: '0 0 18px' }
const card = { backgroundColor: CARD, borderRadius: '10px', border: `1px solid ${BORDER}`, padding: '18px 20px', margin: '4px 0 20px' }
const btn = { backgroundColor: ACCENT, color: '#ffffff', borderRadius: '8px', padding: '13px 26px', fontSize: '14px', fontWeight: 700, letterSpacing: '0.01em', textDecoration: 'none', display: 'inline-block', margin: '4px 8px 8px 0' }
const btnGhost = { ...btn, backgroundColor: INK }
const small = { fontSize: 12, lineHeight: 1.55, color: MUTED, margin: '0 0 4px' }
const kv = { fontSize: 13.5, lineHeight: 1.7, color: INK, margin: 0 }
const label = { color: MUTED, fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }
const footer = { padding: '18px 32px 26px', fontSize: '11px', color: MUTED, textAlign: 'center' as const, letterSpacing: '0.04em', textTransform: 'uppercase' as const }

const PakakumiOnboarding = ({
  greeting_name = 'team',
  workspace_url = 'https://pakakumi.darajapulse.com',
  tracker_url,
  invoice_url,
  payment_url,
  amount_kes,
  invoice_number,
  due_date,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to Daraja Pulse — your Pakakumi workspace, tracker & invoice</Preview>
    <Body style={main}>
      <Section style={outer}>
        <Container style={container}>
          <Section style={header}>
            <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
              <tr>
                <td style={{ paddingRight: 10 }}>
                  <Img src={LOGO_URL} width="28" height="28" alt="Daraja Pulse" style={{ display: 'block', borderRadius: 6 }} />
                </td>
                <td><Text style={wordmark}>DARAJA PULSE</Text></td>
              </tr>
            </table>
          </Section>

          <Section style={body}>
            <Hr style={accentRule} />
            <Heading style={h1}>Welcome to Daraja Pulse, {greeting_name} 👋</Heading>
            <Text style={text}>
              We're excited to have <strong>Pakakumi</strong> on board. Below is everything you need to get set up —
              workspace access, the influencer tracker, and your first invoice with payment details.
            </Text>

            <Hr style={{ borderColor: BORDER, margin: '10px 0 22px' }} />

            {/* 1. Workspace */}
            <Text style={h2}>1 · Your workspace</Text>
            <Text style={text}>
              Your dedicated workspace lives at <strong>pakakumi.darajapulse.com</strong>. We've invited:
            </Text>
            <Text style={li}>• <strong>Nelius</strong> (nelius@reysandmeys.com) — Brand Admin</Text>
            <Text style={li}>• <strong>Grace</strong> (grace@reysandmeys.com) — Day-to-day user</Text>
            <Text style={li}>• <strong>Alex</strong> (alex@reysandmeys.com) — Day-to-day user & Billing</Text>
            <Button style={btn} href={workspace_url}>Open Pakakumi workspace →</Button>

            <Hr style={{ borderColor: BORDER, margin: '18px 0 22px' }} />

            {/* 2. Tracker */}
            <Text style={h2}>2 · Influencer tracker (Google Sheet)</Text>
            <Text style={text}>
              We've prepared a formatted tracker with 5 tabs — <em>Read me first</em>, <em>Influencers</em>,{' '}
              <em>Posts to track</em>, <em>Hashtags &amp; mentions</em>, and <em>Campaigns &amp; contests</em>. Fill it in
              and share it back with us; we'll import it into your workspace.
            </Text>
            {tracker_url ? (
              <Button style={btnGhost} href={tracker_url}>Open the tracker →</Button>
            ) : (
              <Text style={small}>We'll send the shared Google Sheet link in a follow-up.</Text>
            )}

            <Hr style={{ borderColor: BORDER, margin: '18px 0 22px' }} />

            {/* 3. Invoice + payment */}
            <Text style={h2}>3 · Invoice &amp; payment details</Text>
            <Text style={text}>
              Invoices are sent to <strong>finance@darajapulse.com</strong> (cc <strong>justin@darajapulse.com</strong>).
              Your first invoice is ready:
            </Text>

            <Section style={card}>
              <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%">
                <tr>
                  <td style={{ paddingBottom: 6 }}>
                    <Text style={label as any}>Invoice</Text>
                    <Text style={kv}>{invoice_number || '—'}</Text>
                  </td>
                  <td style={{ paddingBottom: 6, textAlign: 'right' as const }}>
                    <Text style={label as any}>Amount</Text>
                    <Text style={{ ...kv, fontWeight: 700 }}>{amount_kes ? `KES ${amount_kes}` : '—'}</Text>
                  </td>
                </tr>
                <tr>
                  <td>
                    <Text style={label as any}>Due</Text>
                    <Text style={kv}>{due_date || '—'}</Text>
                  </td>
                  <td style={{ textAlign: 'right' as const }}>
                    <Text style={label as any}>Billed to</Text>
                    <Text style={kv}>Pakakumi (Reys &amp; Meys)</Text>
                  </td>
                </tr>
              </table>
            </Section>

            {invoice_url && <Button style={btnGhost} href={invoice_url}>View invoice →</Button>}
            {payment_url && <Button style={btn} href={payment_url}>Pay now (M-Pesa / Card) →</Button>}

            <Text style={{ ...small, marginTop: 10 }}>
              Payments are processed securely via <strong>Pesapal</strong> — M-Pesa, Airtel Money, Visa &amp; Mastercard
              are all supported. A receipt is emailed to finance automatically once the payment clears.
            </Text>

            <Hr style={{ borderColor: BORDER, margin: '22px 0 18px' }} />

            <Text style={h2}>Need anything?</Text>
            <Text style={text}>
              Reach out to <a href="mailto:justin@darajapulse.com" style={{ color: INK }}>justin@darajapulse.com</a> for
              platform &amp; onboarding, or <a href="mailto:finance@darajapulse.com" style={{ color: INK }}>finance@darajapulse.com</a>{' '}
              for invoices &amp; payments.
            </Text>

            <Text style={{ ...text, marginTop: 16 }}>Karibu Daraja Pulse.<br/>— Justin &amp; the Daraja Pulse team</Text>
          </Section>

          <Section style={footer}>Daraja Pulse — Influence, measured.</Section>
        </Container>
      </Section>
    </Body>
  </Html>
)

export const template = {
  component: PakakumiOnboarding,
  subject: 'Welcome to Daraja Pulse — your Pakakumi workspace, tracker & invoice',
  displayName: 'Pakakumi onboarding',
  previewData: {
    greeting_name: 'Nelius, Grace & Alex',
    workspace_url: 'https://pakakumi.darajapulse.com',
    invoice_url: 'https://darajapulse.com/invoice/preview',
    payment_url: 'https://darajapulse.com/invoice/preview',
    amount_kes: '75,000',
    invoice_number: 'INV-2026-0001',
    due_date: '16 July 2026',
  },
} satisfies TemplateEntry
