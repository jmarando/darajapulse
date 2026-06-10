## Super Admin Console

A new section at `/app/admin/*` (super_admin only), replacing the single billing page with a full console.

### Pages
- `/app/admin` — dashboard: counts (agencies, brand orgs, clients, MRR), outstanding payments, recent activity
- `/app/admin/agencies` — table + create/edit drawer: name, slug, subdomain, logo, KRA PIN, fee, cycle, notes, active toggle
- `/app/admin/brand-orgs` — table + create/edit drawer: name, slug, subdomain, logo, KRA PIN, fee, cycle, notes, active toggle, owner invite
- `/app/admin/clients` — cross-agency list (agency, contacts, # campaigns, last activity) with filter
- `/app/admin/billing` — invoices + payments ledger, per agency/brand_org. "Generate invoice", "Record payment", "Send Pesapal link"
- `/app/admin/users` — every user, role chips, scope (agency / brand_org / client), invite + role assignment + remove

Existing left-nav "Admin · Billing" item becomes a collapsible "Admin" group with these children.

### Database
New columns: `agencies.kra_pin`, `brand_orgs.kra_pin`.

New tables:
- `invoices` (org_kind: agency|brand_org, org_id, period_start, period_end, amount_kes, status: draft|sent|paid|overdue|void, due_date, pesapal_order_tracking_id, pesapal_merchant_reference, paid_at, pdf_url, notes)
- `payments` (invoice_id nullable, org_kind, org_id, amount_kes, method: pesapal|mpesa|bank|cash|other, reference, paid_at, recorded_by, notes, pesapal_confirmation_code)
- `pesapal_ipn` (raw IPN payloads for audit)

All with super_admin-only RLS + standard grants.

### Pesapal wiring
Credentials stored as secrets: `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET`, `PESAPAL_ENV` (sandbox|live), `PESAPAL_IPN_ID` (registered once via setup function).

Edge functions:
- `pesapal-register-ipn` — one-off: registers our IPN URL with Pesapal, stores returned `ipn_id` as secret
- `pesapal-create-order` — auth'd, super_admin only: creates an order for an invoice, returns `redirect_url`, persists `order_tracking_id` + `merchant_reference`
- `pesapal-ipn` — public webhook (`verify_jwt=false`): receives IPN, fetches transaction status, marks invoice paid + inserts payment row
- `pesapal-get-status` — auth'd: manual refresh button on an invoice

### Invoice generation
- Manual "Generate next invoice" button on each org's billing card → uses `fee` + `cycle` to compute period and due_date
- Optional cron `generate-invoices-monthly` later — not in this pass

### UI behavior
- Pay link button on each unpaid invoice → calls `pesapal-create-order` → opens `redirect_url` in new tab
- Invoice row shows status badge, refresh button, payment history below

### Out of scope this pass
- Self-serve brand_org signup
- Automated recurring invoice cron
- WHT computation
- e-TIMS

### Technical notes
- Reuse `has_role(auth.uid(), 'super_admin')` everywhere
- Pesapal v3 REST (auth → SubmitOrderRequest → GetTransactionStatus); base URL switches on `PESAPAL_ENV`
- IPN URL: `https://<project-ref>.functions.supabase.co/pesapal-ipn` (returned from `project_urls` after function deploy)
- All money in KES integer
- `Invoices.types` added through migration → regenerated `supabase/types.ts`

### Sequence
1. Migration (columns + 3 tables + RLS + grants)
2. Add Pesapal secrets (user prompt)
3. Edge functions (register-ipn, create-order, ipn, get-status)
4. Register IPN once (run `pesapal-register-ipn`)
5. Admin shell + 6 pages
6. Wire pay buttons + refresh + IPN end-to-end test

Files touched (approx):
- `supabase/migrations/<new>.sql`
- `supabase/functions/pesapal-{register-ipn,create-order,ipn,get-status}/index.ts`
- `src/pages/app/admin/{AdminLayout,Dashboard,Agencies,BrandOrgs,Clients,Billing,Users}.tsx`
- `src/components/AppShell.tsx` (admin nav group)
- `src/App.tsx` (routes)
- Remove/redirect old `src/pages/app/AdminBilling.tsx`
