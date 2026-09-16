# Move creator videos to Cloudflare Stream

Today creators upload raw phone files (median 70MB, 43% iPhone .mov) straight into our storage, and reviewers stream that same raw file back from a server outside Africa. That is why uploads take minutes, playback buffers, some videos won't play at all on Android/Chrome, and 89% of review tiles are black.

Cloudflare Stream fixes all of that at the source: it converts every upload, serves the right quality for the viewer's connection, makes thumbnails itself, and delivers from Nairobi/Mombasa.

## What changes for people

**Creators** — same upload screen, same resume-if-the-network-drops behaviour. Uploads go straight to Cloudflare instead of through us. After the file lands, a short "processing" state appears until the video is ready for review (usually under a minute for a 60-second clip).

**Reviewers (agency and client link)** — videos start playing in about a second, adjust quality automatically, and every tile shows a real thumbnail instead of a black box. iPhone .mov files play everywhere. Download gives a sensibly-sized MP4 with a normal browser progress bar.

**Old videos** keep working exactly as they do now — nothing is moved or deleted.

## Cost

$5 per 1,000 minutes stored per month, $1 per 1,000 minutes watched. Uploading and converting is free. At current volume (~160 short clips) that's a few dollars a month.

## Build steps

1. **Database (additive).** Add `stream_uid`, `stream_status`, `stream_thumbnail_url`, `stream_duration` to `creator_drafts`, all nullable. `file_path` stays and stays authoritative for existing rows.
2. **Secrets.** `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_STREAM_TOKEN` (a Stream:Edit API token). I'll request these when we get there.
3. **`stream-upload-url` function.** Validates the creator's brief token, calls Stream's `direct_upload` tus endpoint with `maxDurationSeconds`, `requireSignedURLs: true` and metadata linking the upload back to the draft, returns the one-time upload URL. No Cloudflare key ever reaches the browser.
4. **Client upload.** `src/lib/uploadVideo.ts` gains a Stream path: same `tus-js-client`, pointed at the returned URL, same progress/resume/cancel UI. `CreatorDraftStep.tsx` records the returned `stream_uid` on the draft via `submit_creator_draft` (new optional parameter) and shows "processing" until ready. `capturePoster` is dropped on this path.
5. **`stream-webhook` function** (`verify_jwt = false`, signature-verified against Cloudflare's webhook secret). On `ready`, sets `stream_status = 'ready'`, stores the thumbnail URL and duration. Falls back to polling the Stream API if a webhook is missed.
6. **Playback.** `DraftVideo` renders the Stream player (iframe with the signed token) when `stream_uid` exists, otherwise the current signed-storage `<video>`. Thumbnail comes from Stream. Signed playback tokens are minted per request by an existing-style function, same as we sign storage URLs today.
7. **Download.** Use Stream's MP4 download rendition, requested once per video and cached; the anchor-based download we just shipped stays.
8. **Review pages.** `DraftsPanel.tsx` and `PublicDraftReview.tsx` handle three states per video: processing, ready (Stream), legacy (storage). `draft-review` returns `stream_uid`/status in the list and keeps its `sign` action for legacy rows.
9. **Cleanup after it's stable.** Lower `MAX_BYTES` from 900MB to ~300MB, and keep the large-file warning.

## What I will not do

- No moving or deleting existing videos.
- No change to who can see which videos — brief tokens, review-link tokens and agency permissions stay exactly as they are.
- No removal of the current storage upload path; it stays as the fallback if Stream is unreachable.

## Verification

Upload a real 200MB iPhone .mov end to end from a throttled connection, confirm it plays in Chrome on Android, thumbnail appears, download works, and that an existing pre-Stream draft still plays and downloads unchanged.
