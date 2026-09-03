import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Link, Preview, Section, Text, Button, Row, Column,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import {
  main, container, innerPad, h1, sub, sectionTitle, text, muted, buttonStyle,
  footerStyle, brand,
} from './_brand.ts'

interface Runner { rank: number; handle: string; score: number; post_url?: string }
interface Props {
  client_name?: string
  client_logo_url?: string
  client_color?: string
  campaign_name?: string
  contest_name?: string
  draw_label?: string
  prize?: string
  winner_handle?: string
  winner_platform?: string
  winner_score?: number
  winner_post_url?: string
  winner_thumbnail_url?: string
  runners_up?: Runner[]
  report_url?: string
}

const fmt = (n?: number) => (n ?? 0).toLocaleString('en-US')

const ContestDrawClosed = (p: Props) => {
  const color = p.client_color || '#111111'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`Winner announced — ${p.contest_name || 'Contest'}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ ...innerPad, paddingBottom: 0 }}>
            <Row>
              <Column style={{ verticalAlign: 'middle' }}>
                {p.client_logo_url ? (
                  <Img src={p.client_logo_url} height="36" alt={p.client_name || ''} style={{ borderRadius: 4 }} />
                ) : (
                  <Text style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>{p.client_name}</Text>
                )}
              </Column>
              <Column align="right" style={{ verticalAlign: 'middle' }}>
                <Text style={{ fontSize: 11, color: brand.textMuted, margin: 0 }}>{p.draw_label}</Text>
              </Column>
            </Row>
          </Section>

          <Section style={innerPad}>
            <Heading style={h1}>🏆 Winner announced</Heading>
            <Text style={sub}>{p.contest_name} · {p.campaign_name}</Text>

            <Section style={{
              border: `1px solid ${brand.border}`, borderRadius: 8, padding: 20, margin: '8px 0 20px',
              background: brand.bgPanel,
            }}>
              {p.winner_thumbnail_url && (
                <Img src={p.winner_thumbnail_url} width="100%" alt="" style={{ borderRadius: 6, marginBottom: 14 }} />
              )}
              <Text style={{ ...muted, fontSize: 11, margin: '0 0 4px' }}>WINNER</Text>
              <Heading style={{ ...h1, fontSize: 20, margin: '0 0 4px' }}>
                {p.winner_post_url ? (
                  <Link href={p.winner_post_url} style={{ color: brand.textBody, textDecoration: 'none' }}>
                    @{p.winner_handle}
                  </Link>
                ) : `@${p.winner_handle}`}
              </Heading>
              <Text style={{ ...muted, fontSize: 12 }}>
                {p.winner_platform || ''}{typeof p.winner_score === 'number' ? ` · score ${fmt(Math.round(p.winner_score))}` : ''}
              </Text>
              {p.prize && (
                <Text style={{ ...text, margin: '12px 0 0' }}>
                  <strong>Prize:</strong> {p.prize}
                </Text>
              )}
            </Section>

            {(p.runners_up || []).length > 0 && (
              <>
                <Text style={sectionTitle}>Runners-up</Text>
                {(p.runners_up || []).slice(0, 5).map((r) => (
                  <Row key={r.rank} style={{ borderBottom: `1px solid ${brand.border}`, padding: '8px 0' }}>
                    <Column style={{ width: 28, color: brand.textMuted, fontSize: 13 }}>{r.rank}</Column>
                    <Column>
                      <Text style={{ ...text, margin: 0 }}>
                        {r.post_url ? <Link href={r.post_url} style={{ color: brand.textBody }}>@{r.handle}</Link> : `@${r.handle}`}
                      </Text>
                    </Column>
                    <Column align="right" style={{ width: 70 }}>
                      <Text style={{ ...text, margin: 0, fontWeight: 600 }}>{fmt(Math.round(r.score))}</Text>
                    </Column>
                  </Row>
                ))}
              </>
            )}

            {p.report_url && (
              <Section style={{ margin: '28px 0 0' }}>
                <Button href={p.report_url} style={buttonStyle(color)}>View public results</Button>
              </Section>
            )}
          </Section>

          <Section style={footerStyle}>
            <Text style={{ margin: 0 }}>Powered by Daraja Pulse</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ContestDrawClosed,
  subject: (d: Record<string, any>) =>
    `Winner — ${d.contest_name || 'Contest'}: @${d.winner_handle || '?'}`,
  displayName: 'Contest draw closed',
  previewData: {
    client_name: 'Royco',
    client_color: '#C8102E',
    campaign_name: 'Royco Mboga Challenge',
    contest_name: 'Royco Mboga Challenge',
    draw_label: 'Draw 2 · 18 May 2026',
    prize: 'KES 50,000 + Royco hamper',
    winner_handle: 'kayceechef',
    winner_platform: 'TikTok',
    winner_score: 8420,
    winner_post_url: 'https://tiktok.com/@x/video/1',
    runners_up: [
      { rank: 2, handle: 'nyamachoma_ke', score: 6210 },
      { rank: 3, handle: 'mama.ngina', score: 4180 },
    ],
    report_url: 'https://darajapulse.com/r/sample',
  },
} satisfies TemplateEntry
