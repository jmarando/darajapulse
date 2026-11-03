import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Img, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, text, logoUrl, logoImg } from '../email-templates/_styles.ts'

const BrandChannelsCredits = () => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Public numbers for brand channels are paused.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={logoUrl} alt="Daraja Pulse" width="210" style={logoImg} />
        <Heading style={h1}>Public numbers for brand channels are paused</Heading>
        <Text style={text}>ScrapeCreators is out of credits or below the floor of 300.</Text>
        <Text style={text}>Top it up and the next night's run starts again by itself. Campaign metrics and Listening use the same balance.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BrandChannelsCredits,
  subject: 'Public numbers for brand channels are paused',
  displayName: 'Brand channels: out of credits',
  previewData: {},
} satisfies TemplateEntry
