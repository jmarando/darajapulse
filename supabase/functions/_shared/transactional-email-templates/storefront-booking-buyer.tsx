import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// A storefront booking's emails: to the buyer at each step (this template) and to the house (storefront-booking-house).
// The wording comes from buyerCopy / houseCopy in storefront-booking-status.ts; storefront-booking-mail.ts fills the rest.

export type BookingEmailData = {
  copy: { subject: string; heading: string; body: string; button: string }
  house: { name: string; logo_url?: string | null; primary_color?: string | null }
  ref: string
  lines: { title: string; what: string; amount: string }[]
  totals: { media: string; production: string | null; vat: string; total: string }
  url: string
  bank: null | {
    account_name: string | null; bank_name: string | null; bank_branch: string | null; account_number: string | null
    paybill: string | null; paybill_account: string | null; reference: string
  }
}

const INK = '#1c1714'
const PAPER = '#fbf6ee'
const MUTED = '#6b635c'
const BORDER = '#ece4d6'

const main = { backgroundColor: '#ffffff', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', margin: 0, padding: 0, color: INK }
const outer = { backgroundColor: '#ffffff', padding: '32px 0' }
const container = { maxWidth: '560px', margin: '0 auto', backgroundColor: PAPER, borderRadius: '14px', overflow: 'hidden' as const, border: `1px solid ${BORDER}` }
const body = { padding: '28px 32px 12px' }
const h1 = { fontSize: '22px', fontWeight: 700, lineHeight: 1.25, margin: '0 0 12px', color: INK }
const text = { fontSize: 15, lineHeight: 1.6, color: INK, margin: '0 0 12px' }
const label = { fontSize: 11, lineHeight: 1.4, color: MUTED, margin: '18px 0 6px', letterSpacing: '0.06em', textTransform: 'uppercase' as const }
const row = { fontSize: 14, lineHeight: 1.45, color: INK, margin: '0 0 8px' }
const quiet = { color: MUTED, fontWeight: 400 }
const sum = { fontSize: 14, lineHeight: 1.5, color: INK, margin: '0 0 2px' }
const total = { fontSize: 16, lineHeight: 1.5, color: INK, margin: '6px 0 0', fontWeight: 700 }
const bankBox = { backgroundColor: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '12px 16px', margin: '8px 0 4px' }
const bankLine = { fontSize: 14, lineHeight: 1.5, color: INK, margin: '0 0 2px' }
const footer = { padding: '16px 32px 22px', fontSize: '11px', color: MUTED, textAlign: 'center' as const, letterSpacing: '0.04em', textTransform: 'uppercase' as const }

export const BookingEmail = (d: Partial<BookingEmailData>) => {
  const accent = d.house?.primary_color || '#fd1e1e'
  const copy = d.copy ?? { subject: '', heading: '', body: '', button: 'Open your booking' }
  const bank = d.bank
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{copy.body}</Preview>
      <Body style={main}>
        <Section style={outer}>
          <Container style={container}>
            <Section style={body}>
              <Hr style={{ border: 'none', borderTop: `3px solid ${accent}`, width: '36px', margin: '0 0 16px' }} />
              <Heading style={h1}>{copy.heading}</Heading>
              <Text style={text}>{copy.body}</Text>

              {bank && (
                <>
                  <Text style={label}>How to pay</Text>
                  <Section style={bankBox}>
                    {bank.account_number && (
                      <>
                        <Text style={bankLine}><span style={quiet}>PesaLink or bank transfer to </span>{bank.account_name}</Text>
                        <Text style={bankLine}><span style={quiet}>Bank </span>{bank.bank_name}{bank.bank_branch ? `, ${bank.bank_branch}` : ''}</Text>
                        <Text style={bankLine}><span style={quiet}>Account </span>{bank.account_number}</Text>
                      </>
                    )}
                    {bank.paybill && (
                      <Text style={bankLine}><span style={quiet}>M-Pesa paybill </span>{bank.paybill}<span style={quiet}>, account </span>{bank.paybill_account}</Text>
                    )}
                    <Text style={{ ...bankLine, marginTop: '6px' }}><span style={quiet}>Reason or reference </span><b>{bank.reference}</b></Text>
                  </Section>
                </>
              )}

              <Text style={label}>Booking {d.ref}</Text>
              {(d.lines ?? []).map((l, n) => (
                <Text key={n} style={row}>
                  {l.title} <span style={quiet}>· {l.what}</span><br /><span style={quiet}>{l.amount}</span>
                </Text>
              ))}
              {d.totals && (
                <>
                  <Text style={{ ...sum, marginTop: '10px' }}><span style={quiet}>Media </span>{d.totals.media}</Text>
                  {d.totals.production && <Text style={sum}><span style={quiet}>Making the ad </span>{d.totals.production}</Text>}
                  <Text style={sum}><span style={quiet}>VAT (16%) </span>{d.totals.vat}</Text>
                  <Text style={total}>Total {d.totals.total}</Text>
                </>
              )}

              {d.url && (
                <Section style={{ margin: '20px 0 8px' }}>
                  <Button href={d.url} style={{ backgroundColor: accent, color: '#ffffff', padding: '12px 20px', borderRadius: '10px', fontSize: '15px', fontWeight: 600, textDecoration: 'none' }}>
                    {copy.button}
                  </Button>
                </Section>
              )}
            </Section>
            <Section style={footer}>{d.house?.name} · Daraja Pulse</Section>
          </Container>
        </Section>
      </Body>
    </Html>
  )
}

export const previewBooking: BookingEmailData = {
  copy: {
    subject: 'Booking BK-7F3K2Q: how to pay KES 481,400', heading: 'Your booking is in', button: 'Open your booking',
    body: 'Pay KES 481,400 by PesaLink from your bank app, or by M-Pesa, to the account below, with BK-7F3K2Q as the reason. Radio Africa Group confirms your booking once the money lands.',
  },
  house: { name: 'Radio Africa Group', primary_color: '#e11d48' },
  ref: 'BK-7F3K2Q',
  lines: [
    { title: 'Kiss 100: Spot adverts', what: '6–9 AM · 10 spots · 24 to 28 Nov', amount: 'KES 350,000' },
    { title: 'The Star online: Leaderboard', what: 'About 50,000 views · 24 Nov to 7 Dec', amount: 'KES 15,000' },
  ],
  totals: { media: 'KES 365,000', production: 'KES 50,000', vat: 'KES 66,400', total: 'KES 481,400' },
  url: 'https://radioafrica.darajapulse.com/booking/example',
  bank: {
    account_name: 'Example Account Ltd', bank_name: 'Example Bank', bank_branch: 'Westlands', account_number: '0000000000',
    paybill: '000000', paybill_account: '0000000000', reference: 'BK-7F3K2Q',
  },
}

export const template = {
  component: BookingEmail,
  subject: (d: Record<string, any>) => d.copy?.subject || `Your booking ${d.ref ?? ''}`.trim(),
  displayName: 'Storefront booking (to the buyer)',
  previewData: previewBooking,
} satisfies TemplateEntry
