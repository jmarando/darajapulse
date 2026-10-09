# Royco Q3 Nano: amended agreement (16 Sep – 16 Oct 2026) and re-signing

## What changes
- **Amended agreement**: your uploaded contract wording, with the date "entered into" set to 16 September 2026 and the term set to 16 September – 16 October 2026. The footer will use the same dates (the old July – September footer goes away). It states that it amends and replaces the earlier version. All other terms stay the same: four Reels a month, the views payment table, 45-day payment, and one month of exclusivity.
- **Platform dates**: Royco Q3 Nano changes to 16 Sep – 16 Oct 2026, so creator links, reports and payments all match. Reports and payments will only count posts inside that window. Before switching, I'll tell you how many existing posts fall outside it.
- **Re-signing**: each signed creator opens their usual brief link, sees the amended agreement and signs it again. Their old signature is kept on record and marked as replaced. Their submission link and drafts are not affected.
- **PDF per creator**: after a creator re-signs, they get a personal PDF of their amended agreement with their name and signature date. Emails can't carry attachments, so the PDF is sent as a private download link.

## Email (Royco-branded, one per signed creator, about 136)
Subject: "Updated Royco agreement: please re-sign (16 Sep – 16 Oct 2026)". The email explains the corrected dates in plain words, gives a button to the creator's brief link to review and sign, and says nothing else changes.

## Order
1. Build the amended agreement and the re-sign step, then update the dates.
2. Send you (Phoebe/Justin) a sample PDF and a test email to review. Nothing goes to creators yet.
3. After you approve, send the email to all signed creators. Because of the hourly sending limit, this happens in batches over a few hours. Then I report how many were sent.

## Technical details
- Insert a new version of the Royco Q3 Nano agreement template with the amended dates. Mark existing signatures as superseded (keep the rows) so the brief page asks for a signature again.
- Update the campaign's start and end dates to 2026-09-16 and 2026-10-16.
- Create the PDF on the server when a creator signs, store it in a private storage bucket, and email a signed download link.
- Add a new `royco-agreement-amended` template to the shared registry and send it through the existing campaign-brand send path, one email per creator, with idempotency keys.
