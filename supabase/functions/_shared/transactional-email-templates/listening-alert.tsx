import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, text, link, button, divider, footer, logoUrl, logoImg } from '../email-templates/_styles.ts'

type Item =
  | { kind: 'post'; title: string; platform: string; views: string; at: string; url: string }
  | { kind: 'spike'; text: string }

interface Props {
  subject?: string
  brand_name?: string
  level?: 'watch' | 'act'
  headline?: string
  items?: Item[]
  open_url?: string
  test?: boolean
}

const nairobiTime = (iso: string) => {
  try {
    return `${new Date(iso).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} Nairobi time`
  } catch {
    return ''
  }
}

const row = { ...text, margin: '0 0 14px' }
const meta = { color: '#6b6b6b', fontSize: '13px' }
const banner = { ...text, margin: '0 0 16px', padding: '8px 12px', backgroundColor: '#f7f7f5', borderRadius: '8px', fontSize: '13px' }

const ListeningAlert = ({ brand_name, level, headline, items = [], open_url, test }: Props) => {
  const brand = brand_name || 'your brand'
  const tag = level === 'act' ? 'Act' : 'Watch'
  const tagStyle = { ...text, margin: '0 0 6px', fontSize: '12px', fontWeight: 700 as const, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: level === 'act' ? '#b42318' : '#a85b00' }

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{tag}: {headline}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={logoUrl} alt="Daraja Pulse" width="210" style={logoImg} />
          {test && <Text style={banner}>This is a test. Nothing has gone wrong.</Text>}
          <Text style={tagStyle}>{tag}</Text>
          <Heading style={h1}>{headline}</Heading>
          {items.map((item, i) =>
            item.kind === 'post' ? (
              <Text key={i} style={row}>
                <Link href={item.url} style={link}>{item.title}</Link>
                <br />
                <span style={meta}>{item.platform} · {item.views} views · {nairobiTime(item.at)}</span>
              </Text>
            ) : (
              <Text key={i} style={row}>{item.text}</Text>
            ),
          )}
          <Button style={button} href={open_url || 'https://darajapulse.com/app/listening'}>Open in Pulse</Button>
          <Hr style={divider} />
          <Text style={footer}>
            You get this because you are on the alert list for {brand} in Daraja Pulse. We send at most one email an hour for a brand, and only about
            something new. Views are what each platform reports.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ListeningAlert,
  subject: (data: Record<string, any>) => data.subject || 'Listening alert',
  displayName: 'Listening alert',
  previewData: {
    subject: 'Watch: a negative post about Sample Brand has 12k views',
    brand_name: 'Sample Brand',
    level: 'watch',
    headline: 'A negative post about Sample Brand is picking up: 12k views.',
    items: [{ kind: 'post', title: 'A sample post', platform: 'TikTok', views: '12k', at: '2026-11-03T05:10:00Z', url: 'https://darajapulse.com' }],
    open_url: 'https://darajapulse.com/app/listening',
    test: false,
  },
} satisfies TemplateEntry
