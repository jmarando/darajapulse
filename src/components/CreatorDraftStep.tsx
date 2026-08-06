import { useRef, useState } from "react";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, FileVideo, CheckCircle2, Clock, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";

type Draft = {
  id: string;
  file_name: string | null;
  platform: string | null;
  status: string;
  review_note: string | null;
  created_at: string;
  post_url: string | null;
};

const MAX_BYTES = 400 * 1024 * 1024; // 400MB

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
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error("Choose your video file first");
    if (file.size > MAX_BYTES) return toast.error("That file is over 400MB — please compress it and try again");
    setBusy(true);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `${briefToken}/${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage
      .from("creator-drafts")
      .upload(path, file, { contentType: file.type || "video/mp4", upsert: false });
    if (upErr) {
      setBusy(false);
      return toast.error(upErr.message);
    }
    const { error } = await supabase.rpc("submit_creator_draft" as any, {
      _brief_token: briefToken,
      _file_path: path,
      _file_name: file.name,
      _mime_type: file.type || "video/mp4",
      _file_size: file.size,
      _platform: platform || null,
      _caption: caption || null,
      _creator_note: note || null,
    });
    setBusy(false);
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
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1.5 h-12 text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1.5"
            />
            <p className="text-xs text-muted-foreground mt-1.5">Up to 400MB. MP4 works best.</p>
          </div>
          <div>
            <Label className="text-sm">Where will you post it?</Label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="mt-1.5 h-12 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select platform</option>
              <option value="tiktok">TikTok</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="youtube">YouTube</option>
            </select>
          </div>
          <div>
            <Label className="text-sm">Caption you plan to use</Label>
            <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption, hashtags and mentions…" className="mt-1.5 min-h-[80px]" />
          </div>
          <div>
            <Label className="text-sm">Anything the team should know?</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" className="mt-1.5 h-11" />
          </div>
          <Button type="submit" disabled={busy} size="lg" className="w-full h-12 text-base">
            <UploadCloud className="w-4 h-4 mr-2" /> {busy ? "Uploading…" : "Send for approval"}
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
