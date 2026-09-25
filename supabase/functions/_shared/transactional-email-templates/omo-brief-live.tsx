import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  greeting_name?: string
  campaign_name?: string
  brief_url?: string
  submit_url?: string
  hashtag?: string
  videos?: number | string
  fee?: string
  first_post_by?: string
  rsvp_email?: string
}

const BLUE = '#0033A0'
const DEEP = '#00236e'
const ORANGE = '#FF5A00'
const INK = '#14182b'
const PAPER = '#f3f7ff'
const BORDER = '#d6e0f5'
const MUTED = '#5c6478'

const main = { backgroundColor: '#ffffff', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', margin: 0, padding: 0, color: INK }
const outer = { backgroundColor: '#ffffff', padding: '32px 0' }
const container = { maxWidth: '620px', margin: '0 auto', backgroundColor: PAPER, borderRadius: '14px', overflow: 'hidden' as const, border: `1px solid ${BORDER}` }
const header = { backgroundColor: BLUE, padding: '26px 32px' }
const wordmark = { color: '#ffffff', fontSize: '13px', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' as const, margin: 0 }
const kicker = { color: ORANGE, fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, margin: '6px 0 0' }
const bar = { border: 'none', borderTop: `4px solid ${ORANGE}`, margin: 0 }
const bodyPad = { padding: '30px 32px 8px' }
const h1 = { fontSize: '25px', fontWeight: 700, lineHeight: 1.2, margin: '0 0 14px', color: INK }
const h2 = { fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: DEEP, margin: '24px 0 8px' }
const text = { fontSize: 15, lineHeight: 1.65, color: INK, margin: '0 0 12px' }
const card = { backgroundColor: '#ffffff', borderRadius: '10px', border: `1px solid ${BORDER}`, borderLeft: `4px solid ${BLUE}`, padding: '18px 20px', margin: '4px 0 20px' }
const step = { fontSize: 14, lineHeight: 1.6, color: INK, margin: '0 0 10px' }
const num = { color: ORANGE, fontWeight: 700 }
const btn = { backgroundColor: ORANGE, color: '#ffffff', borderRadius: '8px', padding: '13px 26px', fontSize: '14px', fontWeight: 700, textDecoration: 'none', display: 'inline-block', margin: '4px 8px 8px 0' }
const btnGhost = { ...btn, backgroundColor: BLUE }
const small = { fontSize: 12, lineHeight: 1.55, color: MUTED, margin: '0 0 4px' }
const footer = { padding: '24px 32px 30px', backgroundColor: DEEP, textAlign: 'center' as const }
const fine = { fontSize: '11px', lineHeight: 1.6, color: 'rgba(255,255,255,0.7)', margin: '0 0 4px' }

const OmoBriefLive = ({
  greeting_name = 'there',
  campaign_name = 'OMO Q4 Nano Influencer Campaign',
  brief_url,
  submit_url,
  hashtag = '#FearlessCleanUp',
  videos = 4,
  fee,
  first_post_by = 'the first week of October',
  rsvp_email,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your OMO brief, agreement and personal submission link are ready</Preview>
    <Body style={main}>
      <Section style={outer}>
        <Container style={container}>
          <Section style={header}>
            <Text style={wordmark}>OMO × Daraja Pulse</Text>
            <Text style={kicker}>Fearless Clean Up · your brief is live</Text>
          </Section>
          <Hr style={bar} />
          <Section style={bodyPad}>
            <Heading style={h1}>Karibu {greeting_name}, here's everything you need to start</Heading>
            <Text style={text}>
              Welcome to the <strong>{campaign_name}</strong>. Your personal brief page is open: the creative brief,
              your agreement to sign, and your own link for submitting each video.
            </Text>
            <Section style={card}>
              <Text style={{ ...h2, margin: '0 0 10px' }}>Do these three things</Text>
              <Text style={step}><span style={num}>1.</span> Open your brief page and read the creative direction.</Text>
              <Text style={step}><span style={num}>2.</span> Sign your agreement on that page. Signing unlocks submissions and payment.</Text>
              <Text style={step}><span style={num}>3.</span> Upload each video for approval <strong>before</strong> you post it, then share the live links (all platforms) on your submission link.</Text>
            </Section>
            {brief_url ? (
              <Text style={{ margin: '0 0 6px' }}>
                <Button href={brief_url} style={btn}>Open my brief &amp; sign</Button>
                {submit_url ? <Button href={submit_url} style={btnGhost}>Submit a video</Button> : null}
              </Text>
            ) : null}
            {brief_url ? (
              <Text style={small}>
                These links are personal to you, please don't share them. Brief:{' '}
                <Link href={brief_url} style={{ color: BLUE }}>{brief_url}</Link>
              </Text>
            ) : null}
            <Text style={h2}>What you're delivering</Text>
            <Text style={text}>
              {videos} Reels over the campaign, cross-posted on your active platforms plus stories, tagging OMO and using{' '}
              <strong>{hashtag}</strong>. Every video must be approved before it goes live and stay up for the whole
              campaign. Aim to submit your first video by <strong>{first_post_by}</strong>.
            </Text>
            <Text style={h2}>How you get paid</Text>
            <Text style={text}>
              {fee ? <>Your total fee is <strong>{fee}</strong> gross, </> : <>Your fee is set out in your agreement, </>}
              paid per approved and posted video, less 5% withholding tax. Payment follows your E-TIMS invoice and
              campaign report.
            </Text>
            <Hr style={{ border: 'none', borderTop: `1px solid ${BORDER}`, margin: '24px 0 16px' }} />
            <Text style={small}>
              Stuck on anything? Just reply to this email{rsvp_email ? <> (it reaches the team at <strong>{rsvp_email}</strong>)</> : null} and we'll help.
            </Text>
          </Section>
          <Section style={footer}>
            <Text style={{ ...fine, color: '#ffffff', fontWeight: 700, letterSpacing: '0.16em' }}>OMO</Text>
            <Text style={fine}>A Unilever brand · Campaign managed by Daraja Plus Limited · Powered by Daraja Pulse</Text>
          </Section>
        </Container>
      </Section>
    </Body>
  </Html>
)

export const template = {
  component: OmoBriefLive,
  subject: (d: Record<string, any>) => `Your OMO brief, agreement and submission link — ${d?.campaign_name || 'OMO Q4 Nano Influencer Campaign'}`,
  displayName: 'OMO — brief live & submission link',
  previewData: {
    greeting_name: 'Primrose',
    brief_url: 'https://darajapulse.com/brief/example-token',
    submit_url: 'https://darajapulse.com/c/fearlesscleanup?k=example-token',
    videos: 4,
    fee: 'KES 80,000',
    rsvp_email: 'omo@reply.darajapulse.com',
  },
} satisfies TemplateEntry
