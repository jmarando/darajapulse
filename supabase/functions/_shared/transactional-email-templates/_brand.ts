// Shared inline-style tokens for DarajaPulse / client-branded report emails.

export const brand = {
  bgPage: '#ffffff',
  bgPanel: '#f7f7f5',
  textBody: '#1f1f1f',
  textMuted: '#6b6b6b',
  border: '#e5e5e0',
  accent: '#111111', // default; per-email we override with client primary
};

export const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  margin: 0,
  padding: 0,
  color: brand.textBody,
};

export const container = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '0',
};

export const innerPad = { padding: '28px 32px' };

export const h1 = {
  fontSize: '22px',
  fontWeight: 700,
  margin: '0 0 6px',
  letterSpacing: '-0.01em',
  color: brand.textBody,
};

export const sub = {
  fontSize: '13px',
  margin: '0 0 24px',
  color: brand.textMuted,
};

export const sectionTitle = {
  fontSize: '11px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  fontWeight: 600,
  color: brand.textMuted,
  margin: '24px 0 8px',
};

export const text = {
  fontSize: '14px',
  lineHeight: 1.55,
  color: brand.textBody,
  margin: '0 0 12px',
};

export const muted = {
  fontSize: '12px',
  lineHeight: 1.55,
  color: brand.textMuted,
  margin: '0',
};

export const buttonStyle = (color: string) => ({
  background: color,
  color: '#ffffff',
  borderRadius: '6px',
  padding: '12px 22px',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
});

export const metricGrid = {
  borderTop: `1px solid ${brand.border}`,
  borderBottom: `1px solid ${brand.border}`,
  padding: '14px 0',
  margin: '8px 0 20px',
};

export const metricLabel = {
  fontSize: '11px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: brand.textMuted,
  margin: '0 0 2px',
};

export const metricValue = {
  fontSize: '20px',
  fontWeight: 700,
  margin: '0',
  color: brand.textBody,
};

export const footerStyle = {
  borderTop: `1px solid ${brand.border}`,
  padding: '20px 32px',
  fontSize: '11px',
  color: brand.textMuted,
  textAlign: 'center' as const,
};
