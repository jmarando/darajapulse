/**
 * Trigger a download for an already-signed URL.
 *
 * The URL must be created with Supabase `createSignedUrl(path, ttl, { download: fileName })`
 * so storage sends the Content-Disposition header. We then hand the URL to the browser's own
 * download manager: it shows progress, survives big files and can resume — unlike the old
 * fetch()->blob path, which buffered the whole video in memory (tab crashes on phones).
 */
export function downloadFile(url: string, filename = "video.mp4") {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
