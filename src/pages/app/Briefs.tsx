import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, X, FileText, Sparkles, Save, Hash, AtSign, Check, Link as LinkIcon, Trash2, Megaphone, Upload, Wand2, Download, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";

type Client = { id: string; name: string };
type Template = any;
type Campaign = { id: string; name: string; brief_template_id: string | null; status: string | null };

const STARTER_PRESETS: Record<string, Partial<Template>> = {
  "Product launch": {
    objective: "Generate buzz and consideration around the new product launch with authentic creator-led storytelling.",
    tone: "Energetic, aspirational, and on-brand",
    content_format: "1× TikTok video (30–60s) + 1× Instagram Reel (15–30s)",
    dos: [
      "Show the product in everyday context",
      "Use natural lighting and clean framing",
      "Mention the brand name in the first 5 seconds",
      "Add the campaign hashtag in caption AND on-screen",
    ],
    donts: [
      "No competitor mentions or visible logos",
      "No politically sensitive or polarising content",
      "No alcohol, tobacco, or gambling references",
      "Don't make medical or unverifiable claims",
    ],
  },
  "Always-on advocacy": {
    objective: "Drive sustained brand love and conversation through monthly creator drops.",
    tone: "Conversational, warm, community-first",
    content_format: "2× short-form videos per month",
    dos: ["Tell a personal story", "Reply to top 3 comments", "Tag the brand handle"],
    donts: ["Don't repurpose old content", "No paid-ad styling"],
  },
  "Awareness push": {
    objective: "Maximise reach and impressions in target market over a 2-week burst.",
    tone: "Bold, scroll-stopping, culturally relevant",
    content_format: "1× hook-led TikTok + 3× Instagram Stories",
    dos: ["Lead with a strong hook in 0–3s", "Use trending audio where on-brand"],
    donts: ["Don't bury the brand mention", "No misleading thumbnails"],
  },
};

const blank = (client_id: string): Partial<Template> => ({
  client_id,
  name: "",
  objective: "",
  brief: "",
  hashtag: "",
  content_format: "",
  tone: "",
  dos: [],
  donts: [],
  mandatory_mentions: [],
  hashtags_extra: [],
  references_urls: [],
  wht_percent: 5,
});

