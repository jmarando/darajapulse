import { useRef, useState } from "react";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { UploadCloud, FileVideo, CheckCircle2, Clock, MessageSquareWarning, X } from "lucide-react";
import { toast } from "sonner";
import { uploadResumable, capturePoster, formatBytes, type UploadProgress } from "@/lib/uploadVideo";

type Draft = {
  id: string;
  file_name: string | null;
  platform: string | null;
  status: string;
  review_note: string | null;
  created_at: string;
  post_url: string | null;
};

const MAX_BYTES = 900 * 1024 * 1024; // 900MB

export const CreatorDraftStep = ({
  briefToken,
  drafts,
  onUploaded,
}: {
  briefToken: string;
  drafts: Draft[];
  onUploaded: () => void;
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [platform, setPlatform] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error("Choose your video file first");
    if (file.size > MAX_BYTES) return toast.error("That file is too big — please compress it and try again");
    setBusy(true);
    setProgress({ percent: 0, uploaded: 0, total: file.size, speed: 0, eta: null });

    const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    // Derived from the file itself, not the clock: a retry of the same file must reuse
    // the same object path so a resumed transfer and the saved draft point at one file.
    const stamp = `${file.lastModified}-${file.size}`;
    const path = `${briefToken}/${stamp}-${safe}`;

    // Poster first: it is tiny and lets reviewers see the video without downloading it.
    let posterPath: string | null = null;
    try {
      const poster = await capturePoster(file);
      if (poster) {
        // No upsert: anonymous creators cannot read existing objects, and asking storage
        // to overwrite makes it check that permission and reject the upload outright.
        posterPath = `${briefToken}/${stamp}-${Date.now()}-poster.jpg`;
        const { error: pErr } = await supabase.storage
          .from("creator-drafts")
          .upload(posterPath, poster, { contentType: "image/jpeg", cacheControl: "31536000" });
        if (pErr) posterPath = null;
      }
    } catch {
      posterPath = null;
    }

    let storedPath = path;
    try {
      const { promise, abort } = uploadResumable({
        bucket: "creator-drafts",
        path,
        file,
        onProgress: setProgress,
      });
      abortRef.current = abort;
      storedPath = await promise;
    } catch (err: any) {
      setBusy(false);
      setProgress(null);
      abortRef.current = null;
      return toast.error(
        "Upload stopped — check your connection and tap Send again. It will continue from where it stopped."
      );
    }
    abortRef.current = null;


    const { error } = await supabase.rpc("submit_creator_draft" as any, {
      _brief_token: briefToken,
      _file_path: storedPath,
      _file_name: file.name,
      _mime_type: file.type || "video/mp4",
      _file_size: file.size,
      _platform: platform || null,
      _caption: caption || null,
      _creator_note: note || null,
      _poster_path: posterPath,
    });
    setBusy(false);
    setProgress(null);
    if (error) return toast.error(error.message);
    toast.success("Video sent for approval");
    setFile(null);
    setCaption("");
    setNote("");
    if (inputRef.current) inputRef.current.value = "";
    onUploaded();
  };


  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Step 1</div>
        <h2 className="font-display text-2xl mt-1">Send your video for approval</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload the finished MP4 <strong>before</strong> you post it. The team reviews it and either approves it or
          sends notes back. Once it's approved you'll be able to publish and drop the live link in step 2.
        </p>

        <form onSubmit={upload} className="space-y-4 mt-5">
          <div>
            <Label className="text-sm">Your video (MP4) *</Label>
            <Input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/*"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1.5 h-12 text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1.5"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Up to 900MB. MP4 works best{file ? ` · your file is ${formatBytes(file.size)}` : ""}.
            </p>
          </div>

          <div>
            <Label className="text-sm">Where will you post it?</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Pick every platform you'll post this same video on — one approval covers all of them.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {PLATFORM_OPTIONS.map((p) => {
                const on = platforms.includes(p.value);
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => togglePlatform(p.value)}
                    aria-pressed={on}
                    className={`h-12 rounded-md border px-3 text-sm text-left transition-colors ${
                      on
                        ? "border-primary bg-primary/10 text-foreground font-medium"
                        : "border-input bg-background text-muted-foreground"
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {p.label}
                  </button>
                );
              })}
            </div>
            {platforms.length > 1 && (
              <p className="text-xs text-muted-foreground mt-2">
                Cross-post: after approval, paste the live link from each platform in step 2.
              </p>
            )}
          </div>
          <div>
            <Label className="text-sm">Caption you plan to use</Label>
            <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption, hashtags and mentions…" className="mt-1.5 min-h-[80px]" />
          </div>
          <div>
            <Label className="text-sm">Anything the team should know?</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" className="mt-1.5 h-11" />
          </div>
          {progress && (
            <div className="rounded-md border border-border p-3 space-y-2">
              <Progress value={progress.percent} className="h-2" />
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {Math.floor(progress.percent)}% · {formatBytes(progress.uploaded)} of {formatBytes(progress.total)}
                  {progress.eta !== null && progress.eta > 1
                    ? ` · about ${progress.eta > 90 ? `${Math.round(progress.eta / 60)} min` : `${Math.round(progress.eta)} sec`} left`
                    : ""}
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  onClick={() => {
                    abortRef.current?.();
                    abortRef.current = null;
                    setBusy(false);
                    setProgress(null);
                  }}
                >
                  <X className="w-3 h-3" /> Cancel
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Keep this page open. If your network drops, tap Send again and it continues from where it stopped.
              </p>
            </div>
          )}
          <Button type="submit" disabled={busy} size="lg" className="w-full h-12 text-base">
            <UploadCloud className="w-4 h-4 mr-2" />
            {busy ? (progress ? `Uploading ${Math.floor(progress.percent)}%` : "Uploading…") : "Send for approval"}
          </Button>
        </form>
      </Card>


      {drafts.length > 0 && (
        <Card className="p-5">
          <h3 className="font-display text-lg">Your videos</h3>
          <div className="mt-3 space-y-2">
            {drafts.map((d) => (
              <div key={d.id} className="flex items-start gap-3 rounded-md border border-border p-3">
                <FileVideo className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{d.file_name || "Video"}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(d.created_at).toLocaleDateString()} {d.platform ? `· ${d.platform}` : ""}
                  </div>
                  {d.review_note && <p className="text-xs mt-1.5 rounded bg-secondary/50 p-2">{d.review_note}</p>}
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] shrink-0 ${d.status === "approved" ? "border-success/40 text-success" : d.status === "changes_requested" ? "border-destructive/40 text-destructive" : ""}`}
                >
                  {d.status === "approved" ? <CheckCircle2 className="w-3 h-3 mr-1" /> : d.status === "changes_requested" ? <MessageSquareWarning className="w-3 h-3 mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
                  {d.status === "changes_requested" ? "changes needed" : d.status === "approved" ? (d.post_url ? "posted" : "approved") : "in review"}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default CreatorDraftStep;
