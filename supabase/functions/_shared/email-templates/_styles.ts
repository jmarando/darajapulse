// Shared editorial brand styles for Daraja Pulse emails.
// Body bg stays white per platform rules; the cream card sits inside.

export const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif",
  margin: 0,
  padding: '32px 12px',
}
export const container = {
  backgroundColor: '#faf6f0',
  border: '1px solid #ece5d8',
  borderRadius: '14px',
  padding: '40px 36px',
  maxWidth: '560px',
  margin: '0 auto',
}
export const logoUrl = 'https://darajapulse.com/email-logo.png'
export const logoImg = {
  display: 'block',
  width: '210px',
  height: 'auto',
  margin: '0 0 26px',
}
export const wordmark = {

  fontSize: '11px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase' as const,
  color: '#1c1815',
  fontWeight: 600 as const,
  margin: '0 0 28px',
}
export const dot = {
  display: 'inline-block',
  width: '7px',
  height: '7px',
  backgroundColor: '#fe2424',
  borderRadius: '50%',
  marginRight: '8px',
  verticalAlign: 'middle' as const,
}
export const h1 = {
  fontFamily: "'Instrument Serif', 'Iowan Old Style', Georgia, 'Times New Roman', serif",
  fontSize: '34px',
  lineHeight: '1.1',
  fontWeight: 400 as const,
  color: '#1c1815',
  letterSpacing: '-0.01em',
  margin: '0 0 18px',
}
export const text = {
  fontSize: '15px',
  color: '#3d3833',
  lineHeight: '1.6',
  margin: '0 0 24px',
}
export const link = { color: '#1c1815', textDecoration: 'underline' }
export const button = {
  backgroundColor: '#fe2424',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 600 as const,
  letterSpacing: '0.01em',
  borderRadius: '10px',
  padding: '13px 22px',
  textDecoration: 'none',
  display: 'inline-block',
}
export const codeStyle = {
  fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
  fontSize: '28px',
  letterSpacing: '0.18em',
  fontWeight: 600 as const,
  color: '#1c1815',
  backgroundColor: '#ffffff',
  border: '1px solid #ece5d8',
  borderRadius: '10px',
  padding: '14px 20px',
  display: 'inline-block',
  margin: '0 0 28px',
}
export const divider = {
  border: 'none',
  borderTop: '1px solid #ece5d8',
  margin: '32px 0 20px',
}
export const footer = {
  fontSize: '12px',
  color: '#8a847d',
  lineHeight: '1.5',
  margin: 0,
}
export const tagline = {
  fontFamily: "'Instrument Serif', Georgia, serif",
  fontSize: '14px',
  fontStyle: 'italic' as const,
  color: '#1c1815',
  margin: '0 0 6px',
}
