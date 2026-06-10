
# Whitelabel, Tenancy, Billing & Access Control

Goal: turn Daraja Pulse into a multi-tenant SaaS with two paid surfaces (Agency whitelabel KES 45k/mo + Brand-direct portal KES 180k/quarter), Pesapal-collected subscriptions, M-Pesa payout invoicing, and per-role access control. Subdomain whitelabel ships now, custom domains in phase 2.

---

## 1. Tenancy model

Introduce a top-level `agencies` table (alongside existing `clients`). Every existing record (clients, campaigns, contests, influencers, profiles) gets an `agency_id`. The current single-tenant data backfills into one "default" agency owned by you.

New top-level types:
- **Agency** — a whitelabel tenant. Has subdomain, logo, brand color, billing profile, seats (max 5 AM by default).
- **Brand** (= existing `clients`, extended) — can now exist either inside an agency OR as a standalone brand-direct tenant (`is_direct = true`, no agency_id).
- **BrandOrg** — new optional grouping for brand-direct customers that aggregates many client rows fed by different agencies (the "5 agencies → 1 view" rollup).

Resolution at request time: middleware reads `host` header → looks up `agencies.subdomain` (e.g. `acme.darajapulse.com`) or `brand_orgs.subdomain` → sets `tenant` in context. Root domain `darajapulse.com` keeps the marketing site + super-admin.

Phase 2: `agency_domains` / `brand_org_domains` tables for custom CNAMEs; Lovable custom-domain DNS handles SSL.

## 2. Signup & onboarding flows (different per persona)

Three distinct entry points on the marketing site:

```text
/signup/agency   →  creates agency, owner becomes agency_admin
/signup/brand    →  creates brand_org, owner becomes brand_owner
/signup/creator  →  unchanged (existing influencer flow)
```

- **Agency signup**: company name → auto-generate subdomain → choose plan → Pesapal checkout for KES 45k → on success, agency is provisioned, owner lands in `/app` whitelabeled.
- **Agency invites clients**: existing `clients` flow stays, but the agency owner controls visibility — by default the brand contact does NOT get a login. The agency can toggle "Give client portal access" per client, which sends a Pesapal-skipping invite to `/portal` scoped to that client only (re-uses existing `invite-client-user` edge function).
- **Brand-direct signup**: brand name → subdomain → Pesapal checkout for KES 180k quarterly → brand_org created → brand_owner can then "invite agency" by email; the invited agency either links its existing account or creates one, and chooses which of its clients/campaigns to feed into this brand_org. Agency keeps editing rights; brand sees read-only rollup.

## 3. Whitelabel branding

New `branding` columns on `agencies` (and `brand_orgs`): `logo_url`, `display_name`, `primary_color`, `support_email`, `legal_name`, `kra_pin`, `invoice_address`. Loaded once per session into a `TenantContext`. `PortalShell` and `AppShell` read logo + colors from context instead of hard-coded `logo-pulse-mark.png`. Public report/brief/contest pages use the agency branding of the owning campaign. "Powered by Daraja Pulse" footer toggle (off on paid agency plans).

## 4. Roles & access control

Extend `app_role` enum:
- `super_admin` (you only, root domain)
- `agency_admin`, `account_manager` (already exist) — scoped to one agency
- `brand_owner`, `brand_viewer` — scoped to one brand_org
- `client_user`, `client_viewer` — scoped to one client, already exist
- `influencer` — unchanged

Add `agency_id` to `user_roles` so the same email can hold roles in multiple agencies (rare but needed for freelancers). RLS rewritten so every query is bounded by `current_tenant_agency()` / `current_tenant_brand_org()` security-definer functions reading from a session GUC set by the edge / API layer.

Access matrix highlights:
- Agency admin: full agency, manages seats, sees billing, can grant per-client portal access.
- Account manager: only campaigns/clients they're a team member of (existing logic, scoped to agency).
- Brand owner: read-only rollup across all linked agencies + their own invoices.
- Client user: only their own client's campaigns (existing).

## 5. Billing & invoicing (Pesapal)

New tables: `billing_plans`, `subscriptions`, `invoices`, `invoice_lines`, `payments`, `pesapal_events`.

