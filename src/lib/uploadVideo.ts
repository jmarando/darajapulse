import * as tus from "tus-js-client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export type UploadProgress = {
  /** 0-100 */
  percent: number;
  uploaded: number;
  total: number;
  /** bytes per second, smoothed */
  speed: number;
  /** seconds remaining, null while unknown */
  eta: number | null;
};

/**
 * Resumable (tus) upload straight to storage.
 *
 * Large creator videos on Kenyan mobile data used to fail as a single POST: one
 * dropped connection restarted the whole file and the UI showed nothing. This
 * uploads in 6MB chunks, retries automatically and can resume an interrupted
 * file from where it stopped.
 */
export const uploadResumable = ({
  bucket,
  path,
  file,
  onProgress,
}: {
  bucket: string;
  path: string;
  file: File;
  onProgress?: (p: UploadProgress) => void;
}): { promise: Promise<void>; abort: () => void } => {
  let upload: tus.Upload | null = null;
  const started = Date.now();
  let lastBytes = 0;
  let lastAt = started;
  let speed = 0;

  const promise = new Promise<void>((resolve, reject) => {
    upload = new tus.Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 2000, 5000, 10000, 20000, 30000],
      headers: {
        authorization: `Bearer ${SUPABASE_KEY}`,
        "x-upsert": "true",
      },
      // Include the destination object in the fingerprint. tus's default fingerprint
      // only covers the file + endpoint, so a retry with a different object path would
      // resume the OLD upload URL and write bytes to the old object while the draft row
      // points at the new one — the reviewer then sees "Video unavailable".
      fingerprint: async (f) =>
        ["tus", bucket, path, f.name, f.type, f.size, (f as File).lastModified].join("/"),
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: file.type || "video/mp4",
        cacheControl: "31536000",
      },
      onError: (err) => reject(err),
      onProgress: (uploaded, total) => {
        const now = Date.now();
        const dt = (now - lastAt) / 1000;
        if (dt > 0.5) {
          const inst = (uploaded - lastBytes) / dt;
          speed = speed ? speed * 0.7 + inst * 0.3 : inst;
          lastBytes = uploaded;
          lastAt = now;
        }
        onProgress?.({
          percent: total ? (uploaded / total) * 100 : 0,
          uploaded,
          total,
          speed,
          eta: speed > 0 ? Math.max(0, (total - uploaded) / speed) : null,
        });
      },
      onSuccess: () => resolve(),
    });

    // Resume an earlier attempt at the same file when one exists.
    upload.findPreviousUploads().then((prev) => {
      if (prev.length) upload!.resumeFromPreviousUpload(prev[0]);
      upload!.start();
    });
  });

  return { promise, abort: () => upload?.abort(true) };
};

/** Grabs a still frame so review lists can show an image instead of loading video. */
export const capturePoster = (file: File): Promise<Blob | null> =>
  new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      const done = (blob: Blob | null) => {
        URL.revokeObjectURL(url);
        resolve(blob);
      };
      const timer = setTimeout(() => done(null), 12000);
      video.onloadeddata = () => {
        video.currentTime = Math.min(1, (video.duration || 2) / 2);
      };
      video.onseeked = () => {
        clearTimeout(timer);
        const scale = Math.min(1, 720 / Math.max(video.videoWidth || 1, video.videoHeight || 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round((video.videoWidth || 720) * scale);
        canvas.height = Math.round((video.videoHeight || 1280) * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return done(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => done(b), "image/jpeg", 0.72);
      };
      video.onerror = () => {
        clearTimeout(timer);
        done(null);
      };
      video.src = url;
    } catch {
      resolve(null);
    }
  });

export const formatBytes = (n: number) =>
  n >= 1024 * 1024 * 1024 ? `${(n / 1024 ** 3).toFixed(1)}GB` : `${Math.round(n / 1024 / 1024)}MB`;
