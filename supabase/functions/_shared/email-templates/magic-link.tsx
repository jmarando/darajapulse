/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Text } from 'npm:@react-email/components@0.0.22'
import { main, container, wordmark, dot, h1, text, button, divider, footer, tagline, logoUrl, logoImg } from './_styles.ts'

interface MagicLinkEmailProps { siteName: string; confirmationUrl: string }

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your secure login link for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={logoUrl} alt="Daraja Pulse" width="210" style={logoImg} />
        <Heading style={h1}>Your login link.</Heading>
        <Text style={text}>Tap below to sign in to {siteName}. The link expires shortly, so use it soon.</Text>
        <Button style={button} href={confirmationUrl}>Log in</Button>
        <Hr style={divider} />
        <Text style={tagline}>Influence, measured.</Text>
        <Text style={footer}>Didn't request this? Ignore the email — your account stays secure.</Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
