/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Text } from 'npm:@react-email/components@0.0.22'
import { main, container, wordmark, dot, h1, text, button, divider, footer, tagline, logoUrl, logoImg } from './_styles.ts'

interface RecoveryEmailProps { siteName: string; confirmationUrl: string }

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your {siteName} password</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={logoUrl} alt="Daraja Pulse" width="210" style={logoImg} />
        <Heading style={h1}>Reset your password.</Heading>
        <Text style={text}>We received a request to reset the password for your {siteName} account. Choose a new one below.</Text>
        <Button style={button} href={confirmationUrl}>Reset password</Button>
        <Hr style={divider} />
        <Text style={tagline}>Influence, measured.</Text>
        <Text style={footer}>Didn't ask for a reset? Ignore this email — your password won't change.</Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail
