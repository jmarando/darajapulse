import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string
  email?: string
  company?: string
  role?: string
  message?: string
}

const INK = '#1c1714'
const PAPER = '#fbf6ee'
const ACCENT = '#fd1e1e'
const MUTED = '#6b635c'
const BORDER = '#ece4d6'

const main = { backgroundColor: '#ffffff', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', margin: 0, padding: 0, color: INK }
const outer = { backgroundColor: '#ffffff', padding: '32px 0' }
const container = { maxWidth: '560px', margin: '0 auto', backgroundColor: PAPER, borderRadius: '14px', overflow: 'hidden' as const, border: `1px solid ${BORDER}` }
const body = { padding: '28px 32px 12px' }
const h1 = { fontSize: '22px', fontWeight: 700, lineHeight: 1.2, margin: '0 0 14px', color: INK }
const text = { fontSize: 15, lineHeight: 1.6, color: INK, margin: '0 0 12px' }
const label = { fontSize: 11, lineHeight: 1.4, color: MUTED, margin: '14px 0 2px', letterSpacing: '0.06em', textTransform: 'uppercase' as const }
const value = { fontSize: 15, lineHeight: 1.5, color: INK, margin: '0 0 6px', fontWeight: 600 }
const accentRule = { border: 'none', borderTop: `3px solid ${ACCENT}`, width: '36px', margin: '0 0 16px' }
const footer = { padding: '16px 32px 22px', fontSize: '11px', color: MUTED, textAlign: 'center' as const, letterSpacing: '0.04em', textTransform: 'uppercase' as const }

const DemoRequest = ({ name, email, company, role, message }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`New demo request from ${name || email || 'someone'}`}</Preview>
    <Body style={main}>
      <Section style={outer}>
        <Container style={container}>
          <Section style={body}>
            <Hr style={accentRule} />
            <Heading style={h1}>New demo request</Heading>
            <Text style={text}>Someone just requested a DarajaPulse demo via the website.</Text>
            <Text style={label}>Name</Text>
            <Text style={value}>{name || '—'}</Text>
            <Text style={label}>Email</Text>
            <Text style={value}>{email || '—'}</Text>
            <Text style={label}>Company</Text>
            <Text style={value}>{company || '—'}</Text>
            <Text style={label}>Role</Text>
            <Text style={value}>{role || '—'}</Text>
            <Text style={label}>Message</Text>
            <Text style={value}>{message || '—'}</Text>
          </Section>
          <Section style={footer}>Daraja Pulse — demo intake</Section>
        </Container>
      </Section>
    </Body>
  </Html>
)

export const template = {
  component: DemoRequest,
  subject: (d: Record<string, any>) => `Demo request — ${d.name || d.email || 'new lead'}${d.company ? ` (${d.company})` : ''}`,
  to: 'justin@glab.africa',
  displayName: 'Demo request',
  previewData: { name: 'Jane Doe', email: 'jane@example.com', company: 'Acme', role: 'CMO', message: 'Looking for a Q3 campaign rollout.' },
} satisfies TemplateEntry
