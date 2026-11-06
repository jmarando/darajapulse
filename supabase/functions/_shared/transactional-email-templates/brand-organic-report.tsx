import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, text, link, button, divider, footer, logoUrl, logoImg } from '../email-templates/_styles.ts'

interface Props {
  subject?: string
  brand_name?: string
  month_label?: string
  tiles?: { label: string; value: string; change: string | null }[]
  top_post?: { title: string; platform: string; views: string; url: string } | null
  notes?: string[]
  sources_line?: string
  share_url?: string
  test?: boolean
}

const row = { ...text, margin: '0 0 8px' }
const meta = { color: '#6b6b6b', fontSize: '13px' }
const banner = { ...text, margin: '0 0 16px', padding: '8px 12px', backgroundColor: '#f7f7f5', borderRadius: '8px', fontSize: '13px' }

const BrandOrganicReport = ({ brand_name, month_label, tiles = [], top_post, notes = [], sources_line, share_url, test }: Props) => {
  const brand = brand_name || 'your brand'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${brand} in ${month_label ?? ''}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={logoUrl} alt="Daraja Pulse" width="210" style={logoImg} />
          {test && <Text style={banner}>This is a test. Only you got it.</Text>}
          <Heading style={h1}>{brand} in {month_label}</Heading>
          {tiles.map((tile) => (
            <Text key={tile.label} style={row}>
              {tile.label}: <strong>{tile.value}</strong>
              {tile.change && <span style={meta}> ({tile.change} on the month before)</span>}
            </Text>
          ))}
          {top_post && (
            <>
              <Hr style={divider} />
              <Text style={row}>Most viewed post</Text>
              <Text style={row}>
                {top_post.url ? <Link href={top_post.url} style={link}>{top_post.title}</Link> : top_post.title}
                <br />
                <span style={meta}>{top_post.platform} · {top_post.views} views</span>
              </Text>
            </>
          )}
          {share_url && <Button style={button} href={share_url}>See the full report</Button>}
          {(sources_line || notes.length > 0) && <Hr style={divider} />}
          {sources_line && <Text style={footer}>{sources_line}</Text>}
          {notes.map((note) => <Text key={note} style={footer}>{note}</Text>)}
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: BrandOrganicReport,
  subject: (data: Record<string, any>) => data.subject || 'Your monthly organic report',
  displayName: 'Brand channels: monthly report',
  previewData: {
    subject: 'Sample Brand in October 2026: 3.4k views on 4 posts',
    brand_name: 'Sample Brand',
    month_label: 'October 2026',
    tiles: [{ label: 'Followers', value: '1.6k', change: '+100' }, { label: 'Posts', value: '4', change: '+3' }, { label: 'Views', value: '3.4k', change: null }],
    top_post: { title: 'A sample post', platform: 'TikTok', views: '2k', url: 'https://darajapulse.com' },
    notes: [],
    sources_line: 'TikTok from public numbers.',
    share_url: 'https://darajapulse.com',
    test: false,
  },
} satisfies TemplateEntry
