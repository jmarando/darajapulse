/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Text } from 'npm:@react-email/components@0.0.22'
import { main, container, wordmark, dot, h1, text, link, button, divider, footer, tagline } from './_styles.ts'

interface InviteEmailProps { siteName: string; siteUrl: string; confirmationUrl: string }

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={wordmark}><span style={dot} />Daraja Pulse</Text>
        <Heading style={h1}>You're invited.</Heading>
        <Text style={text}>
          You've been invited to join{' '}
          <Link href={siteUrl} style={link}><strong>{siteName}</strong></Link>{' '}— the platform to brief, publish, measure & pay creators across TikTok, Instagram, YouTube & X. Click below to accept the invite and choose a password for your account.
        </Text>
        <Button style={button} href={confirmationUrl}>Accept & set password</Button>
        <Hr style={divider} />
        <Text style={tagline}>Influence, measured.</Text>
        <Text style={footer}>Not expecting this? You can safely ignore the email.</Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
