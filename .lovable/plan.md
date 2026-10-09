# Royco Q3 Nano: amended agreement (16 Sep – 16 Oct 2026) and re-signing

## What changes
- **Amended agreement**: your uploaded contract wording, with the date "entered into" set to 16 September 2026 and the term set to 16 September – 16 October 2026. The footer will use the same dates (the old July – September footer goes away). It states that it amends and replaces the earlier version. The supplied Daraja Plus logo appears in the PDF header. All other terms stay the same: four Reels a month, the views payment table, 45-day payment, and one month of exclusivity.
- **Separate dates, protected payments**: show the official contract period as 16 Sep – 16 Oct 2026 without using it as a universal reporting or payment filter. Preserve every historical post and metric from 1 Sep onward, original publication dates and separate collection timestamps. Historical reporting remains available; an optional contract-period filter is clearly labelled and does not change payment eligibility. Existing payment rules, qualifying views, approved deliverables and approved amounts remain unchanged unless explicitly authorized.
- **Reconciliation before activation**: verify the reported 585 posts and 91 outside the proposed window. List each affected creator, publication date, platform, URL, deliverable status, qualifying views and payment impact where available. Compare current and proposed creator deliverables, best-video views and payable amounts without double-counting. Flag uncertain eligibility for review, never automatically exclude 1–15 Sep posts. No payment-impacting changes without documented approval.
- **Re-signing**: each signed creator opens their usual brief link, sees the amended agreement and signs it again. Their old signature is kept on record and marked as replaced. Their submission link and drafts are not affected.
- **PDF per creator**: after a creator re-signs, they get a personal PDF of their amended agreement with their name and signature date. Emails can't carry attachments, so the PDF is sent as a private download link.

## Email (Royco-branded, one per signed creator, about 136)
Subject: "Updated Royco agreement: please re-sign (16 Sep – 16 Oct 2026)". The email explains the corrected dates in plain words, gives a button to the creator's brief link to review and sign, and says nothing else changes.

## Order
1. Inspect current schema, reporting/date filters, deliverable grouping and best-video/payment logic. Capture a Royco baseline and reconcile out-of-window posts before activation.
2. Build the amended agreement with the supplied logo, separate date handling and re-sign step. Test that all records remain and payment calculations match the baseline; only then activate the official contract dates.
3. Send you (Phoebe/Justin) a sample PDF and a test email to review. Nothing goes to creators yet.
4. After you approve, send the email to all signed creators. Because of the hourly sending limit, this happens in batches over a few hours. Then I report how many were sent.

## Technical details
- Insert a new version of the Royco Q3 Nano agreement template with the amended dates. Mark existing signatures as superseded (keep the rows) so the brief page asks for a signature again.
- Use distinct contract-period, historical-reporting and payment-eligibility date handling. Choose the smallest additive, reversible schema change after inspection; do not overwrite existing date fields if they drive payment eligibility. Preserve post rows, publication dates, metrics and collection timestamps.
- Apply consistent eligibility rules across internal/public reports and payments. Default to preserved historical figures, with optional contract-period reporting. Verify best-video views, creative grouping, totals and payable amounts against the baseline, and regression-test unrelated campaigns. No destructive migration or payment-rule change.
- Create the PDF on the server when a creator signs, store it in a private storage bucket, and email a signed download link.
- Add a new `royco-agreement-amended` template to the shared registry and send it through the existing campaign-brand send path, one email per creator, with idempotency keys.