const Briefs = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [t, setT] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPreset, setNewPreset] = useState<string>("blank");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [attachingFile, setAttachingFile] = useState(false);

  const loadClients = async () => {
    const { data } = await supabase.from("clients").select("id,name").order("name");
    setClients(data ?? []);
    if (!selectedClientId && data && data.length) setSelectedClientId(data[0].id);
  };
  useEffect(() => { loadClients(); }, []);

  const loadTemplates = async () => {
    if (!selectedClientId) { setTemplates([]); setCampaigns([]); return; }
    const { data } = await supabase.from("brief_templates").select("*").eq("client_id", selectedClientId).order("updated_at", { ascending: false });
    setTemplates(data ?? []);
    const { data: camps } = await supabase.from("campaigns").select("id,name,brief_template_id,status").eq("client_id", selectedClientId).order("start_date", { ascending: false });
    setCampaigns(camps ?? []);
    const counts: Record<string, number> = {};
    (camps ?? []).forEach((c: any) => { if (c.brief_template_id) counts[c.brief_template_id] = (counts[c.brief_template_id] ?? 0) + 1; });
    setUsageCounts(counts);
    if (!selectedId && data && data.length) setSelectedId(data[0].id);
    if (selectedId && data && !data.find(x => x.id === selectedId)) setSelectedId(data[0]?.id ?? null);
  };
  useEffect(() => { setSelectedId(null); loadTemplates(); }, [selectedClientId]);

  useEffect(() => {
    if (!selectedId) { setT(null); return; }
    const found = templates.find(x => x.id === selectedId);
    if (found) setT({
      ...found,
      dos: found.dos ?? [],
      donts: found.donts ?? [],
      mandatory_mentions: found.mandatory_mentions ?? [],
      hashtags_extra: found.hashtags_extra ?? [],
      references_urls: found.references_urls ?? [],
      wht_percent: found.wht_percent ?? 5,
    });
  }, [selectedId, templates]);

  const createNew = async () => {
    if (!newName.trim() || !selectedClientId) return;
    const preset = newPreset !== "blank" ? STARTER_PRESETS[newPreset] : {};
    const payload = { ...blank(selectedClientId), ...preset, name: newName.trim(), client_id: selectedClientId };
    const { data, error } = await (supabase.from("brief_templates") as any).insert(payload).select("*").single();
    if (error) return toast.error(error.message);
    toast.success("Brief created");
    setNewOpen(false); setNewName(""); setNewPreset("blank");
    setSelectedId(data.id);
    loadTemplates();
  };

  const save = async () => {
    if (!t) return;
    setSaving(true);
    const { error } = await supabase.from("brief_templates").update({
      name: t.name,
      objective: t.objective,
      brief: t.brief,
      hashtag: t.hashtag,
      content_format: t.content_format,
      tone: t.tone,
      dos: t.dos,
      donts: t.donts,
      mandatory_mentions: t.mandatory_mentions,
      hashtags_extra: t.hashtags_extra,
      references_urls: t.references_urls,
      wht_percent: Number(t.wht_percent) || 0,
      source_file_url: t.source_file_url ?? null,
      source_file_name: t.source_file_name ?? null,
    }).eq("id", t.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Brief saved");
    loadTemplates();
  };

  const remove = async () => {
    if (!t) return;
    if (!confirm(`Delete brief "${t.name}"? Linked campaigns will fall back to their own brief fields.`)) return;
    const { error } = await supabase.from("brief_templates").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Brief deleted");
    setSelectedId(null);
    loadTemplates();
  };

  const toggleCampaign = async (camp: Campaign) => {
    if (!t) return;
    const isLinked = camp.brief_template_id === t.id;
    const newVal = isLinked ? null : t.id;
    const { error } = await supabase.from("campaigns").update({ brief_template_id: newVal }).eq("id", camp.id);
    if (error) return toast.error(error.message);
    toast.success(isLinked ? `Unlinked from ${camp.name}` : `Linked to ${camp.name}`);
    loadTemplates();
  };

  // Upload a file to storage and return its path
  const uploadToStorage = async (file: File): Promise<{ path: string; publicUrl: string } | null> => {
    if (!selectedClientId) return null;
    const ext = file.name.split(".").pop() || "bin";
    const path = `${selectedClientId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("brief-docs").upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) { toast.error("Upload failed: " + error.message); return null; }
    const { data: signed } = await supabase.storage.from("brief-docs").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    return { path, publicUrl: signed?.signedUrl ?? "" };
  };

  // Import from doc → create a new brief
  const runImport = async () => {
    if (!selectedClientId) return;
    if (!importText.trim() && !importFile) return toast.error("Paste text or choose a file");
    setImporting(true);
    try {
      let storage_path: string | undefined;
      let file_name: string | undefined;
      let attachedUrl: string | null = null;
      if (importFile) {
        const up = await uploadToStorage(importFile);
        if (!up) { setImporting(false); return; }
        storage_path = up.path;
        file_name = importFile.name;
        attachedUrl = up.publicUrl;
      }
      const { data, error } = await supabase.functions.invoke("brief-import", {
        body: { text: importText.trim() || undefined, storage_path, file_name },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const f = (data as any).fields ?? {};
      const payload = {
        ...blank(selectedClientId),
        client_id: selectedClientId,
        name: (f.name && String(f.name).trim()) || importFile?.name?.replace(/\.[^.]+$/, "") || "Imported brief",
        objective: f.objective ?? "",
        brief: f.brief ?? "",
        hashtag: f.hashtag ?? "",
        content_format: f.content_format ?? "",
        tone: f.tone ?? "",
        dos: Array.isArray(f.dos) ? f.dos : [],
        donts: Array.isArray(f.donts) ? f.donts : [],
        mandatory_mentions: Array.isArray(f.mandatory_mentions) ? f.mandatory_mentions : [],
        hashtags_extra: Array.isArray(f.hashtags_extra) ? f.hashtags_extra : [],
        source_file_url: attachedUrl,
        source_file_name: file_name ?? null,
      };
      const { data: row, error: insErr } = await (supabase.from("brief_templates") as any).insert(payload).select("*").single();
      if (insErr) throw insErr;
      toast.success("Brief imported");
      setImportOpen(false); setImportText(""); setImportFile(null);
      setSelectedId(row.id);
      loadTemplates();
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  // Attach / replace the source doc on the currently-open brief
  const attachSourceDoc = async (file: File) => {
    if (!t) return;
    setAttachingFile(true);
    try {
      const up = await uploadToStorage(file);
      if (!up) return;
      const updated = { ...t, source_file_url: up.publicUrl, source_file_name: file.name };
      setT(updated);
      const { error } = await supabase.from("brief_templates").update({
        source_file_url: up.publicUrl, source_file_name: file.name,
      }).eq("id", t.id);
      if (error) throw error;
      toast.success("Source doc attached");
      loadTemplates();
    } catch (e: any) {
      toast.error(e?.message || "Failed to attach");
    } finally {
      setAttachingFile(false);
    }
  };

  const removeSourceDoc = async () => {
    if (!t) return;
    const updated = { ...t, source_file_url: null, source_file_name: null };
    setT(updated);
    const { error } = await supabase.from("brief_templates").update({
      source_file_url: null, source_file_name: null,
    }).eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Source doc removed");
    loadTemplates();
  };


  const ListEditor = ({ label, items, onChange, placeholder, icon: Icon }: any) => {
    const [v, setV] = useState("");
    const add = () => { if (!v.trim()) return; onChange([...(items ?? []), v.trim()]); setV(""); };
    return (
      <div>
        <Label className="flex items-center gap-1.5">{Icon && <Icon className="w-3.5 h-3.5" />}{label}</Label>
        <div className="flex gap-2 mt-1.5">
          <Input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={placeholder} />
          <Button type="button" variant="outline" size="icon" onClick={add}><Plus className="w-4 h-4" /></Button>
        </div>
        {items && items.length > 0 && (
          <ul className="mt-2 space-y-1">
            {items.map((it: string, i: number) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm py-1.5 px-2 rounded-md bg-secondary/50 group">
                <span className="min-w-0 truncate">{it}</span>
                <button onClick={() => onChange(items.filter((_: any, j: number) => j !== i))} className="opacity-50 group-hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const usage = t ? (usageCounts[t.id] ?? 0) : 0;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Workspace</div>
          <h1 className="font-display text-4xl font-semibold mt-1">Brief library</h1>
          <p className="text-muted-foreground mt-2 text-sm max-w-2xl">Reusable per-client briefs — write once, link to any campaign. Edits flow live to every campaign and creator brief link that uses this template.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-56">
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger><SelectValue placeholder="Pick a client" /></SelectTrigger>
              <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary" disabled={!selectedClientId}><Plus className="w-4 h-4 mr-1.5" /> New brief</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle className="font-display text-2xl">New brief</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Royco standard brief" autoFocus /></div>
                <div>
                  <Label>Start from</Label>
                  <Select value={newPreset} onValueChange={setNewPreset}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="blank">Blank</SelectItem>
                      {Object.keys(STARTER_PRESETS).map(k => <SelectItem key={k} value={k}>Preset · {k}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">Presets prefill objective, tone, format and a starter list of do's/don'ts. You can edit everything after.</p>
                </div>
                <Button className="w-full bg-primary" onClick={createNew}>Create brief</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) { setImportText(""); setImportFile(null); } }}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={!selectedClientId}><Wand2 className="w-4 h-4 mr-1.5" /> Import from doc</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle className="font-display text-2xl">Import a briefing document</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">Upload the brand's brief (PDF, DOCX, or TXT) or paste the text — AI will fill in objective, tone, do's, don'ts, hashtags and mentions. The original file stays attached for reference.</p>
                <div>
                  <Label>Upload file</Label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Input type="file" accept=".pdf,.docx,.txt,.md" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
                    {importFile && <button onClick={() => setImportFile(null)} className="text-xs text-muted-foreground"><X className="w-3.5 h-3.5" /></button>}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">PDF, DOCX, TXT — max ~25k characters parsed.</p>
                </div>
                <div className="text-center text-[10px] uppercase tracking-widest text-muted-foreground">or paste text</div>
                <div>
                  <Textarea rows={8} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste the brief content here…" />
                </div>
                <Button onClick={runImport} disabled={importing || (!importText.trim() && !importFile)} className="w-full bg-primary">
                  {importing ? (<><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Reading & extracting…</>) : (<><Sparkles className="w-4 h-4 mr-1.5" /> Import with AI</>)}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>


      {!selectedClientId ? (
        <Card className="p-10 text-center text-muted-foreground">Add a client first, then create briefs.</Card>
      ) : (
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Template list */}
        <Card className="p-4 lg:col-span-3 h-fit">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Briefs</div>
          {templates.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-5 h-5 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground mt-2">No briefs yet for this client.</p>
              <button onClick={() => setNewOpen(true)} className="text-xs text-accent mt-2">+ Create one</button>
            </div>
          ) : (
            <ul className="space-y-1 max-h-[60vh] overflow-auto -mx-1">
              {templates.map(x => (
                <li key={x.id}>
                  <button
                    onClick={() => setSelectedId(x.id)}
                    className={`w-full text-left px-2 py-2 rounded-md transition-colors ${selectedId === x.id ? "bg-secondary" : "hover:bg-secondary/50"}`}
                  >
                    <div className="text-sm font-medium truncate">{x.name}</div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <Megaphone className="w-2.5 h-2.5" />
                      {usageCounts[x.id] ?? 0} campaign{(usageCounts[x.id] ?? 0) === 1 ? "" : "s"}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Editor */}
        {!t ? (
          <Card className="p-10 lg:col-span-9 text-center text-muted-foreground">Select a brief to edit, or create a new one.</Card>
        ) : (
          <div className="lg:col-span-9 space-y-6">
            <Card className="p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Brief name</Label>
                  <Input value={t.name} onChange={e => setT({ ...t, name: e.target.value })} className="font-display text-2xl mt-1 border-0 px-0 focus-visible:ring-0 h-auto" />
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-xs"><LinkIcon className="w-3 h-3 mr-1" />Linked to {usage} campaign{usage === 1 ? "" : "s"}</Badge>
                    <span className="text-[10px] text-muted-foreground">Edits here update every linked campaign live.</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={remove} variant="ghost" size="sm" className="text-destructive"><Trash2 className="w-3.5 h-3.5 mr-1" /> Delete</Button>
                  <Button onClick={save} disabled={saving} size="sm" className="bg-primary"><Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving…" : "Save brief"}</Button>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Source briefing document</div>
                </div>
                {t.source_file_url && (
                  <Button variant="ghost" size="sm" onClick={removeSourceDoc} className="text-destructive h-7"><X className="w-3.5 h-3.5 mr-1" /> Remove</Button>
                )}
              </div>
              {t.source_file_url ? (
                <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-secondary/40">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{t.source_file_name || "Source document"}</div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">Original brand brief on file</div>
                    </div>
                  </div>
                  <a href={t.source_file_url} target="_blank" rel="noreferrer" className="shrink-0">
                    <Button variant="outline" size="sm"><Download className="w-3.5 h-3.5 mr-1" /> Open</Button>
                  </a>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-muted-foreground">Attach the original PDF / DOCX so the team can always cross-check. The structured fields below stay editable.</p>
                  <label className="cursor-pointer">
                    <input type="file" accept=".pdf,.docx,.txt,.md,.ppt,.pptx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) attachSourceDoc(f); e.currentTarget.value = ""; }} />
                    <Button asChild variant="outline" size="sm" disabled={attachingFile}>
                      <span>{attachingFile ? (<><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Uploading…</>) : (<><Upload className="w-3.5 h-3.5 mr-1" /> Attach file</>)}</span>
                    </Button>
                  </label>
                </div>
              )}
            </Card>


            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Assign to campaigns</div>
                <span className="text-[10px] text-muted-foreground">{usage} linked · {campaigns.length} total for this client</span>
              </div>
              {campaigns.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No campaigns for this client yet.</div>
              ) : (
                <ul className="divide-y">
                  {campaigns.map(c => {
                    const linked = c.brief_template_id === t.id;
                    const otherTpl = !linked && c.brief_template_id ? templates.find(x => x.id === c.brief_template_id)?.name : null;
                    return (
                      <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{c.name}</div>
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                            {linked ? "Linked to this brief" : otherTpl ? `Linked to: ${otherTpl}` : "No brief linked"}
                            {c.status ? ` · ${c.status}` : ""}
                          </div>
                        </div>
                        <Button size="sm" variant={linked ? "outline" : "default"} className={linked ? "" : "bg-primary"} onClick={() => toggleCampaign(c)}>
                          {linked ? (<><X className="w-3.5 h-3.5 mr-1" /> Unlink</>) : (<><LinkIcon className="w-3.5 h-3.5 mr-1" /> {otherTpl ? "Replace & link" : "Link"}</>)}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Big picture</div>
              <div className="space-y-4">
                <div>
                  <Label>Objective</Label>
                  <Textarea rows={2} value={t.objective ?? ""} onChange={e => setT({ ...t, objective: e.target.value })} placeholder="What does success look like for the brand?" className="mt-1.5" />
                </div>
                <div>
                  <Label>Brief / story</Label>
                  <Textarea rows={5} value={t.brief ?? ""} onChange={e => setT({ ...t, brief: e.target.value })} placeholder="Background, audience, why now, key message." className="mt-1.5" />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Content format</Label>
                    <Input value={t.content_format ?? ""} onChange={e => setT({ ...t, content_format: e.target.value })} placeholder="e.g. 1× TikTok 30–60s + 1× IG Reel" className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Tone</Label>
                    <Input value={t.tone ?? ""} onChange={e => setT({ ...t, tone: e.target.value })} placeholder="e.g. Warm, witty, Gen-Z" className="mt-1.5" />
                  </div>
                </div>
              </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-md bg-success/15 text-success flex items-center justify-center"><Check className="w-4 h-4" /></div>
                  <h3 className="font-display text-lg">Do's</h3>
                </div>
                <ListEditor label="Add a do" items={t.dos} onChange={(v: any) => setT({ ...t, dos: v })} placeholder="e.g. Mention the brand in first 5s" />
              </Card>
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-md bg-destructive/15 text-destructive flex items-center justify-center"><X className="w-4 h-4" /></div>
                  <h3 className="font-display text-lg">Don'ts</h3>
                </div>
                <ListEditor label="Add a don't" items={t.donts} onChange={(v: any) => setT({ ...t, donts: v })} placeholder="e.g. No competitor mentions" />
              </Card>
            </div>

            <Card className="p-5">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Tags & mentions</div>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" />Primary hashtag</Label>
                  <Input value={t.hashtag ?? ""} onChange={e => setT({ ...t, hashtag: e.target.value })} placeholder="#YourCampaign" className="mt-1.5" />
                </div>
                <ListEditor label="Additional hashtags" items={t.hashtags_extra} onChange={(v: any) => setT({ ...t, hashtags_extra: v })} placeholder="#extraTag" icon={Hash} />
              </div>
              <div className="mt-4">
                <ListEditor label="Mandatory @mentions" items={t.mandatory_mentions} onChange={(v: any) => setT({ ...t, mandatory_mentions: v })} placeholder="@brandhandle" icon={AtSign} />
              </div>
              <div className="mt-4">
                <ListEditor label="Reference links" items={t.references_urls} onChange={(v: any) => setT({ ...t, references_urls: v })} placeholder="https://..." icon={LinkIcon} />
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Compliance & payout</div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <Label>Withholding tax %</Label>
                  <Input type="number" step="0.5" value={t.wht_percent ?? 5} onChange={e => setT({ ...t, wht_percent: e.target.value })} className="mt-1.5" />
                  <p className="text-[10px] text-muted-foreground mt-1">KE residents: 5% standard. Non-residents: 20%.</p>
                </div>
                <div className="sm:col-span-2 bg-secondary/40 rounded-md p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />How this works</p>
                  <p>Link this brief to a campaign in the campaign's New/Edit dialog. Every creator brief link for that campaign reads from here in real time — including do's, don'ts, hashtags and mentions.</p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
      )}
    </div>
  );
};
export default Briefs;
