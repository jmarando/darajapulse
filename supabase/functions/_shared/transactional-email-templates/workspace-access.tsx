import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, wordmark, dot, h1, text, button, divider, footer, tagline } from '../email-templates/_styles.ts'

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
      <Preview>You now have access to {organisation} on Daraja Pulse</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={wordmark}><span style={dot} />Daraja Pulse</Text>
          <Heading style={h1}>Your access is ready.</Heading>
          <Text style={text}>
            You have been added to <strong>{organisation}</strong> as a <strong>{access}</strong>.
            Sign in with your existing Daraja Pulse email and password to continue.
          </Text>
          <Button style={button} href={url}>Sign in to Daraja Pulse</Button>
          <Hr style={divider} />
          <Text style={tagline}>Influence, measured.</Text>
          <Text style={footer}>Not expecting this access? Contact the person who invited you.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: WorkspaceAccess,
  subject: (data: Record<string, any>) => `You now have access to ${data.org_name || 'Daraja Pulse'}`,
  displayName: 'Workspace access',
  previewData: {
    org_name: 'Acme Kenya',
    access_label: 'team member',
    sign_in_url: 'https://darajapulse.com/auth',
  },
} satisfies TemplateEntry