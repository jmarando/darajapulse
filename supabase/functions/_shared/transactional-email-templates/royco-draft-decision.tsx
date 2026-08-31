import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  greeting_name?: string
  campaign_name?: string
  decision?: 'approved' | 'changes_requested'
  review_note?: string
  submit_url?: string
  hashtag?: string
  reviewer_label?: string
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
const h1 = { fontSize: '24px', fontWeight: 700, lineHeight: 1.2, margin: '0 0 14px', color: INK }
const text = { fontSize: 15, lineHeight: 1.65, color: INK, margin: '0 0 12px' }
const card = { backgroundColor: CARD, borderRadius: '10px', border: `1px solid ${BORDER}`, borderLeft: `4px solid ${RED}`, padding: '18px 20px', margin: '4px 0 20px' }
const btn = { backgroundColor: RED, color: '#ffffff', borderRadius: '8px', padding: '13px 26px', fontSize: '14px', fontWeight: 700, textDecoration: 'none', display: 'inline-block', margin: '4px 0 8px' }
const small = { fontSize: 12, lineHeight: 1.55, color: MUTED, margin: '0 0 4px' }
const footer = { padding: '24px 32px 30px', backgroundColor: INK, textAlign: 'center' as const }
const footerWordmark = { color: '#ffffff', fontSize: '13px', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' as const, margin: '0 0 6px' }
const footerTag = { color: GOLD, fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', margin: '0 0 14px' }
const footerFine = { fontSize: '11px', lineHeight: 1.6, color: 'rgba(255,255,255,0.65)', margin: '0 0 4px' }
const footerDivider = { border: 'none', borderTop: '1px solid rgba(255,255,255,0.12)', margin: '16px 0' }

const RoycoDraftDecision = ({
  greeting_name = 'there',
  campaign_name = 'Royco KE Q3 Nano Influencer Campaign',
  decision = 'approved',
  review_note,
  submit_url,
  hashtag = '#TasteParadiseWithRoyco',
  reviewer_label,
}: Props) => {
  const approved = decision === 'approved'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{approved ? 'Your video is approved — you can post it now' : 'A few changes needed on your video'}</Preview>
      <Body style={main}>
        <Section style={outer}>
          <Container style={container}>
            <Section style={header}>
              <Text style={wordmark}>Royco × Daraja Pulse</Text>
              <Text style={kicker}>{approved ? 'Video approved' : 'Changes requested'}</Text>
            </Section>
            <Hr style={goldBar} />

            <Section style={bodyPad}>
              <Heading style={h1}>
                {approved ? `Nice one ${greeting_name} — your video is approved` : `${greeting_name}, small tweaks needed`}
              </Heading>

              {approved ? (
                <Text style={text}>
                  Your video for <strong>{campaign_name}</strong> has been approved. You can post it now — remember to tag
                  Royco and use <strong>{hashtag}</strong> and <strong>#Flavormax</strong>. Once it's live, submit the post
                  link so your views are tracked for payment.
                </Text>
              ) : (
                <Text style={text}>
                  Thanks for sending your video for <strong>{campaign_name}</strong>. Before it can go live, the team has
                  asked for a few changes. Please don't post this version yet.
                </Text>
              )}

              {review_note ? (
                <Section style={card}>
                  <Text style={{ ...text, margin: 0 }}>
                    <strong>Feedback{reviewer_label ? ` from ${reviewer_label}` : ''}:</strong> {review_note}
                  </Text>
                </Section>
              ) : null}

              {submit_url ? (
                <Text style={{ margin: '0 0 6px' }}>
                  <Button href={submit_url} style={btn}>
                    {approved ? 'Submit my live post link' : 'Upload my updated video'}
                  </Button>
                </Text>
              ) : null}

              <Hr style={{ border: 'none', borderTop: `1px solid ${BORDER}`, margin: '24px 0 16px' }} />
              <Text style={small}>Questions? Just reply to this email and the team will help you out.</Text>
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
}

export const template = {
  component: RoycoDraftDecision,
  subject: (d: Record<string, any>) =>
    d?.decision === 'changes_requested'
      ? 'Changes needed on your Royco video'
      : 'Your Royco video is approved — you can post it',
  displayName: 'Royco — video draft decision',
  previewData: {
    greeting_name: 'Mary',
    campaign_name: 'Royco KE Q3 Nano Influencer Campaign',
    decision: 'approved',
    submit_url: 'https://darajapulse.com/c/example?k=example-token',
    hashtag: '#TasteParadiseWithRoyco',
  },
} satisfies TemplateEntry
