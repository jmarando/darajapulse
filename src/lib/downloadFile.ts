// Download a remote file (e.g. a signed video URL) with a chosen filename.
export async function downloadFile(url: string, filename = "video.mp4") {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("download failed");
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
  } catch {
    // Fall back to opening the file in a new tab.
    window.open(url, "_blank", "noreferrer");
  }
}
