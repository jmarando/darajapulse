import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  greeting_name?: string
  campaign_name?: string
  meeting_day?: string
  meeting_time?: string
  meeting_link?: string
  custom_note?: string
  rsvp_email?: string
}

const RED = '#E4002B'
const DEEP = '#A8001F'
const GOLD = '#FFC72C'
const INK = '#1b1512'
const PAPER = '#fff8ec'
const CARD = '#ffffff'
const BORDER = '#f0e2c9'
const MUTED = '#6f645c'

const main = { backgroundColor: '#ffffff', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', margin: 0, padding: 0, color: INK }
const outer = { backgroundColor: '#ffffff', padding: '32px 0' }
const container = { maxWidth: '620px', margin: '0 auto', backgroundColor: PAPER, borderRadius: '14px', overflow: 'hidden' as const, border: `1px solid ${BORDER}` }
const header = { backgroundColor: RED, padding: '26px 32px' }
const wordmark = { color: '#ffffff', fontSize: '13px', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' as const, margin: 0 }
const kicker = { color: GOLD, fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, margin: '6px 0 0' }
const goldBar = { border: 'none', borderTop: `4px solid ${GOLD}`, margin: 0 }
const body = { padding: '30px 32px 8px' }
const h1 = { fontSize: '25px', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em', margin: '0 0 14px', color: INK }
const h2 = { fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: DEEP, margin: '22px 0 8px' }
const text = { fontSize: 15, lineHeight: 1.65, color: INK, margin: '0 0 12px' }
const card = { backgroundColor: CARD, borderRadius: '10px', border: `1px solid ${BORDER}`, borderLeft: `4px solid ${RED}`, padding: '18px 20px', margin: '4px 0 20px' }
const label = { color: MUTED, fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 2px' }
const value = { fontSize: 16, fontWeight: 700, color: INK, margin: '0 0 12px' }
const btn = { backgroundColor: RED, color: '#ffffff', borderRadius: '8px', padding: '13px 26px', fontSize: '14px', fontWeight: 700, textDecoration: 'none', display: 'inline-block', margin: '4px 8px 8px 0' }
const small = { fontSize: 12, lineHeight: 1.55, color: MUTED, margin: '0 0 4px' }
const footer = { padding: '24px 32px 30px', backgroundColor: INK, textAlign: 'center' as const }
const footerWordmark = { color: '#ffffff', fontSize: '13px', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' as const, margin: '0 0 6px' }
const footerTag = { color: GOLD, fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', margin: '0 0 14px' }
const footerFine = { fontSize: '11px', lineHeight: 1.6, color: 'rgba(255,255,255,0.65)', margin: '0 0 4px' }
const footerDivider = { border: 'none', borderTop: '1px solid rgba(255,255,255,0.12)', margin: '16px 0' }

const RoycoLastTraining = ({
  greeting_name = 'there',
  campaign_name = 'Royco KE Q3 Nano Influencer Campaign',
  meeting_day = 'Friday 28 August',
  meeting_time = '11:00 AM EAT',
  meeting_link,
  custom_note,
  rsvp_email,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Last chance: {campaign_name} training — {meeting_day}, {meeting_time}</Preview>
    <Body style={main}>
      <Section style={outer}>
        <Container style={container}>
          <Section style={header}>
            <Text style={wordmark}>Royco × Daraja Pulse</Text>
            <Text style={kicker}>Final training session — last chance</Text>
          </Section>
          <Hr style={goldBar} />

          <Section style={body}>
            <Heading style={h1}>Missed the kick-off? One last training, {meeting_day}</Heading>
            <Text style={text}>
              Hi {greeting_name}! We noticed you weren't able to join the earlier sessions for the {campaign_name}.
              We're running <strong>one final training</strong> so you don't miss out on the brief, the deliverables and
              how everything works on Daraja Pulse.
            </Text>

            <Section style={{ ...card, borderLeft: `4px solid ${GOLD}` }}>
              <Text style={{ ...text, margin: 0, fontWeight: 700 }}>
                Already attended Wednesday's session? You're all set — no need to join this one. Karibu to the campaign!
              </Text>
            </Section>

            <Section style={card}>
              <Text style={label}>When</Text>
              <Text style={value}>{meeting_day}, {meeting_time}</Text>
              <Text style={label}>Where</Text>
              {meeting_link ? (
                <Text style={{ ...value, marginBottom: 4 }}>
                  <Link href={meeting_link} style={{ color: RED, textDecoration: 'underline' }}>Join the online training</Link>
                </Text>
              ) : (
                <Text style={{ ...value, marginBottom: 4 }}>Online — meeting link below</Text>
              )}
              <Text style={small}>{meeting_link ? meeting_link : 'The joining link will be shared here shortly.'}</Text>
            </Section>

            {meeting_link ? <Button style={btn} href={meeting_link}>Join the training</Button> : null}

            <Text style={h2}>What we'll cover</Text>
            <Text style={text}>
              The Royco brief and content direction, deliverables and the monthly posting rhythm, a quick tour of
              Daraja Pulse (where you upload drafts, submit links and track your performance and payments), and Q&amp;A.
            </Text>

            <Text style={h2}>Please confirm you're coming</Text>
            <Section style={{ ...card, borderLeft: `4px solid ${GOLD}` }}>
              <Text style={{ ...text, margin: '0 0 8px', fontWeight: 700 }}>
                Simply reply to this email with "YES" to confirm you'll join the training.
              </Text>
              <Text style={{ ...small, margin: 0 }}>
                {rsvp_email
                  ? `Your reply goes straight to our team at ${rsvp_email} — a one-word reply is enough.`
                  : 'Your reply goes straight to our team — a one-word reply is enough.'}
                {' '}If you can't make it either, reply and let us know so we can help you catch up.
              </Text>
            </Section>

            {custom_note ? <Text style={text}>{custom_note}</Text> : null}

            <Hr style={{ borderColor: BORDER, margin: '22px 0 14px' }} />
            <Text style={small}>This is the final training session for this campaign — please join on time. Asante sana!</Text>
          </Section>

          <Section style={footer}>
            <Text style={footerWordmark}>Royco</Text>
            <Text style={footerTag}>Taste Paradise — a Unilever brand</Text>
            <Text style={footerFine}>Powered by Daraja Pulse · Influence, measured</Text>
            <Hr style={footerDivider} />
            <Text style={footerFine}>This email was sent to you because you are part of the {campaign_name} creator roster.</Text>
            <Text style={footerFine}>Questions? Reply to this email and our team will get back to you.</Text>
          </Section>
        </Container>
      </Section>
    </Body>
  </Html>
)

export const template = {
  component: RoycoLastTraining,
  subject: (d: Record<string, any>) =>
    `Last chance: ${d?.campaign_name || 'Royco KE Q3'} training — ${d?.meeting_day || 'Friday'}, ${d?.meeting_time || '11:00 AM EAT'}`,
  displayName: 'Royco last-chance training invite',
  previewData: {
    greeting_name: 'Mary',
    campaign_name: 'Royco KE Q3 Nano Influencer Campaign',
    meeting_day: 'Friday 28 August',
    meeting_time: '11:00 AM EAT',
    meeting_link: 'https://teams.microsoft.com/meet/...',
    rsvp_email: 'royco@reply.darajapulse.com',
  },
} satisfies TemplateEntry

export default RoycoLastTraining
