import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Link, Preview, Section, Text, Button, Row, Column, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import {
  main, container, innerPad, h1, sub, sectionTitle, text, muted, buttonStyle,
  metricGrid, metricLabel, metricValue, footerStyle, brand,
} from './_brand.ts'

interface TopCreator {
  handle: string
  full_name?: string
  platform?: string
  views: number
  engagement: number
  likes?: number
  comments?: number
  shares?: number
  saves?: number
  posts: number
  er_pct?: number
}
interface PlatformBreakdown {
  platform: string
  posts: number
  views: number
  engagement: number
}
interface TopPost {
  handle?: string
  full_name?: string
  platform?: string
  views: number
  likes: number
  comments: number
  shares: number
  saves?: number
  er_pct?: number
  post_url?: string
  posted_at?: string
}
interface SovRow {
  handle?: string
  full_name?: string
  views: number
  share_pct: number
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
  views?: number
  likes?: number
  comments?: number
  shares?: number
  total_creators?: number
  spend_kes?: number
  budget_kes?: number
  wow_engagement_pct?: number
  wow_reach_pct?: number
  wow_views_pct?: number
  top_creators?: TopCreator[]
  platforms?: PlatformBreakdown[]
  top_posts?: TopPost[]
  share_of_voice?: SovRow[]
  learnings?: string
  cumulative_views?: number
  cumulative_engagement?: number
  cumulative_posts?: number
  report_url?: string
}

const fmt = (n?: number) => (n ?? 0).toLocaleString('en-US')
const pct = (n?: number) => (typeof n === 'number' ? `${n > 0 ? '+' : ''}${n.toFixed(1)}%` : '—')
const kes = (n?: number) =>
  typeof n === 'number' ? `KES ${Math.round(n).toLocaleString('en-US')}` : '—'
const platLabel = (s?: string) =>
  !s ? '' : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

