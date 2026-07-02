import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  invoice_number?: string
  bill_to?: string
  amount_kes?: number
  due_date?: string
  period_start?: string
  period_end?: string
  invoice_url?: string
  pay_url?: string | null
}

const INK = '#1c1714'
const PAPER = '#fbf6ee'
const ACCENT = '#fd1e1e'
const MUTED = '#6b635c'
const BORDER = '#ece4d6'
const LOGO_URL = 'https://darajapulse.com/favicon.png'

const main = { backgroundColor: '#ffffff', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', margin: 0, padding: 0, color: INK }
const outer = { backgroundColor: '#ffffff', padding: '32px 0' }
const container = { maxWidth: '560px', margin: '0 auto', backgroundColor: PAPER, borderRadius: '14px', overflow: 'hidden' as const, border: `1px solid ${BORDER}` }
const header = { backgroundColor: INK, padding: '22px 32px' }
const wordmark = { color: '#ffffff', fontSize: '15px', fontWeight: 700, letterSpacing: '0.02em', margin: 0 }
const body = { padding: '32px 32px 12px' }
const h1 = { fontSize: '24px', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em', margin: '0 0 14px', color: INK }
const text = { fontSize: 15, lineHeight: 1.6, color: INK, margin: '0 0 14px' }
const accentRule = { border: 'none', borderTop: `3px solid ${ACCENT}`, width: '36px', margin: '0 0 18px' }
const btn = { backgroundColor: ACCENT, color: '#ffffff', borderRadius: '8px', padding: '13px 26px', fontSize: '14px', fontWeight: 700, textDecoration: 'none', display: 'inline-block', margin: '6px 8px 18px 0' }
const btnGhost = { backgroundColor: '#ffffff', color: INK, border: `1px solid ${INK}`, borderRadius: '8px', padding: '12px 24px', fontSize: '14px', fontWeight: 600, textDecoration: 'none', display: 'inline-block', margin: '6px 0 18px' }
const summary = { backgroundColor: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '18px 20px', margin: '4px 0 22px' }
const row = { fontSize: 13, color: MUTED, margin: '0 0 4px' }
const rowStrong = { fontSize: 22, fontWeight: 700, color: INK, margin: '4px 0 0', letterSpacing: '-0.01em' }
const bankBlock = { backgroundColor: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '16px 20px', margin: '0 0 18px', fontSize: 13, lineHeight: 1.6, color: INK }
const small = { fontSize: 12, lineHeight: 1.55, color: MUTED, margin: '0 0 6px' }
const footer = { padding: '18px 32px 26px', fontSize: '11px', color: MUTED, textAlign: 'center' as const, letterSpacing: '0.04em', textTransform: 'uppercase' as const }

const fmtKES = (n?: number) => typeof n === 'number' ? new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(n) : '—'
const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

const InvoiceNotification = ({ invoice_number, bill_to, amount_kes, due_date, period_start, period_end, invoice_url, pay_url }: Props) => {
  const url = invoice_url || 'https://darajapulse.com'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`Invoice ${invoice_number || ''} · ${fmtKES(amount_kes)} due ${fmtDate(due_date)}`}</Preview>
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
              <Heading style={h1}>Invoice {invoice_number}</Heading>
              <Text style={text}>
                Hello {bill_to || 'there'}, please find your Daraja Pulse invoice below. Payment is due within
                <strong> 14 days</strong> of the issue date.
              </Text>

              <Section style={summary}>
                <Text style={row}>Amount due</Text>
                <Text style={rowStrong}>{fmtKES(amount_kes)}</Text>
                <Text style={{ ...row, marginTop: 14 }}>Due date · <strong style={{ color: INK }}>{fmtDate(due_date)}</strong></Text>
                <Text style={row}>Period · {fmtDate(period_start)} – {fmtDate(period_end)}</Text>
              </Section>

              {pay_url ? (
                <>
                  <Button style={btn} href={pay_url}>Pay online →</Button>
                  <Button style={btnGhost} href={url}>View / download invoice</Button>
                </>
              ) : (
                <Button style={btn} href={url}>View / download invoice</Button>
              )}

              <Text style={{ ...text, marginTop: 8, fontWeight: 600 }}>Bank transfer</Text>
              <Section style={bankBlock}>
                Account name: <strong>LANA BESPOKE LIMITED</strong><br />
                Account no.: <strong>1006114657</strong> (KES)<br />
                Bank: <strong>NCBA Bank Kenya PLC</strong><br />
                Branch: <strong>NCBA House Branch</strong><br />
                Reference: <strong>{invoice_number}</strong>
              </Section>

              <Text style={small}>
                You can also pay by M-Pesa or card via the secure Pesapal link on the invoice page. Payment is confirmed
                automatically.
              </Text>
              <Text style={small}>Questions? Reply to this email or contact finance@darajapulse.com.</Text>
            </Section>
            <Section style={footer}>Daraja Pulse — Influence, measured.</Section>
          </Container>
        </Section>
      </Body>
    </Html>
  )
}

export const template = {
  component: InvoiceNotification,
  subject: (d: Record<string, any>) => `Invoice ${d.invoice_number || ''} from Daraja Pulse`,
  displayName: 'Invoice notification',
  previewData: {
    invoice_number: 'INV-2026-1002',
    bill_to: 'Reys and Meys Limited',
    amount_kes: 50000,
    due_date: '2026-07-16',
    period_start: '2026-07-02',
    period_end: '2026-10-02',
    invoice_url: 'https://darajapulse.com/invoice/abc',
    pay_url: null,
  },
} satisfies TemplateEntry
