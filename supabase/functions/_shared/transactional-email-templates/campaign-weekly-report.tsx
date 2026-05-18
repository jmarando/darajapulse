import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Link, Preview, Section, Text, Button, Row, Column,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import {
  main, container, innerPad, h1, sub, sectionTitle, text, muted, buttonStyle,
  metricGrid, metricLabel, metricValue, footerStyle, brand,
} from './_brand.ts'

interface TopCreator {
  handle: string
  platform?: string
  views: number
  engagement: number
  posts: number
}
interface Props {
  client_name?: string
  client_logo_url?: string
  client_color?: string
  campaign_name?: string
  week_label?: string
  reach?: number
  impressions?: number
  engagement?: number
  posts?: number
  spend_kes?: number
  budget_kes?: number
  wow_engagement_pct?: number
  wow_reach_pct?: number
  top_creators?: TopCreator[]
  report_url?: string
}

const fmt = (n?: number) => (n ?? 0).toLocaleString('en-US')
const pct = (n?: number) => (typeof n === 'number' ? `${n > 0 ? '+' : ''}${n.toFixed(1)}%` : '—')
const kes = (n?: number) =>
  typeof n === 'number' ? `KES ${Math.round(n).toLocaleString('en-US')}` : '—'

const CampaignWeeklyReport = (p: Props) => {
  const color = p.client_color || '#111111'
  const budgetPct =
    p.budget_kes && p.budget_kes > 0 && typeof p.spend_kes === 'number'
      ? Math.min(100, Math.round((p.spend_kes / p.budget_kes) * 100))
      : null
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${p.campaign_name || 'Campaign'} — weekly report`}</Preview>
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
                <Text style={{ fontSize: 11, color: brand.textMuted, margin: 0 }}>{p.week_label}</Text>
              </Column>
            </Row>
          </Section>

          <Section style={innerPad}>
            <Heading style={h1}>{p.campaign_name} — weekly report</Heading>
            <Text style={sub}>Performance summary for the past 7 days.</Text>

            <Section style={metricGrid}>
              <Row>
                <Column>
                  <Text style={metricLabel}>Reach</Text>
                  <Text style={metricValue}>{fmt(p.reach)}</Text>
                  <Text style={{ ...muted, fontSize: 11 }}>{pct(p.wow_reach_pct)} WoW</Text>
                </Column>
                <Column>
                  <Text style={metricLabel}>Engagement</Text>
                  <Text style={metricValue}>{fmt(p.engagement)}</Text>
                  <Text style={{ ...muted, fontSize: 11 }}>{pct(p.wow_engagement_pct)} WoW</Text>
                </Column>
                <Column>
                  <Text style={metricLabel}>Posts</Text>
                  <Text style={metricValue}>{fmt(p.posts)}</Text>
                </Column>
                <Column>
                  <Text style={metricLabel}>Impressions</Text>
                  <Text style={metricValue}>{fmt(p.impressions)}</Text>
                </Column>
              </Row>
            </Section>

            {/* Budget */}
            {(p.budget_kes || p.spend_kes) && (
              <>
                <Text style={sectionTitle}>Budget</Text>
                <Text style={{ ...text, margin: '0 0 8px' }}>
                  {kes(p.spend_kes)} of {kes(p.budget_kes)} spent{budgetPct !== null ? ` (${budgetPct}%)` : ''}
                </Text>
                {budgetPct !== null && (
                  <div style={{ background: brand.border, height: 6, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ background: color, width: `${budgetPct}%`, height: '100%' }} />
                  </div>
                )}
              </>
            )}

            <Text style={sectionTitle}>Top creators</Text>
            {(p.top_creators || []).slice(0, 5).map((c, i) => (
              <Row key={i} style={{ borderBottom: `1px solid ${brand.border}`, padding: '10px 0' }}>
                <Column style={{ width: 24, color: brand.textMuted, fontSize: 13 }}>{i + 1}</Column>
                <Column>
                  <Text style={{ ...text, margin: 0, fontWeight: 600 }}>@{c.handle}</Text>
                  <Text style={{ ...muted, fontSize: 11 }}>
                    {c.platform || ''} · {fmt(c.posts)} posts · {fmt(c.views)} views
                  </Text>
                </Column>
                <Column align="right" style={{ width: 90 }}>
                  <Text style={{ ...text, margin: 0, fontWeight: 700 }}>{fmt(c.engagement)}</Text>
                  <Text style={{ ...muted, fontSize: 11 }}>engagements</Text>
                </Column>
              </Row>
            ))}
            {(!p.top_creators || p.top_creators.length === 0) && (
              <Text style={muted}>No posts yet this week.</Text>
            )}

            {p.report_url && (
              <Section style={{ margin: '28px 0 0' }}>
                <Button href={p.report_url} style={buttonStyle(color)}>Open full report</Button>
              </Section>
            )}
          </Section>

          <Section style={footerStyle}>
            <Text style={{ margin: 0 }}>
              Weekly report for {p.campaign_name}. Manage recipients in DarajaPulse.
            </Text>
            <Text style={{ margin: '6px 0 0' }}>Powered by DarajaPulse</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: CampaignWeeklyReport,
  subject: (d: Record<string, any>) =>
    `Weekly — ${d.campaign_name || 'Campaign'}: ${(d.reach ?? 0).toLocaleString('en-US')} reach`,
  displayName: 'Campaign weekly report',
  previewData: {
    client_name: 'Unilever / Vaseline',
    client_color: '#0033A0',
    campaign_name: 'Vaseline New Brand',
    week_label: 'Week of 12–18 May 2026',
    reach: 824000,
    impressions: 1640000,
    engagement: 96100,
    posts: 42,
    spend_kes: 1850000,
    budget_kes: 3000000,
    wow_engagement_pct: 12.4,
    wow_reach_pct: 6.1,
    top_creators: [
      { handle: 'thandiekenya', platform: 'Instagram', views: 220000, engagement: 18400, posts: 3 },
      { handle: 'azizi.tv', platform: 'TikTok', views: 180000, engagement: 14200, posts: 4 },
    ],
    report_url: 'https://darajapulse.com/r/sample',
  },
} satisfies TemplateEntry
