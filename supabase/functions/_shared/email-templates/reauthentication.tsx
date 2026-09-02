/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Hr, Html, Img, Preview, Text } from 'npm:@react-email/components@0.0.22'
import { main, container, wordmark, dot, h1, text, codeStyle, divider, footer, tagline, logoUrl, logoImg } from './_styles.ts'

interface ReauthenticationEmailProps { token: string }

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Daraja Pulse verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={logoUrl} alt="Daraja Pulse" width="150" style={logoImg} />
        <Heading style={h1}>Confirm it's you.</Heading>
        <Text style={text}>Use this verification code to confirm your identity:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Hr style={divider} />
        <Text style={tagline}>Influence, measured.</Text>
        <Text style={footer}>Code expires shortly. Didn't request it? Ignore this email.</Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
