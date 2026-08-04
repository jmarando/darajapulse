import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PlatformPicker } from "@/components/PlatformPicker";
import { Instagram, Music2, Youtube, Twitter, Facebook } from "lucide-react";
import { toast } from "sonner";

const PLATFORMS: Array<{ key: string; label: string; icon: any; placeholder: string }> = [
  { key: "tiktok", label: "TikTok", icon: Music2, placeholder: "@handle or profile URL" },
  { key: "instagram", label: "Instagram", icon: Instagram, placeholder: "@handle or profile URL" },
  { key: "youtube", label: "YouTube", icon: Youtube, placeholder: "@channel or URL" },
  { key: "twitter", label: "X / Twitter", icon: Twitter, placeholder: "@handle" },
  { key: "facebook", label: "Facebook", icon: Facebook, placeholder: "page name or URL" },
];

const clean = (s: string) => s.trim().replace(/^@+/, "");

/**
 * Edit an influencer's profile (name, primary handle, per-platform handles, contact, stats).
 * Extra platform handles are stored in `alt_handles` as `platform:handle` entries so metric
 * fetchers and contest matching can resolve the same creator across networks.
 */
export const EditCreatorDialog = ({
  influencerId,
  open,
  onOpenChange,
  onSaved,
}: {
  influencerId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [handles, setHandles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !influencerId) return;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.from("influencers").select("*").eq("id", influencerId).maybeSingle();
      setLoading(false);
      if (error || !data) return toast.error(error?.message ?? "Creator not found");
      const r: any = data;
      setForm({
        full_name: r.full_name ?? "",
        handle: r.handle ?? "",
        primary_platform: r.primary_platform ?? "tiktok",
        niche: r.niche ?? "",
        region: r.region ?? "",
        email: r.email ?? "",
        phone_mpesa: r.phone_mpesa ?? "",
        follower_count: r.follower_count ?? 0,
        engagement_rate: r.engagement_rate ?? 0,
      });
      // Split alt_handles into the per-platform map; unprefixed entries stay on primary.
      const map: Record<string, string> = {};
      for (const a of (r.alt_handles ?? []) as string[]) {
        const m = String(a).match(/^([a-z]+):(.*)$/i);
        if (m && PLATFORMS.some((p) => p.key === m[1].toLowerCase())) map[m[1].toLowerCase()] = m[2];
      }
      map[r.primary_platform ?? "tiktok"] = map[r.primary_platform ?? "tiktok"] || clean(r.handle ?? "");
      setHandles(map);
    })();
  }, [open, influencerId]);

  const save = async () => {
    if (!influencerId || !form) return;
    setSaving(true);
    const primary = form.primary_platform;
    const alt = PLATFORMS.filter((p) => p.key !== primary && clean(handles[p.key] ?? ""))
      .map((p) => `${p.key}:${clean(handles[p.key])}`);
    const payload = {
      full_name: form.full_name,
      handle: clean(handles[primary] ?? form.handle) || null,
      primary_platform: primary,
      niche: form.niche || null,
      region: form.region || null,
      email: form.email || null,
      phone_mpesa: form.phone_mpesa || null,
      follower_count: Number(form.follower_count) || 0,
      engagement_rate: Number(form.engagement_rate) || 0,
      alt_handles: alt,
    };
    const { error } = await (supabase.from("influencers") as any).update(payload).eq("id", influencerId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Creator updated");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-2xl">Edit creator</DialogTitle></DialogHeader>
        {loading || !form ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div><Label>Niche</Label><Input value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="Food / Beauty" /></div>
            </div>

            <div>
              <Label>Primary platform</Label>
              <PlatformPicker value={form.primary_platform} onChange={(v: string) => setForm({ ...form, primary_platform: v })} />
            </div>

            <div>
              <Label>Handles per platform</Label>
              <div className="space-y-2 mt-1.5">
                {PLATFORMS.map((p) => {
                  const Icon = p.icon;
                  const isPrimary = p.key === form.primary_platform;
                  return (
                    <div key={p.key} className="flex items-center gap-2">
                      <div className="w-28 shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Icon className="w-3.5 h-3.5" /> {p.label}
                        {isPrimary && <span className="text-[9px] uppercase tracking-widest text-accent">•</span>}
                      </div>
                      <Input
                        className="h-8"
                        value={handles[p.key] ?? ""}
                        placeholder={p.placeholder}
                        onChange={(e) => setHandles({ ...handles, [p.key]: e.target.value })}
                      />
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">The primary platform's handle is the one shown on cards; the rest are saved as alternates and used when matching posts.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><Label>Followers</Label><Input type="number" value={form.follower_count} onChange={(e) => setForm({ ...form, follower_count: e.target.value })} /></div>
              <div><Label>Engagement %</Label><Input type="number" step="0.1" value={form.engagement_rate} onChange={(e) => setForm({ ...form, engagement_rate: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Phone (WhatsApp)</Label><Input value={form.phone_mpesa} onChange={(e) => setForm({ ...form, phone_mpesa: e.target.value })} placeholder="2547..." /></div>
            </div>
            <div><Label>Region</Label><Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></div>

            <Button className="w-full bg-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EditCreatorDialog;
