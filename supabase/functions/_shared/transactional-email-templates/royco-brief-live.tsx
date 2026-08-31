import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  greeting_name?: string
  campaign_name?: string
  brief_url?: string
  submit_url?: string
  hashtag?: string
  first_post_by?: string
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
const bodyPad = { padding: '30px 32px 8px' }
const h1 = { fontSize: '25px', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em', margin: '0 0 14px', color: INK }
const h2 = { fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: DEEP, margin: '24px 0 8px' }
const text = { fontSize: 15, lineHeight: 1.65, color: INK, margin: '0 0 12px' }
const card = { backgroundColor: CARD, borderRadius: '10px', border: `1px solid ${BORDER}`, borderLeft: `4px solid ${RED}`, padding: '18px 20px', margin: '4px 0 20px' }
const step = { fontSize: 14, lineHeight: 1.6, color: INK, margin: '0 0 10px' }
const stepNum = { color: RED, fontWeight: 700 }
const btn = { backgroundColor: RED, color: '#ffffff', borderRadius: '8px', padding: '13px 26px', fontSize: '14px', fontWeight: 700, textDecoration: 'none', display: 'inline-block', margin: '4px 8px 8px 0' }
const btnGhost = { backgroundColor: INK, color: '#ffffff', borderRadius: '8px', padding: '13px 26px', fontSize: '14px', fontWeight: 700, textDecoration: 'none', display: 'inline-block', margin: '4px 8px 8px 0' }
const small = { fontSize: 12, lineHeight: 1.55, color: MUTED, margin: '0 0 4px' }
const footer = { padding: '24px 32px 30px', backgroundColor: INK, textAlign: 'center' as const }
const footerWordmark = { color: '#ffffff', fontSize: '13px', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' as const, margin: '0 0 6px' }
const footerTag = { color: GOLD, fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', margin: '0 0 14px' }
const footerFine = { fontSize: '11px', lineHeight: 1.6, color: 'rgba(255,255,255,0.65)', margin: '0 0 4px' }
const footerDivider = { border: 'none', borderTop: '1px solid rgba(255,255,255,0.12)', margin: '16px 0' }

const RoycoBriefLive = ({
  greeting_name = 'there',
  campaign_name = 'Royco KE Q3 Nano Influencer Campaign',
  brief_url,
  submit_url,
  hashtag = '#TasteParadiseWithRoyco',
  first_post_by = 'Sunday 7 September',
  custom_note,
  rsvp_email,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Royco brief, contract and personal submission link are ready</Preview>
    <Body style={main}>
      <Section style={outer}>
        <Container style={container}>
          <Section style={header}>
            <Text style={wordmark}>Royco × Daraja Pulse</Text>
            <Text style={kicker}>Your brief is live — let's cook</Text>
          </Section>
          <Hr style={goldBar} />

          <Section style={bodyPad}>
            <Heading style={h1}>Karibu {greeting_name} — here's everything you need to start</Heading>
            <Text style={text}>
              Asante for joining the training for the <strong>{campaign_name}</strong>. Your personal brief page is now
              open. Everything lives in one place: the full creative brief, your contract to sign, and your own link for
              submitting each video.
            </Text>

            <Section style={card}>
              <Text style={{ ...h2, margin: '0 0 10px' }}>Do these three things today</Text>
              <Text style={step}><span style={stepNum}>1.</span> Open your brief page and read the creative direction and do's &amp; don'ts.</Text>
              <Text style={step}><span style={stepNum}>2.</span> Sign your contract on that same page — signing unlocks submissions and payment.</Text>
              <Text style={step}><span style={stepNum}>3.</span> Shoot, then submit each video for approval <strong>before</strong> you post it.</Text>
            </Section>

            {brief_url ? (
              <Text style={{ margin: '0 0 6px' }}>
                <Button href={brief_url} style={btn}>Open my brief &amp; sign contract</Button>
                {submit_url ? <Button href={submit_url} style={btnGhost}>Submit a video</Button> : null}
              </Text>
            ) : null}

            {brief_url ? (
              <Text style={small}>
                These links are personal to you — please don't share them. Brief:{' '}
                <Link href={brief_url} style={{ color: DEEP }}>{brief_url}</Link>
              </Text>
            ) : null}

            <Text style={h2}>What you're delivering</Text>
            <Text style={text}>
              Four (4) Reels per month — one per week — cross-posted on your active platforms, always tagging Royco and
              using <strong>{hashtag}</strong>. Every video must be approved by the team before it goes live, and must
              stay up for the whole campaign. Aim to have your <strong>first video submitted by {first_post_by}</strong>.
            </Text>

            <Text style={h2}>How you get paid</Text>
            <Text style={text}>
              Payment is based on the views of your best-performing Reel, per the rate card in your contract (KES 5,000
              up to KES 75,000 gross). Payment is released 45 days after your final E-TIMS invoice and campaign report
              are received and approved.
            </Text>

            {custom_note ? (
              <Section style={{ ...card, borderLeft: `4px solid ${GOLD}` }}>
                <Text style={{ ...text, margin: 0 }}>{custom_note}</Text>
              </Section>
            ) : null}

            <Hr style={{ border: 'none', borderTop: `1px solid ${BORDER}`, margin: '24px 0 16px' }} />
            <Text style={small}>
              Stuck on anything? Just reply to this email
              {rsvp_email ? <> — it lands with the team at <strong>{rsvp_email}</strong></> : null} and we'll help you out.
            </Text>
          </Section>

          <Section style={footer}>
            <Text style={footerWordmark}>Royco</Text>
            <Text style={footerTag}>Add Love. Add Royco.</Text>
            <Hr style={footerDivider} />
            <Text style={footerFine}>A Unilever brand · Royco Kenya</Text>
            <Text style={footerFine}>Campaign managed by Daraja Plus Limited · Powered by Daraja Pulse</Text>
          </Section>
        </Container>
      </Section>
    </Body>
  </Html>
)

export const template = {
  component: RoycoBriefLive,
  subject: (d: Record<string, any>) =>
    `Your Royco brief, contract and submission link — ${d?.campaign_name || 'Royco KE Q3 Nano Influencer Campaign'}`,
  displayName: 'Royco — brief live & submission link',
  previewData: {
    greeting_name: 'Mary',
    campaign_name: 'Royco KE Q3 Nano Influencer Campaign',
    brief_url: 'https://darajapulse.com/brief/example-token',
    submit_url: 'https://darajapulse.com/c/example?k=example-token',
    hashtag: '#TasteParadiseWithRoyco',
    first_post_by: 'Sunday 7 September',
    rsvp_email: 'royco@reply.darajapulse.com',
  },
} satisfies TemplateEntry
