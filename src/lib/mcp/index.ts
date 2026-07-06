import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCampaigns from "./tools/list-campaigns";
import listClients from "./tools/list-clients";
import listInfluencers from "./tools/list-influencers";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "daraja-pulse-mcp",
  title: "Daraja Pulse",
  version: "0.1.0",
  instructions:
    "Read-only access to the signed-in user's Daraja Pulse workspace: clients, campaigns, and influencers. Use list_clients to discover brands, list_campaigns for campaign status and dates, and list_influencers to see rostered creators (optionally scoped to a campaign).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCampaigns, listClients, listInfluencers],
});
