# Public Discovery Showcase

## Goal
Let people view and search the Discovery section publicly as a showcase for DarajaPulse, while keeping the main app areas locked or presented only as non-sensitive demo previews.

## What I’ll build
- Add a public `/discovery` showcase page that uses the existing Discovery data, not dummy creator data.
- Keep private tools such as campaigns, reports, clients, inbox, billing, admin, and team behind sign-in.
- Add clear “Book a meeting” actions from the public showcase into the existing demo request flow.
- Make the showcase useful for prospects: searchable creator cards, platform/country filters, profile/social links, and featured counts.
- Avoid exposing private operational controls: no harvest buttons, AI enrichment, roster edits, contact deletion, internal notes, or private contact values.
- Keep the signed-in `/app/discovery` page unchanged for your team.

## Data and safety
- Reuse the existing `discovery_creators`, `discovery_contacts`, countries, and cities data.
- Show only public/social profile information and public contact links.
- Do not delete, overwrite, or duplicate production records.
- If public database access is too broad today, add a safe public-read path that exposes only showcase-safe fields.

## Technical notes
- Inspect the current access rules for Discovery data before changing database access.
- Prefer a read-only backend function or safe public RPC if direct public reads would expose private fields.
- Reuse the current demo request table and email notification flow for meeting bookings.
- Add routing so `darajapulse.com/discovery` is shareable without a login.
- Verify the public page loads without a signed-in session and private app pages still redirect to sign-in.

## QA
- Check the public showcase in a browser without an authenticated session.
- Check search and filters against real Discovery data.
- Check that private contacts/internal notes are not visible publicly.
- Check “Book a meeting” submits through the existing request flow.
