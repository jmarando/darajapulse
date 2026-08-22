# WhatsApp messaging for creators (Meta Cloud API, two-way)

Add a WhatsApp channel alongside "Email creators": broadcast approved templates to a campaign roster, receive replies in an in-app inbox, and track delivery/read status.

## The journey, end to end

### 1. Meta setup (you, one-off — about a day plus review time)
1. In Meta Business Suite, confirm a verified Business (Daraja Pulse). Business verification is required before you can message beyond test numbers.
2. At developers.facebook.com, create an app of type **Business**, add the **WhatsApp** product.
3. Create/attach a **WhatsApp Business Account (WABA)** and register a phone number (a fresh line, or an existing one migrated off the consumer app). Verify it by SMS/voice.
4. Note four values: **Phone Number ID**, **WABA ID**, **App Secret**, and a **System User permanent access token** (Business Settings → System Users → generate token with `whatsapp_business_messaging` + `whatsapp_business_management`). Temporary tokens expire in 24h — use the permanent one.
5. Submit **message templates** for approval (Meta requires a pre-approved template for any message you send outside a 24-hour window). Approval is usually minutes to a day.
6. Point the app's **Webhooks → WhatsApp Business Account** at our callback URL with a verify token, and subscribe to the `messages` field. The callback URL comes from step 3 of the build below, so we deploy the function first.

### 2. What we build
- **Secrets**: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (the last one generated for you).
- **Tables**
  - `whatsapp_templates` — mirror of approved Meta templates (name, language, body preview, variable list, status) so the UI can offer them.
  - `whatsapp_messages` — one row per outbound/inbound message: influencer_id, campaign_id, wa_id (E.164), direction, template name, body, `wamid`, status (`queued|sent|delivered|read|failed`), error, timestamps.
  - `whatsapp_conversations` — one row per creator number: last message at, last inbound at (drives the 24-hour free-form window), unread count.
  - `whatsapp_opt_outs` — numbers that replied STOP; the sender always skips these.
  - RLS: agency staff on the campaign can read/write their agency's rows; service role for the functions.
- **Edge functions**
  - `whatsapp-send` (JWT verified) — takes campaign + recipient list + template + variables, normalizes `phone_mpesa` to E.164 (`+254…`), skips opt-outs and invalid numbers, calls Graph API `/{phone-number-id}/messages`, writes `whatsapp_messages` rows with the returned `wamid`. Throttled in batches so we stay under Meta's per-second and daily tier limits.
  - `whatsapp-webhook` (public, `verify_jwt = false`) — `GET` answers Meta's `hub.challenge` handshake; `POST` validates the `X-Hub-Signature-256` HMAC against the app secret, then upserts status callbacks (sent/delivered/read/failed) and stores inbound replies, auto-handling STOP/UNSTOP.
  - `whatsapp-sync-templates` — pulls approved templates from the WABA so the picker stays current.
- **UI**
  - `BroadcastCreatorsDialog` gets a **WhatsApp** tab next to the email tabs: recipient count with reachable/unreachable split, template picker, variable preview per creator, send with live progress.
  - New **Inbox** panel on the campaign page: conversation list (creator, last message, unread) and a thread view. Inside a 24-hour window since their last reply you can type free text; outside it the composer switches to template-only, with the reason shown.
  - Per-creator card gets a WhatsApp status chip (delivered / read / replied / opted out), replacing the current plain `wa.me` link with a real send.

### 3. Ongoing behaviour
- Sending outside 24h = template only, and each template message is billed by Meta per conversation (roughly a few US cents in Kenya).
- Replies land in the inbox and open the 24h window automatically; unread badges surface on the campaign.
- STOP replies opt the creator out permanently until they message again.

## Technical notes
- Numbers come from `influencers.phone_mpesa`, normalized to E.164 (strip non-digits, `07…` → `2547…`, keep `254…`). Rows that don't normalize are shown as unreachable rather than silently dropped.
- Graph API v21.0, same version already used by the Facebook/Instagram functions.
- Webhook must return 200 fast; signature verification uses the raw body before JSON parse.
- `supabase/config.toml` gets `verify_jwt = false` for `whatsapp-webhook` only.

## Build order
1. Migration for the four tables + RLS/grants.
2. Deploy `whatsapp-webhook`, give you the callback URL and verify token for the Meta dashboard.
3. Collect the Meta secrets once your app exists.
4. `whatsapp-send` + template sync, then the UI tab and inbox.
5. Test send to your own number before broadcasting to the roster.
