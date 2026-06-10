import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  org_name?: string
  org_kind?: 'agency' | 'brand_org'
  sign_in_url?: string
  app_url?: string
}

// Daraja Pulse brand tokens
const INK = '#1c1714'         // --primary / deep ink
const PAPER = '#fbf6ee'       // --background / warm paper
const ACCENT = '#fd1e1e'      // --accent / Kenyan ochre red
const MUTED = '#6b635c'
const BORDER = '#ece4d6'
const LOGO_URL = 'https://darajapulse.com/favicon.png'

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  margin: 0,
  padding: 0,
  color: INK,
}
const outer = { backgroundColor: '#ffffff', padding: '32px 0' }
const container = {
  maxWidth: '560px',
  margin: '0 auto',
  backgroundColor: PAPER,
  borderRadius: '14px',
  overflow: 'hidden' as const,
  border: `1px solid ${BORDER}`,
}
const header = {
  backgroundColor: INK,
  padding: '22px 32px',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
}
const wordmark = {
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 700,
  letterSpacing: '0.02em',
  margin: 0,
}
const body = { padding: '32px 32px 12px' }
const h1 = {
  fontSize: '24px',
  fontWeight: 700,
  lineHeight: 1.2,
  letterSpacing: '-0.01em',
  margin: '0 0 14px',
  color: INK,
}
const text = { fontSize: 15, lineHeight: 1.6, color: INK, margin: '0 0 14px' }
const accentRule = {
  border: 'none',
  borderTop: `3px solid ${ACCENT}`,
  width: '36px',
  margin: '0 0 18px',
}
const btn = {
  backgroundColor: ACCENT,
  color: '#ffffff',
  borderRadius: '8px',
  padding: '13px 26px',
  fontSize: '14px',
  fontWeight: 700,
  letterSpacing: '0.01em',
  textDecoration: 'none',
  display: 'inline-block',
  margin: '6px 0 18px',
}
const small = { fontSize: 12, lineHeight: 1.55, color: MUTED, margin: '0 0 6px' }
const link = { color: INK, wordBreak: 'break-all' as const }
const footer = {
  padding: '18px 32px 26px',
  fontSize: '11px',
  color: MUTED,
  textAlign: 'center' as const,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
}

const OrgAdminWelcome = ({ org_name, org_kind, sign_in_url, app_url }: Props) => {
  const what = org_kind === 'brand_org' ? 'brand' : 'agency'
  const url = sign_in_url || app_url || 'https://darajapulse.com/app'
  const name = org_name || `your ${what}`
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`You're the admin for ${name} on Daraja Pulse`}</Preview>
      <Body style={main}>
        <Section style={outer}>
          <Container style={container}>
            <Section style={header}>
              <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
                <tr>
                  <td style={{ paddingRight: 10 }}>
                    <Img src={LOGO_URL} width="28" height="28" alt="Daraja Pulse" style={{ display: 'block', borderRadius: 6 }} />
                  </td>
                  <td>
                    <Text style={wordmark}>DARAJA PULSE</Text>
                  </td>
                </tr>
              </table>
            </Section>
            <Section style={body}>
              <Hr style={accentRule} />
              <Heading style={h1}>You're the admin for {name}.</Heading>
              <Text style={text}>
                An account has been set up for you on <strong>Daraja Pulse</strong> as the admin for{' '}
                <strong>{name}</strong>. You can manage clients, campaigns, creators, content, moderation, and reporting
                from your dashboard.
              </Text>
              <Text style={text}>Use the secure link below to sign in — it will log you straight into your workspace.</Text>
              <Button style={btn} href={url}>Sign in to Daraja Pulse →</Button>
              <Text style={small}>If the button doesn't work, paste this link into your browser:</Text>
              <Text style={{ ...small, color: INK }}><a href={url} style={link}>{url}</a></Text>
            </Section>
            <Section style={footer}>
              Daraja Pulse — Influence, measured.
            </Section>
          </Container>
        </Section>
      </Body>
    </Html>
  )
}

export const template = {
  component: OrgAdminWelcome,
  subject: (d: Record<string, any>) => `You're the admin for ${d.org_name || 'your account'} on Daraja Pulse`,
  displayName: 'Org admin welcome',
  previewData: { org_name: 'The Africa Growth Lab', org_kind: 'agency', sign_in_url: 'https://darajapulse.com/app' },
} satisfies TemplateEntry
