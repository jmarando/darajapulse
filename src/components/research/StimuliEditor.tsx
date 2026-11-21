import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Film, ImageIcon, Plus, Trash2, Type, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { fileProblem, mediaPath, removeUnused, signedUrl, videoFrames, type Stimulus } from "@/lib/research";
import { MAX_STIMULI } from "../../../supabase/functions/_shared/research-templates";
import type { StimulusKind } from "../../../supabase/functions/_shared/research-run";

const db = supabase as unknown as SupabaseClient;

const KINDS: { kind: StimulusKind; label: string; icon: typeof Type }[] = [
  { kind: "text", label: "Concept", icon: Type },
  { kind: "image", label: "Image", icon: ImageIcon },
  { kind: "video", label: "Video", icon: Film },
];

/** The things a study tests (1–5): written concepts, images or videos, each with an optional price. */
export default function StimuliEditor({ clientId, studyId, stimuli, template, onChanged }: {
  clientId: string;
  studyId: string;
  stimuli: Stimulus[];
  template: string;
  onChanged: () => void;
}) {
  const add = async (kind: StimulusKind) => {
    const { error } = await db.from("research_stimuli").insert({
      study_id: studyId,
      position: stimuli.length,
      label: `Option ${String.fromCharCode(65 + stimuli.length)}`,
      kind,
    });
    if (error) toast({ title: "Couldn't add it", description: error.message, variant: "destructive" });
    onChanged();
  };

  return (
    <div className="space-y-4">
      {stimuli.map((s) => (
        <StimulusCard key={s.id} clientId={clientId} studyId={studyId} stimulus={s} showPrice={template === "price" || template === "concept"} onChanged={onChanged} />
      ))}
      {stimuli.length < MAX_STIMULI && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted-foreground">Add something to test:</span>
          {KINDS.map(({ kind, label, icon: Icon }) => (
            <Button key={kind} type="button" variant="outline" size="sm" onClick={() => add(kind)}>
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /><Icon className="mr-1.5 h-3.5 w-3.5" aria-hidden />{label}
            </Button>
          ))}
        </div>
      )}
      {stimuli.length === 1 && (
        <p className="text-[12.5px] text-muted-foreground">Scores mean most side by side: test two to five options against each other.</p>
      )}
    </div>
  );
}

