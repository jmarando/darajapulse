/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Text } from 'npm:@react-email/components@0.0.22'
import { main, container, wordmark, dot, h1, text, link, button, divider, footer, tagline, logoUrl, logoImg } from './_styles.ts'

interface SignupEmailProps { siteName: string; siteUrl: string; recipient: string; confirmationUrl: string }

export const SignupEmail = ({ siteName, siteUrl, recipient, confirmationUrl }: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email to start measuring influence on {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={logoUrl} alt="Daraja Pulse" width="210" style={logoImg} />
        <Heading style={h1}>Confirm your email.</Heading>
        <Text style={text}>
          Welcome to{' '}
          <Link href={siteUrl} style={link}><strong>{siteName}</strong></Link>. Confirm{' '}
          <Link href={`mailto:${recipient}`} style={link}>{recipient}</Link>{' '}to brief, publish, measure & pay creators across TikTok, Instagram, YouTube & X.
        </Text>
        <Button style={button} href={confirmationUrl}>Verify email</Button>
        <Hr style={divider} />
        <Text style={tagline}>Influence, measured.</Text>
        <Text style={footer}>If you didn't create an account, you can safely ignore this email.</Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