const CampaignWeeklyReport = (p: Props) => {
  const color = p.client_color || '#111111'
  const hasBudget = (p.budget_kes ?? 0) > 0 || (p.spend_kes ?? 0) > 0
  const budgetPct =
    p.budget_kes && p.budget_kes > 0 && typeof p.spend_kes === 'number'
      ? Math.min(100, Math.round((p.spend_kes / p.budget_kes) * 100))
      : null
  const platforms = (p.platforms || []).filter((x) => x && x.platform)
  const topPosts = (p.top_posts || []).slice(0, 5)
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

            {/* Headline metrics */}
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
                  {typeof p.total_creators === 'number' && (
                    <Text style={{ ...muted, fontSize: 11 }}>{fmt(p.total_creators)} creators</Text>
                  )}
                </Column>
                <Column>
                  <Text style={metricLabel}>Impressions</Text>
                  <Text style={metricValue}>{fmt(p.impressions)}</Text>
                  {typeof p.wow_views_pct === 'number' && (
                    <Text style={{ ...muted, fontSize: 11 }}>{pct(p.wow_views_pct)} WoW</Text>
                  )}
                </Column>
              </Row>
            </Section>

            {/* Engagement breakdown */}
            <Text style={sectionTitle}>Engagement breakdown</Text>
            <Section style={metricGrid}>
              <Row>
                <Column>
                  <Text style={metricLabel}>Views</Text>
                  <Text style={{ ...metricValue, fontSize: 20 }}>{fmt(p.views)}</Text>
                </Column>
                <Column>
                  <Text style={metricLabel}>Likes</Text>
                  <Text style={{ ...metricValue, fontSize: 20 }}>{fmt(p.likes)}</Text>
                </Column>
                <Column>
                  <Text style={metricLabel}>Comments</Text>
                  <Text style={{ ...metricValue, fontSize: 20 }}>{fmt(p.comments)}</Text>
                </Column>
                <Column>
                  <Text style={metricLabel}>Shares</Text>
                  <Text style={{ ...metricValue, fontSize: 20 }}>{fmt(p.shares)}</Text>
                </Column>
              </Row>
            </Section>

            {/* Platform breakdown */}
            {platforms.length > 0 && (
              <>
                <Text style={sectionTitle}>By platform</Text>
                {platforms.map((pl, i) => (
                  <Row key={i} style={{ borderBottom: `1px solid ${brand.border}`, padding: '10px 0' }}>
                    <Column>
                      <Text style={{ ...text, margin: 0, fontWeight: 600 }}>{platLabel(pl.platform)}</Text>
                      <Text style={{ ...muted, fontSize: 11 }}>{fmt(pl.posts)} posts</Text>
                    </Column>
                    <Column align="right" style={{ width: 110 }}>
                      <Text style={{ ...text, margin: 0 }}>{fmt(pl.views)}</Text>
                      <Text style={{ ...muted, fontSize: 11 }}>views</Text>
                    </Column>
                    <Column align="right" style={{ width: 110 }}>
                      <Text style={{ ...text, margin: 0 }}>{fmt(pl.engagement)}</Text>
                      <Text style={{ ...muted, fontSize: 11 }}>engagements</Text>
                    </Column>
                  </Row>
                ))}
              </>
            )}

            {/* Cumulative */}
            {(p.cumulative_views || p.cumulative_engagement || p.cumulative_posts) ? (
              <>
                <Text style={sectionTitle}>Campaign to date</Text>
                <Section style={metricGrid}>
                  <Row>
                    <Column>
                      <Text style={metricLabel}>Total posts</Text>
                      <Text style={{ ...metricValue, fontSize: 20 }}>{fmt(p.cumulative_posts)}</Text>
                    </Column>
                    <Column>
                      <Text style={metricLabel}>Total views</Text>
                      <Text style={{ ...metricValue, fontSize: 20 }}>{fmt(p.cumulative_views)}</Text>
                    </Column>
                    <Column>
                      <Text style={metricLabel}>Total engagement</Text>
                      <Text style={{ ...metricValue, fontSize: 20 }}>{fmt(p.cumulative_engagement)}</Text>
                    </Column>
                  </Row>
                </Section>
              </>
            ) : null}

            {/* Budget */}
            {hasBudget && (
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

            {/* Top creators */}
            <Text style={sectionTitle}>Top creators</Text>
            {(p.top_creators || []).slice(0, 3).map((c, i) => {
              const eng = c.engagement || 0
              const er = typeof c.er_pct === 'number' ? c.er_pct : (c.views > 0 ? (eng / c.views) * 100 : 0)
              return (
                <Section key={i} style={{ borderBottom: `1px solid ${brand.border}`, padding: '12px 0' }}>
                  <Row>
                    <Column style={{ width: 24, color: brand.textMuted, fontSize: 13, verticalAlign: 'top' }}>{i + 1}</Column>
                    <Column>
                      <Text style={{ ...text, margin: 0, fontWeight: 600 }}>{c.full_name || `@${c.handle}`}</Text>
                      <Text style={{ ...muted, fontSize: 11, margin: '2px 0 8px' }}>
                        @{c.handle} · {platLabel(c.platform)} · {fmt(c.posts)} post{c.posts === 1 ? '' : 's'}
                      </Text>
                    </Column>
                  </Row>
                  <Row>
                    <Column><Text style={metricLabel}>Views</Text><Text style={{ ...text, margin: 0, fontWeight: 600 }}>{fmt(c.views)}</Text></Column>
                    <Column><Text style={metricLabel}>Likes</Text><Text style={{ ...text, margin: 0, fontWeight: 600 }}>{fmt(c.likes || 0)}</Text></Column>
                    <Column><Text style={metricLabel}>Comments</Text><Text style={{ ...text, margin: 0, fontWeight: 600 }}>{fmt(c.comments || 0)}</Text></Column>
                    <Column><Text style={metricLabel}>Shares</Text><Text style={{ ...text, margin: 0, fontWeight: 600 }}>{fmt(c.shares || 0)}</Text></Column>
                    <Column><Text style={metricLabel}>Saves</Text><Text style={{ ...text, margin: 0, fontWeight: 600 }}>{fmt(c.saves || 0)}</Text></Column>
                    <Column><Text style={metricLabel}>ER</Text><Text style={{ ...text, margin: 0, fontWeight: 600 }}>{er.toFixed(1)}%</Text></Column>
                  </Row>
                </Section>
              )
            })}
            {(!p.top_creators || p.top_creators.length === 0) && (
              <Text style={muted}>No posts yet this week.</Text>
            )}

            {/* Top posts */}
            {topPosts.length > 0 && (
              <>
                <Text style={sectionTitle}>Top posts</Text>
                {topPosts.map((post, i) => {
                  const eng = (post.likes || 0) + (post.comments || 0) + (post.shares || 0) + (post.saves || 0)
                  const er = typeof post.er_pct === 'number' ? post.er_pct : (post.views > 0 ? (eng / post.views) * 100 : 0)
                  return (
                    <Section key={i} style={{ borderBottom: `1px solid ${brand.border}`, padding: '12px 0' }}>
                      <Row>
                        <Column style={{ width: 24, color: brand.textMuted, fontSize: 13, verticalAlign: 'top' }}>{i + 1}</Column>
                        <Column>
                          <Text style={{ ...text, margin: 0, fontWeight: 600 }}>{post.full_name || (post.handle ? `@${post.handle}` : 'Post')}</Text>
                          <Text style={{ ...muted, fontSize: 11, margin: '2px 0 8px' }}>
                            {post.handle ? `@${post.handle} · ` : ''}{platLabel(post.platform)}
                            {post.posted_at ? ` · ${new Date(post.posted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                          </Text>
                          {post.post_url && (
                            <Link href={post.post_url} style={{ color, fontSize: 11 }}>View post →</Link>
                          )}
                        </Column>
                      </Row>
                      <Row>
                        <Column><Text style={metricLabel}>Views</Text><Text style={{ ...text, margin: 0, fontWeight: 600 }}>{fmt(post.views)}</Text></Column>
                        <Column><Text style={metricLabel}>Likes</Text><Text style={{ ...text, margin: 0, fontWeight: 600 }}>{fmt(post.likes)}</Text></Column>
                        <Column><Text style={metricLabel}>Comments</Text><Text style={{ ...text, margin: 0, fontWeight: 600 }}>{fmt(post.comments)}</Text></Column>
                        <Column><Text style={metricLabel}>Shares</Text><Text style={{ ...text, margin: 0, fontWeight: 600 }}>{fmt(post.shares)}</Text></Column>
                        <Column><Text style={metricLabel}>Saves</Text><Text style={{ ...text, margin: 0, fontWeight: 600 }}>{fmt(post.saves || 0)}</Text></Column>
                        <Column><Text style={metricLabel}>ER</Text><Text style={{ ...text, margin: 0, fontWeight: 600 }}>{er.toFixed(1)}%</Text></Column>
                      </Row>
                    </Section>
                  )
                })}
              </>
            )}

            {/* Share of voice */}
            {(p.share_of_voice || []).length > 0 && (
              <>
                <Text style={sectionTitle}>Share of voice</Text>
                {(p.share_of_voice || []).slice(0, 8).map((r, i) => (
                  <Row key={i} style={{ padding: '6px 0' }}>
                    <Column><Text style={{ ...text, margin: 0 }}>{r.full_name || `@${r.handle || '—'}`}</Text></Column>
                    <Column align="right" style={{ width: 80 }}>
                      <Text style={{ ...text, margin: 0, fontWeight: 700 }}>{r.share_pct.toFixed(1)}%</Text>
                    </Column>
                    <Column align="right" style={{ width: 90 }}>
                      <Text style={{ ...muted, fontSize: 11, margin: 0 }}>{fmt(r.views)} views</Text>
                    </Column>
                  </Row>
                ))}
              </>
            )}

            {/* Learnings */}
            {p.learnings && p.learnings.trim().length > 0 && (
              <>
                <Text style={sectionTitle}>Learnings & recommendations</Text>
                <Text style={{ ...text, whiteSpace: 'pre-wrap' }}>{p.learnings}</Text>
              </>
            )}

            {p.report_url && (
              <Section style={{ margin: '28px 0 0' }}>
                <Button href={p.report_url} style={buttonStyle(color)}>Open live report</Button>
                <Text style={{ ...muted, fontSize: 11, marginTop: 8 }}>
                  The live report stays in sync as new posts and metrics roll in.
                </Text>
              </Section>
            )}
          </Section>

          <Section style={footerStyle}>
            <Text style={{ margin: 0 }}>
              Weekly report for {p.campaign_name}. Manage recipients in Daraja Pulse.
            </Text>
            <Text style={{ margin: '6px 0 0' }}>Powered by Daraja Pulse</Text>
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
    views: 1640000,
    likes: 71200,
    comments: 18600,
    shares: 6300,
    total_creators: 18,
    spend_kes: 1850000,
    budget_kes: 3000000,
    wow_engagement_pct: 12.4,
    wow_reach_pct: 6.1,
    wow_views_pct: 9.2,
    platforms: [
      { platform: 'tiktok', posts: 22, views: 980000, engagement: 54200 },
      { platform: 'instagram', posts: 14, views: 510000, engagement: 32100 },
      { platform: 'facebook', posts: 6, views: 150000, engagement: 9800 },
    ],
    top_creators: [
      { handle: 'thandiekenya', platform: 'instagram', views: 220000, engagement: 18400, posts: 3 },
      { handle: 'azizi.tv', platform: 'tiktok', views: 180000, engagement: 14200, posts: 4 },
    ],
    top_posts: [
      { handle: 'thandiekenya', platform: 'instagram', views: 120000, likes: 9800, comments: 410, shares: 220, post_url: 'https://instagram.com/p/x', posted_at: '2026-05-16' },
      { handle: 'azizi.tv', platform: 'tiktok', views: 96000, likes: 7600, comments: 380, shares: 510, post_url: 'https://tiktok.com/@x/video/1', posted_at: '2026-05-15' },
    ],
    cumulative_posts: 184,
    cumulative_views: 6420000,
    cumulative_engagement: 412800,
    report_url: 'https://darajapulse.com/r/sample',
  },
} satisfies TemplateEntry