- **Plans seeded**: `agency_monthly` (KES 45000, recurring monthly), `brand_quarterly` (KES 180000, recurring quarterly), `payout_fee` (1.4% + KES 25, usage-based — invoiced monthly per agency).
- **Pesapal integration**: new edge functions
  - `pesapal-create-order` — auth → returns redirect URL (API 3.0 `SubmitOrderRequest`).
  - `pesapal-ipn` — registered IPN endpoint, marks invoice paid, activates/extends subscription.
  - `pesapal-status` — manual reconcile.
  Secrets: `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET`, `PESAPAL_ENV` (`sandbox`|`live`), `PESAPAL_IPN_ID`.
- **Recurring**: Pesapal does not do native recurring for our use case → we schedule next invoice via existing cron (`run-report-schedules` pattern) 5 days before period end and email a hosted-checkout link.
- **Payout fee**: when a payout is recorded in `payouts`, append a line to the agency's current `usage_invoice`. Closed monthly into a sendable invoice.
- **e-TIMS-ready invoice PDF**: generated server-side (existing `exportReport.ts` patterns) with KRA PIN, line items, VAT 16%, WHT line where applicable. Stored in new `invoices` bucket. Downloadable + emailable. Actual e-TIMS submission is out of scope v1 — we just produce a compliant PDF the agency uploads.

UI: new `/app/billing` for agency admins (invoices list, current plan, payment method, download PDF) and `/portal/billing` for brand owners.

## 6. Pesapal flow specifics

1. User clicks Pay → frontend calls `pesapal-create-order` with `invoice_id`.
2. Edge function POSTs to `https://pay.pesapal.com/v3/api/Transactions/SubmitOrderRequest` with bearer token from `/api/Auth/RequestToken`. Includes `notification_id` (registered IPN), `callback_url` back to `/app/billing/return?invoice={id}`.
3. Returns `redirect_url` → frontend `window.location`.
4. Pesapal POSTs IPN to `pesapal-ipn` → we call `/api/Transactions/GetTransactionStatus` → mark invoice paid + extend subscription `current_period_end`.

## 7. Migration order

1. `agencies`, `brand_orgs`, branding columns, `agency_id` everywhere, backfill default agency, rewrite RLS.
2. Tenant host resolver + `TenantContext` + dynamic logo/colors in shells + public pages.
3. Three signup pages + role assignments.
4. Billing tables + Pesapal edge functions + checkout UI + invoice PDF.
5. Brand-direct rollup view (read-only aggregation across linked agencies).
6. Phase 2: custom domains, e-TIMS API integration if/when KRA SDK access granted.

## 8. Open items I need from you before building

- **Pesapal account**: do you have a live merchant account already, or should we start in sandbox? I'll need `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET` added as secrets when you're ready.
- **Your default agency**: confirm the name/subdomain for the existing data (proposed: `Daraja Pulse` on root domain, all current clients move under it).
- **KRA PIN & legal name** for invoice headers on your side.
- **Pricing flexibility**: should the agency monthly fee be editable per-agency (negotiated deals), or hard-locked to KES 45k?

---

## Technical appendix

- **New tables**: `agencies`, `brand_orgs`, `brand_org_agencies` (link table), `billing_plans`, `subscriptions`, `invoices`, `invoice_lines`, `payments`, `pesapal_events`, `agency_domains`, `brand_org_domains` (phase 2).
- **Schema additions**: `agency_id uuid` on `clients`, `campaigns`, `contests`, `influencers`, `brief_templates`, `discovery_*`, `report_*`, `email_*`, `profiles`. NOT NULL after backfill.
- **New RPCs**: `current_agency_id()`, `current_brand_org_id()`, `user_has_agency_access(_user, _agency)`, `user_has_brand_org_access(_user, _brand_org)`.
- **New edge functions**: `pesapal-create-order`, `pesapal-ipn` (verify_jwt=false), `pesapal-status`, `generate-invoice-pdf`, `tenant-resolve` (optional — usually a Vite server middleware on the dev side and Lovable proxy on prod).
- **Frontend**: `TenantProvider` reading `window.location.host`, `useTenant()` hook, branded `AppShell`/`PortalShell`, new routes `/signup/agency`, `/signup/brand`, `/app/billing`, `/portal/billing`, `/app/agency/settings` (branding + seats).
- **Storage**: new `invoices` bucket (private), reuse `client-logos` for agency logos (rename concept to `tenant-logos`).
- **Cron**: new schedule `billing-renew` runs daily, generates next-period invoice 5 days before period end.
