import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, wordmark, dot, h1, text, link, button, divider, footer, tagline } from '../email-templates/_styles.ts'

interface Props {
  org_name?: string
  access_label?: string
  sign_in_url?: string
}

const WorkspaceAccess = ({ org_name, access_label, sign_in_url }: Props) => {
  const organisation = org_name || 'a Daraja Pulse workspace'
  const access = access_label || 'workspace member'
  const url = sign_in_url || 'https://darajapulse.com/auth'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Welcome to Daraja Pulse — your access to {organisation} is ready</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={wordmark}><span style={dot} />Daraja Pulse</Text>
          <Heading style={h1}>Welcome to Daraja Pulse.</Heading>
          <Text style={text}>
            You have been invited to join <strong>{organisation}</strong> as a <strong>{access}</strong>.
          </Text>
          <Text style={text}>
            Daraja Pulse is the platform to brief, publish, measure and pay creators across TikTok, Instagram, YouTube and X. Click the button below to set up your account and get started.
          </Text>
          <Text style={text}>
            Already have a Daraja Pulse account? Use the same button to sign in — your new workspace access will be waiting for you.
          </Text>
          <Button style={button} href={url}>Set up your account</Button>
          <Hr style={divider} />
          <Text style={tagline}>Influence, measured.</Text>
          <Text style={footer}>
            Not expecting this invitation? You can safely ignore it. If you have questions, contact the person who invited you or reply to this email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: WorkspaceAccess,
  subject: (data: Record<string, any>) => `Welcome to Daraja Pulse — you're invited to ${data.org_name || 'a workspace'}`,
  displayName: 'Workspace access',
  previewData: {
    org_name: 'Acme Kenya',
    access_label: 'team member',
    sign_in_url: 'https://darajapulse.com/auth',
  },
} satisfies TemplateEntry
