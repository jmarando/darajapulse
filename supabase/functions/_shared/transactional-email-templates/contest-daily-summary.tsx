import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Link, Preview, Section, Text, Button, Hr, Row, Column,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import {
  main, container, innerPad, h1, sub, sectionTitle, text, muted, buttonStyle,
  metricGrid, metricLabel, metricValue, footerStyle, brand,
} from './_brand.ts'

interface Entry {
  rank: number
  handle: string
  platform: string
  score: number
  views: number
  likes: number
  post_url?: string
}
interface Props {
  client_name?: string
  client_logo_url?: string
  client_color?: string
  campaign_name?: string
  contest_name?: string
  contest_hashtag?: string
  prize?: string
  date_label?: string
  days_remaining?: number
  total_entries?: number
  new_entries_24h?: number
  total_views?: number
  total_engagement?: number
  top_entries?: Entry[]
  report_url?: string
}

const fmt = (n?: number) => (n ?? 0).toLocaleString('en-US')

const ContestDailySummary = (p: Props) => {
  const color = p.client_color || '#111111'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${p.contest_name || 'Contest'} — daily update`}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
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
                <Text style={{ fontSize: 11, color: brand.textMuted, margin: 0 }}>{p.date_label}</Text>
              </Column>
            </Row>
          </Section>

          <Section style={innerPad}>
            <Heading style={h1}>{p.contest_name || 'Contest'} — daily update</Heading>
            <Text style={sub}>
              {p.campaign_name}{p.contest_hashtag ? ` · #${p.contest_hashtag.replace(/^#/, '')}` : ''}
              {typeof p.days_remaining === 'number' ? ` · ${p.days_remaining} day${p.days_remaining === 1 ? '' : 's'} left` : ''}
            </Text>

            {/* Metric grid */}
            <Section style={metricGrid}>
              <Row>
                <Column>
                  <Text style={metricLabel}>Entries</Text>
                  <Text style={metricValue}>{fmt(p.total_entries)}</Text>
                </Column>
                <Column>
                  <Text style={metricLabel}>New (24h)</Text>
                  <Text style={metricValue}>+{fmt(p.new_entries_24h)}</Text>
                </Column>
                <Column>
                  <Text style={metricLabel}>Views</Text>
                  <Text style={metricValue}>{fmt(p.total_views)}</Text>
                </Column>
                <Column>
                  <Text style={metricLabel}>Engagement</Text>
                  <Text style={metricValue}>{fmt(p.total_engagement)}</Text>
                </Column>
              </Row>
            </Section>

            {/* Leaderboard */}
            <Text style={sectionTitle}>Top leaderboard</Text>
            {(p.top_entries || []).slice(0, 10).map((e) => (
              <Row key={e.rank} style={{ borderBottom: `1px solid ${brand.border}`, padding: '10px 0' }}>
                <Column style={{ width: 28, verticalAlign: 'top', color: brand.textMuted, fontSize: 13 }}>
                  {e.rank}
                </Column>
                <Column style={{ verticalAlign: 'top' }}>
                  <Text style={{ ...text, margin: 0, fontWeight: 600 }}>
                    {e.post_url ? <Link href={e.post_url} style={{ color: brand.textBody }}>@{e.handle}</Link> : `@${e.handle}`}
                  </Text>
                  <Text style={{ ...muted, fontSize: 11 }}>
                    {e.platform} · {fmt(e.views)} views · {fmt(e.likes)} likes
                  </Text>
                </Column>
                <Column align="right" style={{ verticalAlign: 'top', width: 70 }}>
                  <Text style={{ ...text, margin: 0, fontWeight: 700 }}>{fmt(Math.round(e.score))}</Text>
                </Column>
              </Row>
            ))}
            {(!p.top_entries || p.top_entries.length === 0) && (
              <Text style={muted}>No approved entries yet for the current draw.</Text>
            )}

            {p.prize && (
              <>
                <Text style={sectionTitle}>Current prize</Text>
                <Text style={text}>{p.prize}</Text>
              </>
            )}

            {p.report_url && (
              <Section style={{ margin: '28px 0 0' }}>
                <Button href={p.report_url} style={buttonStyle(color)}>View full report</Button>
              </Section>
            )}
          </Section>

          <Section style={footerStyle}>
            <Text style={{ margin: 0 }}>
              You're receiving this because you're on the report list for {p.campaign_name}.
            </Text>
            <Text style={{ margin: '6px 0 0' }}>Powered by Daraja Pulse</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ContestDailySummary,
  subject: (d: Record<string, any>) =>
    `Daily — ${d.contest_name || 'Contest'}: ${d.new_entries_24h ?? 0} new entries`,
  displayName: 'Contest daily summary',
  previewData: {
    client_name: 'Royco',
    client_color: '#C8102E',
    campaign_name: 'Royco Mboga Challenge',
    contest_name: 'Royco Mboga Challenge',
    contest_hashtag: 'RoycoMbogaChallenge',
    prize: 'KES 50,000 + Royco hamper',
    date_label: 'Mon, 18 May 2026',
    days_remaining: 12,
    total_entries: 184,
    new_entries_24h: 22,
    total_views: 1240000,
    total_engagement: 88400,
    top_entries: [
      { rank: 1, handle: 'kayceechef', platform: 'TikTok', score: 8420, views: 220000, likes: 14300, post_url: 'https://tiktok.com/@x/video/1' },
      { rank: 2, handle: 'nyamachoma_ke', platform: 'TikTok', score: 6210, views: 180000, likes: 9800 },
      { rank: 3, handle: 'mama.ngina', platform: 'Instagram', score: 4180, views: 96000, likes: 7100 },
    ],
    report_url: 'https://darajapulse.com/r/sample',
  },
} satisfies TemplateEntry
