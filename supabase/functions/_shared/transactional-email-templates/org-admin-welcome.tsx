import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, innerPad, h1, text, muted, buttonStyle, footerStyle } from './_brand.ts'

interface Props {
  org_name?: string
  org_kind?: 'agency' | 'brand_org'
  sign_in_url?: string
  app_url?: string
}

const OrgAdminWelcome = ({ org_name, org_kind, sign_in_url, app_url }: Props) => {
  const what = org_kind === 'brand_org' ? 'brand' : 'agency'
  const url = sign_in_url || app_url || 'https://darajapulse.com/app'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`You're the admin for ${org_name || 'your ' + what} on Daraja Pulse`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={innerPad}>
            <Heading style={h1}>You're the admin for {org_name || `your ${what}`}.</Heading>
            <Text style={text}>
              An account has been set up for you on <strong>Daraja Pulse</strong> as the admin for{' '}
              <strong>{org_name || `your ${what}`}</strong>. You can manage clients, campaigns, creators, content,
              moderation, and reporting from your dashboard.
            </Text>
            <Text style={text}>Use the secure link below to sign in. It will log you straight into your workspace.</Text>
            <Button style={buttonStyle('#111111')} href={url}>Sign in to Daraja Pulse</Button>
            <Text style={{ ...muted, marginTop: 16 }}>
              If the button doesn't work, paste this link into your browser:<br />
              {url}
            </Text>
          </Section>
          <Section style={footerStyle}>
            Daraja Pulse — Influence, measured.
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: OrgAdminWelcome,
  subject: (d: Record<string, any>) => `You're the admin for ${d.org_name || 'your account'} on Daraja Pulse`,
  displayName: 'Org admin welcome',
  previewData: { org_name: 'The Africa Growth Lab', org_kind: 'agency', sign_in_url: 'https://darajapulse.com/app' },
} satisfies TemplateEntry
