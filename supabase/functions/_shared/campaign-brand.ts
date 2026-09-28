// Shared by the dashboard and draft-review function. Do not infer a brand from
// "Unilever" alone: its OMO and Royco campaigns have distinct identities.
export type CampaignBrand = {
  name: string;
  from: string;
  replyTo: string;
  briefTemplate: string;
  decisionTemplate: string;
  accent: string;
  secondary: string;
  kind: 'omo' | 'royco' | 'generic';
};

export function resolveCampaignBrand(campaignName: string, clientName?: string | null): CampaignBrand {
  const text = `${campaignName} ${clientName ?? ''}`;
  if (/\bomo\b/i.test(text)) return {
    name: 'OMO', kind: 'omo', from: 'OMO x Daraja Pulse <omo@darajapulse.com>',
    replyTo: 'omo@reply.darajapulse.com', briefTemplate: 'omo-brief-live',
    decisionTemplate: 'campaign-draft-decision', accent: '#0033A0', secondary: '#FF5A00',
  };
  if (/\broyco\b/i.test(text)) return {
    name: 'Royco', kind: 'royco', from: 'Royco x Daraja Pulse <royco@darajapulse.com>',
    replyTo: 'royco@reply.darajapulse.com', briefTemplate: 'royco-brief-live',
    decisionTemplate: 'royco-draft-decision', accent: '#E4002B', secondary: '#FFC72C',
  };
  // Unknown campaigns never inherit another client's copy or sender address.
  const name = (clientName || campaignName || 'Campaign').trim().slice(0, 60);
  return {
    name, kind: 'generic', from: `${name.replace(/[<>\r\n]/g, '')} x Daraja Pulse <campaigns@darajapulse.com>`,
    replyTo: 'campaigns@reply.darajapulse.com', briefTemplate: 'campaign-brief-live',
    decisionTemplate: 'campaign-draft-decision', accent: '#146C65', secondary: '#E09A38',
  };
}