function StimulusCard({ clientId, studyId, stimulus, showPrice, onChanged }: {
  clientId: string;
  studyId: string;
  stimulus: Stimulus;
  showPrice: boolean;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState(stimulus.label);
  const [body, setBody] = useState(stimulus.body ?? "");
  const [price, setPrice] = useState(stimulus.price ?? "");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    signedUrl(db, stimulus.media_path).then((u) => live && setPreview(u));
    return () => { live = false; };
  }, [stimulus.media_path]);

  const save = async (patch: Partial<Stimulus>) => {
    const { error } = await db.from("research_stimuli").update(patch).eq("id", stimulus.id);
    if (error) toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    else onChanged();
  };

  const remove = async () => {
    const paths = [stimulus.media_path, ...(stimulus.frame_paths ?? [])].filter(Boolean) as string[];
    const { error } = await db.from("research_stimuli").delete().eq("id", stimulus.id);
    if (error) { toast({ title: "Couldn't remove it", description: error.message, variant: "destructive" }); return; }
    if (paths.length) await removeUnused(db, paths, stimulus.id);
    onChanged();
  };

  const upload = async (file: File) => {
    if (stimulus.kind === "text") return;
    const problem = fileProblem(file, stimulus.kind);
    if (problem) { toast({ title: "That file won't work", description: problem, variant: "destructive" }); return; }
    setUploading(true);
    try {
      const path = mediaPath(clientId, studyId, file);
      const up = await db.storage.from("research-media").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      const framePaths: string[] = [];
      if (stimulus.kind === "video") {
        // Key frames are what the panel sees when the AI can't take the video itself.
        const frames = await videoFrames(file).catch(() => [] as Blob[]);
        for (const f of frames) {
          const fp = mediaPath(clientId, studyId, f, "jpg");
          const r = await db.storage.from("research-media").upload(fp, f, { contentType: "image/jpeg" });
          if (!r.error) framePaths.push(fp);
        }
        if (!framePaths.length) {
          toast({ title: "Couldn't take frames from this video", description: "Add its script or caption below so the panel has something to go on if the AI can't watch it." });
        }
      }
      const old = [stimulus.media_path, ...(stimulus.frame_paths ?? [])].filter(Boolean) as string[];
      await save({ media_path: path, frame_paths: framePaths });
      if (old.length) await removeUnused(db, old, stimulus.id);
    } catch (e) {
      toast({ title: "Upload failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const bodyLabel = stimulus.kind === "video" ? "Script or caption (optional)" : stimulus.kind === "image" ? "What it is (optional)" : "Concept description";
  const bodyHint = stimulus.kind === "text"
    ? "What the product is, who it's for, what it promises and why to believe it, as a shopper would read it."
    : stimulus.kind === "video" ? "Helps the panel follow what is said." : "e.g. the pack front, or the headline and claim of an ad.";

  return (
    <div className="rounded-xl border border-border/70 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label.trim() && label !== stimulus.label && save({ label: label.trim().slice(0, 120) })}
          className="h-9 max-w-xs font-medium"
          aria-label="Name"
          maxLength={120}
        />
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11.5px] text-muted-foreground">{KINDS.find((k) => k.kind === stimulus.kind)?.label}</span>
        <Button type="button" variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={remove} aria-label={`Remove ${stimulus.label}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[12.5px] font-medium" htmlFor={`body-${stimulus.id}`}>{bodyLabel}</label>
            <Textarea
              id={`body-${stimulus.id}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onBlur={() => body !== (stimulus.body ?? "") && save({ body: body.trim() ? body.slice(0, 4000) : null })}
              className="min-h-[96px]"
              maxLength={4000}
            />
            <p className="mt-1 text-[12px] text-muted-foreground">{bodyHint}</p>
          </div>
          {showPrice && (
            <div>
              <label className="mb-1 block text-[12.5px] font-medium" htmlFor={`price-${stimulus.id}`}>Price (optional)</label>
              <Input
                id={`price-${stimulus.id}`}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                onBlur={() => price !== (stimulus.price ?? "") && save({ price: price.trim() ? price.slice(0, 60) : null })}
                placeholder="e.g. 250 or 3 for 500"
                className="h-9 max-w-[220px]"
                maxLength={60}
              />
            </div>
          )}
        </div>

        {stimulus.kind !== "text" && (
          <div>
            <div className="mb-2 flex aspect-[4/5] items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/30">
              {preview ? (
                stimulus.kind === "image"
                  ? <img src={preview} alt={stimulus.label} className="h-full w-full object-contain" />
                  : <video src={preview} controls className="h-full w-full object-contain" />
              ) : (
                <span className="px-3 text-center text-[12px] text-muted-foreground">{stimulus.kind === "image" ? "JPG, PNG or WebP, up to 10 MB" : "MP4, MOV or WebM, up to 50 MB (under 20 MB lets the AI watch it whole)"}</span>
              )}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-1.5 text-[13px] hover:bg-muted">
              <Upload className="h-3.5 w-3.5" aria-hidden />
              {uploading ? "Uploading…" : stimulus.media_path ? `Replace ${stimulus.kind}` : `Upload ${stimulus.kind}`}
              <input
                type="file"
                className="sr-only"
                accept={stimulus.kind === "image" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/quicktime,video/webm"}
                disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }}
              />
            </label>
            {stimulus.kind === "video" && stimulus.media_path && (
              <p className="mt-1 text-[12px] text-muted-foreground">{stimulus.frame_paths?.length ?? 0} key frames saved</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
