import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trophy, Plus, Copy, ExternalLink, RefreshCw, Check, X, Crown, Download, Trash2, Pencil, Link2, Users, Sparkles, Instagram, Music2, Upload, Eye, Heart, MessageCircle, Share2, Facebook, AlertCircle, MoreHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { canonicalPostUrl, cleanHandle as cleanH } from "@/lib/postUrl";

const PLATFORMS = ["tiktok","instagram","youtube","twitter","facebook"];

export const ContestsSection = ({ campaignId, contestId }: { campaignId?: string; contestId?: string }) => {
  const [contests, setContests] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [officialWinners, setOfficialWinners] = useState<any[]>([]);
  const [creatorHandles, setCreatorHandles] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [polling, setPolling] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [lastRun, setLastRun] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: "", hashtag: "#", platforms: ["tiktok"], start_date: "", end_date: "", round_days: 14, prize: "" });
  const [entry, setEntry] = useState<any>({ platform: "tiktok", post_url: "", handle: "", likes: 0, comments: 0, shares: 0, views: 0 });
  const [editEntry, setEditEntry] = useState<any>(null);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [prizesOpen, setPrizesOpen] = useState(false);
  const latestErrors = Array.isArray(lastRun?.errors) ? lastRun.errors : [];

  // Score formula: shares ×3 + comments ×2 + likes ×1 + views ×1
  const scoreOf = (stats: { shares?: any; comments?: any; likes?: any; views?: any }) =>
    Number(stats.shares || 0) * 3 + Number(stats.comments || 0) * 2 + Number(stats.likes || 0) + Number(stats.views || 0);

  const postTime = (post: any) => {
    const t = new Date(post?.posted_at || post?.created_at || 0).getTime();
    return Number.isFinite(t) && t > 0 ? t : Number.MAX_SAFE_INTEGER;
  };
  const sourceRank = (post: any) => {
    const source = String(post?.source || "").toLowerCase();
    if (source === "manual" || source === "public_form") return 0;
    if (source === "registration" || source === "csv_import" || source === "external_feed") return 1;
    return 2;
  };
  const pickCountedPost = (rows: any[]) => {
    const byUrl = new Map<string, any>();
    for (const row of rows) {
      const candidates = [row, ...(Array.isArray(row.cross_posts) ? row.cross_posts : [])];
      for (const post of candidates) {
        const key = canonicalPostUrl(post?.post_url);
        if (!key) continue;
        const prev = byUrl.get(key);
        if (!prev || sourceRank(post) < sourceRank(prev) || (sourceRank(post) === sourceRank(prev) && scoreOf(post) > scoreOf(prev))) {
          byUrl.set(key, post);
        }
      }
    }
    return Array.from(byUrl.values()).sort((a, b) => scoreOf(b) - scoreOf(a) || sourceRank(a) - sourceRank(b) || postTime(a) - postTime(b) || new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())[0] || null;
  };

  // Score = sum of the BEST post per platform (TikTok + IG + FB stack, two
  // TikToks do not). Dedupes by canonical URL first.
  const bestScore = (e: any) => {
    const xs = Array.isArray(e.cross_posts) ? e.cross_posts : [];
    const byUrl = new Map<string, { platform: string; score: number }>();
    for (const p of [e, ...xs]) {
      const k = canonicalPostUrl(p?.post_url);
      if (!k) continue;
      const plat = String(p?.platform || "other").toLowerCase();
      const s = scoreOf(p);
      const prev = byUrl.get(k);
      if (!prev || s > prev.score) byUrl.set(k, { platform: plat, score: s });
    }
    const bestPerPlatform = new Map<string, number>();
    for (const { platform, score } of byUrl.values()) {
      bestPerPlatform.set(platform, Math.max(bestPerPlatform.get(platform) ?? 0, score));
    }
    return Array.from(bestPerPlatform.values()).reduce((a, b) => a + b, 0);
  };
  // Identify whether an entry was auto-fetched from a public scraper or entered/registered by a human.
  const AUTO_SOURCES = new Set(["meta_graph", "ensembledata", "tiktok_api", "instagram_api", "apify"]);
  const isAuto = (e: any) => AUTO_SOURCES.has(String(e.source || "").toLowerCase());

  const normalizedText = (value?: string | null) => (value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const editDistance = (a: string, b: string, max = 2) => {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let last = prev[0];
      prev[0] = i;
      let rowMin = prev[0];
      for (let j = 1; j <= b.length; j++) {
        const old = prev[j];
        prev[j] = a[i - 1] === b[j - 1] ? last : Math.min(last, prev[j - 1], prev[j]) + 1;
        last = old;
        rowMin = Math.min(rowMin, prev[j]);
      }
      if (rowMin > max) return max + 1;
    }
    return prev[b.length];
  };
  const winnerMatchesRow = (winner: any, row: any) => {
    if (!winner || !row) return false;
    if (winner.entry_id && winner.entry_id === row.id) return true;
    const winnerHandle = cleanH(winner.handle);
    if (winnerHandle) {
      const rowHandles = [row.handle, row.instagram_handle, row.tiktok_handle, row.facebook_handle].map(cleanH).filter(Boolean);
      if (rowHandles.includes(winnerHandle)) return true;
    }
    const winnerUrl = canonicalPostUrl(winner.post_url);
    if (winnerUrl && canonicalPostUrl(row.post_url) === winnerUrl) return true;
    const winnerName = normalizedText(winner.full_name);
    const rowName = normalizedText(row.full_name || row.submitter_name);
    if (winnerName && rowName) {
      if (winnerName === rowName) return true;
      const wt = winnerName.split(" ").filter(Boolean);
      const rt = rowName.split(" ").filter(Boolean);
      // Handles common registration typos without reintroducing the earlier
      // Betty/Phoebe bug: first name must match exactly, surname can be 1–2 edits off.
      if (wt.length >= 2 && rt.length >= 2 && wt[0] === rt[0] && editDistance(wt.slice(1).join(""), rt.slice(1).join(""), 2) <= 2) return true;
    }
    return false;
  };
  // Collect EVERY identifier we know about for a row so we can union-find contestants that
  // appear in multiple entry rows (one per platform, plus the original registration).
  const identifiersOf = (e: any): string[] => {
    const ids: string[] = [];
    for (const h of [e.handle, e.instagram_handle, e.tiktok_handle, e.facebook_handle]) {
      const c = cleanH(h); if (c) ids.push(`h:${c}`);
    }
    const email = normalizedText(e.submitter_email); if (email) ids.push(`e:${email}`);
    const phone = String(e.phone || "").replace(/\D/g, ""); if (phone.length >= 7) ids.push(`p:${phone}`);
    const name = normalizedText(e.full_name || e.submitter_name);
    if (name && name.split(" ").length >= 2) ids.push(`n:${name}`);
    const ext = (e.external_registration_id || "").trim(); if (ext) ids.push(`r:${ext}`);
    return ids;
  };
  // Union-find: merge any two entries that share at least one identifier.
  const groupEntriesByContestant = (rows: any[]): any[][] => {
    const parent = new Map<number, number>();
    const find = (i: number): number => { while (parent.get(i) !== i) { parent.set(i, parent.get(parent.get(i)!)!); i = parent.get(i)!; } return i; };
    const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    rows.forEach((_, i) => parent.set(i, i));
    const idToIdx = new Map<string, number>();
    rows.forEach((r, i) => {
      for (const id of identifiersOf(r)) {
        if (idToIdx.has(id)) union(i, idToIdx.get(id)!);
        else idToIdx.set(id, i);
      }
    });
    const groups = new Map<number, any[]>();
    rows.forEach((r, i) => {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(r);
    });
    return Array.from(groups.values());
  };

  // Reduce a group of entry rows for one contestant into a flat list of unique posts (by URL),
  // with a representative registration row + the SUM of all post scores.
  const summarizeContestant = (rows: any[]) => {
    const reg = rows.find(r => r.source === "registration" || r.source === "csv_import" || r.source === "external_feed") || rows[0];
    const byUrl = new Map<string, any>();
    for (const row of rows) {
      const candidates = [row, ...(Array.isArray(row.cross_posts) ? row.cross_posts : [])];
      for (const post of candidates) {
        const k = canonicalPostUrl(post?.post_url);
        if (!k) continue;
        const prev = byUrl.get(k);
        if (!prev || scoreOf(post) > scoreOf(prev)) {
          byUrl.set(k, { ...post, _entryId: row.id, id: post.id ?? `${row.id}:${k}` });
        }
      }
    }
    const allPosts = Array.from(byUrl.values()).sort((a, b) => scoreOf(b) - scoreOf(a));
    // Only the best-performing post per platform counts toward the score.
    // Cross-platform crossposts still count (TikTok + Instagram + Facebook),
    // but two TikTok videos from the same contestant do not stack.
    const bestPerPlatform = new Map<string, any>();
    for (const p of allPosts) {
      const plat = String(p.platform || "other").toLowerCase();
      const prev = bestPerPlatform.get(plat);
      if (!prev || scoreOf(p) > scoreOf(prev)) bestPerPlatform.set(plat, p);
    }
    const posts = Array.from(bestPerPlatform.values()).sort((a, b) => scoreOf(b) - scoreOf(a));
    const total = posts.reduce((s, p) => s + scoreOf(p), 0);
    // Pick one row to act as the "leaderboard row" — registration if it exists, else the top post entry.
    const leaderRow = reg ?? rows[0];
    return {
      ...leaderRow,
      full_name: rows.map(r => r.full_name).find(Boolean) || rows.map(r => r.submitter_name).find(Boolean) || leaderRow.full_name,
      submitter_name: rows.map(r => r.submitter_name).find(Boolean) || leaderRow.submitter_name,
      submitter_email: rows.map(r => r.submitter_email).find(Boolean) || leaderRow.submitter_email,
      instagram_handle: rows.map(r => r.instagram_handle).find(Boolean) || leaderRow.instagram_handle,
      tiktok_handle: rows.map(r => r.tiktok_handle).find(Boolean) || leaderRow.tiktok_handle,
      facebook_handle: rows.map(r => r.facebook_handle).find(Boolean) || leaderRow.facebook_handle,
      _allRows: rows,
      _posts: posts,
      _allPosts: allPosts,
      score: total,
      // Totals = sum across the counted (best-per-platform) posts only.
      views: posts.reduce((s, p) => s + Number(p.views || 0), 0),
      likes: posts.reduce((s, p) => s + Number(p.likes || 0), 0),
      comments: posts.reduce((s, p) => s + Number(p.comments || 0), 0),
      shares: posts.reduce((s, p) => s + Number(p.shares || 0), 0),
      cross_posts: [],
    };
  };


  // Build the edit dialog data from a (possibly merged) contestant row.
  // If the row carries _posts/_allRows from summarizeContestant, we pre-fill
  // the original post + crossposts so the editor shows every platform the
  // team has already entered (TikTok + IG + Facebook), not just one.
  const openEditFor = (rowOrMerged: any) => {
    const allRows: any[] = Array.isArray(rowOrMerged._allRows) ? rowOrMerged._allRows : [rowOrMerged];
    const posts: any[] = Array.isArray(rowOrMerged._posts) && rowOrMerged._posts.length
      ? rowOrMerged._posts
      : allRows.flatMap(r => [
          ...(r.post_url ? [{ platform: r.platform, post_url: r.post_url, views: r.views, likes: r.likes, comments: r.comments, shares: r.shares }] : []),
          ...(Array.isArray(r.cross_posts) ? r.cross_posts : []),
        ]);

    // Prefer the registration row as the row we'll write back to (so manual
    // edits don't get overwritten by the next auto-fetch on a scraper row).
    const targetRow = allRows.find(r => ["registration","csv_import","external_feed","manual","public_form"].includes(String(r.source || "").toLowerCase())) || allRows[0];

    // Pick the highest-scoring post as the "original", rest become crossposts.
    const sorted = [...posts].sort((a, b) => scoreOf(b) - scoreOf(a));
    const original = sorted[0] || {};
    const crossposts = sorted.slice(1).map((p: any) => ({
      platform: p.platform, post_url: p.post_url || "",
      views: Number(p.views || 0), likes: Number(p.likes || 0),
      comments: Number(p.comments || 0), shares: Number(p.shares || 0),
    }));

    setEditEntry({
      ...targetRow,
      platform: original.platform ?? targetRow.platform,
      post_url: original.post_url ?? targetRow.post_url ?? "",
      views: Number(original.views ?? 0),
      likes: Number(original.likes ?? 0),
      comments: Number(original.comments ?? 0),
      shares: Number(original.shares ?? 0),
      cross_posts: crossposts,
      // remember which other rows we absorbed so we can delete them on save
      _absorbRowIds: allRows.filter(r => r.id !== targetRow.id).map(r => r.id),
    });
  };

  const saveEditEntry = async () => {
    if (!editEntry) return;
    const cleanedCross = (editEntry.cross_posts || []).filter((x: any) => (x.post_url || "").trim());
    const score = bestScore({ ...editEntry, cross_posts: cleanedCross });

    // Free up the unique (contest_id, post_url) index by deleting any sibling
    // rows we're absorbing, plus any other row in the contest whose post_url
    // collides with one we're about to save.
    const urlsToFree = [editEntry.post_url, ...cleanedCross.map((x: any) => x.post_url)]
      .map((u: string) => (u || "").trim()).filter(Boolean);
    const absorb: string[] = (Array.isArray(editEntry._absorbRowIds) ? editEntry._absorbRowIds : [])
      .filter((id: string) => id && id !== editEntry.id);
    if (absorb.length) {
      await supabase.from("contest_entries").delete().in("id", absorb);
    }
    if (urlsToFree.length && editEntry.contest_id) {
      await supabase.from("contest_entries")
        .delete()
        .eq("contest_id", editEntry.contest_id)
        .neq("id", editEntry.id)
        .in("post_url", urlsToFree);
    }

    const { error } = await supabase.from("contest_entries").update({
      handle: editEntry.handle,
      instagram_handle: editEntry.instagram_handle,
      tiktok_handle: editEntry.tiktok_handle,
      facebook_handle: editEntry.facebook_handle,
      post_url: editEntry.post_url || null,
      platform: editEntry.platform,
      views: Number(editEntry.views) || 0,
      likes: Number(editEntry.likes) || 0,
      comments: Number(editEntry.comments) || 0,
      shares: Number(editEntry.shares) || 0,
      cross_posts: cleanedCross,
      score,
    }).eq("id", editEntry.id);
    if (error) return toast.error(error.message);
    toast.success("Entry updated");
    setEditEntry(null);
    load();
  };

  const fetchAllContestEntries = async (cid: string) => {
    const rows: any[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase.from("contest_entries")
        .select("*")
        .eq("contest_id", cid)
        .order("score", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  };

  const load = async () => {
    let cs: any[] = [];
    if (contestId) {
      const { data } = await supabase.from("contests").select("*").eq("id", contestId).limit(1);
      cs = data ?? [];
      if (cs.length && activeId !== cs[0].id) setActiveId(cs[0].id);
    } else if (campaignId) {
      const { data } = await supabase.from("contests").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: false });
      cs = data ?? [];
      if (cs.length && !activeId) setActiveId(cs[0].id);
    }
    setContests(cs);
    const cid = activeId ?? cs[0]?.id;
    if (cid) {
      const [es, { data: winners }] = await Promise.all([
        fetchAllContestEntries(cid),
        (supabase as any).from("contest_winners").select("*").eq("contest_id", cid).order("round_number", { ascending: true }).order("placement_rank", { ascending: true }),
      ]);
      setEntries(es ?? []);
      setOfficialWinners(winners ?? []);
      const { data: lr } = await (supabase as any).from("contestant_sync_runs").select("*").eq("contest_id", cid).order("started_at", { ascending: false }).limit(1).maybeSingle();
      setLastRun(lr ?? null);
    } else {
      setEntries([]);
      setOfficialWinners([]);
    }
    // Paid creators (anyone in the influencer roster) must never appear as
    // contestants — load every roster handle, not just this campaign's, so
    // that hashtag-discovered posts from paid talent are filtered out.
    const set = new Set<string>();
    const { data: allInf } = await supabase.from("influencers").select("handle, alt_handles");
    for (const row of allInf ?? []) {
      const h = cleanH((row as any).handle);
      if (h) set.add(h);
      for (const a of ((row as any).alt_handles ?? [])) {
        const c = cleanH(a); if (c) set.add(c);
      }
    }
    const effectiveCampaignId = campaignId ?? cs[0]?.campaign_id;
    if (effectiveCampaignId) {
      const { data: ci } = await supabase
        .from("campaign_influencers")
        .select("influencers(handle)")
        .eq("campaign_id", effectiveCampaignId);
      for (const row of ci ?? []) {
        const h = cleanH((row as any).influencers?.handle);
        if (h) set.add(h);
      }
    }
    // Per-contest exclusion list (royco.ke, etc.) — treat as paid-creator handles
    // so all existing filters skip them in scoring, leaderboard, and table.
    if (cid) {
      const { data: excl } = await (supabase as any)
        .from("contest_excluded_handles")
        .select("handle")
        .eq("contest_id", cid);
      for (const row of excl ?? []) {
        const h = cleanH((row as any).handle);
        if (h) set.add(h);
      }
    }
    setCreatorHandles(set);
  };

  const cleanCsvValue = (value?: any) => {
    const s = String(value ?? "").trim();
    if (!s || /^(-|none|null|n\/a|na)$/i.test(s)) return null;
    return s;
  };

  const cleanHandle = (s?: string | null) => {
    const value = cleanCsvValue(s);
    if (!value) return null;
    return value.replace(/^@+/, "").replace(/^https?:\/\/(www\.)?(instagram|tiktok|facebook)\.com\//i, "").replace(/[/?#].*$/, "").toLowerCase() || null;
  };

  const pick = (row: any, ...keys: string[]) => {
    const norm = (s: string) => s.toLowerCase().replace(/[\s_\-#]/g, "");
    const lookup: Record<string, any> = {};
    for (const k of Object.keys(row)) lookup[norm(k)] = row[k];
    for (const k of keys) {
      const v = lookup[norm(k)];
        const cleaned = cleanCsvValue(v);
        if (cleaned) return cleaned;
    }
    return null;
  };

  const platformFromPostUrl = (url?: string | null) => {
    const u = (url || "").toLowerCase();
    if (/instagram\.com/.test(u)) return "instagram";
    if (/tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com/.test(u)) return "tiktok";
    if (/facebook\.com|fb\.watch/.test(u)) return "facebook";
    return null;
  };

  const normalizeCsvPostUrl = (url?: string | null) => {
    const value = cleanCsvValue(url);
    if (!value || !/^https?:\/\//i.test(value)) return null;
    // Keep real post links only; profile links are handled via username fields.
    if (!/(instagram\.com\/(?:p|reel|reels|tv)\/|tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com|facebook\.com|fb\.watch)/i.test(value)) return null;
    return canonicalPostUrl(value);
  };

  const stableRegistrationId = (row: any, i: number) => {
    const response = pick(row, "response", "response #", "id", "submission id", "registration id") || `row-${i + 1}`;
    const email = normalizedText(pick(row, "email", "email address"));
    const phone = String(pick(row, "phone", "phone number", "mobile") || "").replace(/\D/g, "");
    const stamp = normalizedText(pick(row, "timestamp", "submitted at", "created at"));
    const name = normalizedText(pick(row, "full name", "name", "fullname"));
    const who = email || phone || `${name}:${stamp}` || `row-${i + 1}`;
    return `csv:${String(response).trim()}:${who}`.slice(0, 220);
  };

  const sameContestant = (a: any, b: any) => {
    const ae = normalizedText(a.submitter_email); const be = normalizedText(b.submitter_email);
    if (ae && be && ae === be) return true;
    const ap = String(a.phone || "").replace(/\D/g, ""); const bp = String(b.phone || "").replace(/\D/g, "");
    if (ap.length >= 7 && bp.length >= 7 && ap === bp) return true;
    const an = normalizedText(a.full_name || a.submitter_name); const bn = normalizedText(b.full_name || b.submitter_name);
    return !!an && !!bn && an === bn;
  };

  const uploadCsv = async (file: File) => {
    if (!activeId) return toast.error("Pick a contest first");
    setUploading(true);
    try {
      const text = await file.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      const rows = (parsed.data as any[]).filter(Boolean);
      if (!rows.length) { toast.error("No rows in CSV"); return; }

      const prepared = rows.map((r, i) => {
        const ig = cleanHandle(pick(r, "instagram", "instagram handle", "ig"));
        const tt = cleanHandle(pick(r, "tiktok", "tiktok handle"));
        const fb = cleanHandle(pick(r, "facebook", "facebook handle", "fb"));
        const rawPostUrl = pick(r, "post url", "post", "url", "submission url", "video url");
        const postUrl = normalizeCsvPostUrl(rawPostUrl);
        const selectedPlatform = (pick(r, "selected platform", "platform") || "").toLowerCase();
        const platform = (PLATFORMS.includes(selectedPlatform) ? selectedPlatform : platformFromPostUrl(postUrl) || (tt ? "tiktok" : ig ? "instagram" : fb ? "facebook" : "instagram")) as any;
        const legacyExt = pick(r, "response", "response #", "id", "submission id", "registration id");
        return {
          contest_id: activeId,
          external_registration_id: stableRegistrationId(r, i),
          _legacyExternalId: legacyExt ? String(legacyExt) : null,
          platform,
          post_url: postUrl,
          status: "registered",
          source: "registration",
          full_name: pick(r, "full name", "name", "fullname"),
          submitter_name: pick(r, "full name", "name", "fullname"),
          submitter_email: pick(r, "email", "email address"),
          phone: pick(r, "phone", "phone number", "mobile"),
          address: pick(r, "address"),
          lga: pick(r, "lga", "local government area"),
          instagram_handle: ig,
          tiktok_handle: tt,
          facebook_handle: fb,
          handle: ig || tt || fb,
          metadata: { raw: r },
        };
      }).filter(r => r.submitter_email || r.instagram_handle || r.tiktok_handle || r.facebook_handle || r.phone || r.post_url);

      if (!prepared.length) { toast.error("No valid contestants found in CSV"); return; }

      let ok = 0;
      const errors: string[] = [];
      const { data: existingRows } = await supabase
        .from("contest_entries")
        .select("id, external_registration_id, post_url, full_name, submitter_name, submitter_email, phone, views, likes, comments, shares")
        .eq("contest_id", activeId);
      const existing = existingRows ?? [];
      const byExt = new Map(existing.filter((r: any) => r.external_registration_id).map((r: any) => [String(r.external_registration_id), r]));
      const byUrl = new Map(existing.filter((r: any) => r.post_url).map((r: any) => [canonicalPostUrl(r.post_url), r]));

      for (const row of prepared) {
        const { _legacyExternalId, ...base } = row;
        const urlKey = canonicalPostUrl(base.post_url);
        const legacy = _legacyExternalId ? byExt.get(_legacyExternalId) : null;
        const target = (urlKey && byUrl.get(urlKey)) || byExt.get(base.external_registration_id) || (legacy && sameContestant(legacy, base) ? legacy : null);
        const targetUrl = canonicalPostUrl(target?.post_url);
        const postChanged = !!target && !!base.post_url && targetUrl !== urlKey;
        const payload: any = { ...base };
        if (!base.post_url) delete payload.post_url;
        if (target) {
          for (const key of ["handle", "instagram_handle", "tiktok_handle", "facebook_handle"]) {
            if (payload[key] == null) delete payload[key];
          }
        }
        if (postChanged) Object.assign(payload, { views: 0, likes: 0, comments: 0, shares: 0, score: 0, cross_posts: [] });

        const { error } = target
          ? await supabase.from("contest_entries").update(payload).eq("id", target.id)
          : await supabase.from("contest_entries").insert(payload);
        if (error) errors.push(error.message); else ok++;
      }
      await (supabase as any).from("contestant_sync_runs").insert({
        contest_id: activeId, source: "csv_upload", triggered_by: "manual",
        fetched: rows.length, upserted: ok, status: errors.length ? "partial" : "ok",
        errors: errors.map(msg => ({ msg })), finished_at: new Date().toISOString(),
      });
      if (errors.length) toast.error(`Imported ${ok}/${prepared.length} — ${errors[0]}`);
      else toast.success(`Imported ${ok} contestants from CSV`);
      load();
    } catch (e: any) {
      toast.error(e.message || "CSV upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const syncContestants = async () => {
    if (!activeId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("contestants-sync", { body: { contest_id: activeId, triggered_by: "manual" } });
      if (error) toast.error(error.message);
      else if ((data as any)?.error) toast.error((data as any).error);
      else toast.success(`Synced ${(data as any)?.upserted ?? 0} contestants`);
      load();
    } finally { setSyncing(false); }
  };

  const discoverPosts = async (only_handle?: string) => {
    if (!activeId) return;
    setDiscovering(true);
    try {
      const { data, error } = await supabase.functions.invoke("contest-discover-posts", { body: { contest_id: activeId, triggered_by: "manual", only_handle } });
      if (error) toast.error(error.message);
      else if ((data as any)?.error) toast.error((data as any).error);
      else toast.success(`Found ${(data as any)?.upserted ?? 0} matching posts`);
      load();
    } finally { setDiscovering(false); }
  };

  const fetchByHandle = async (only_handle?: string) => {
    if (!activeId) return;
    setDiscovering(true);
    try {
      const { data, error } = await supabase.functions.invoke("contest-fetch-handle-posts", { body: { contest_id: activeId, triggered_by: "manual", only_handle } });
      if (error) toast.error(error.message);
      else if ((data as any)?.error) toast.error((data as any).error);
      else {
        const count = (data as any)?.upserted ?? 0;
        const errs = Array.isArray((data as any)?.errors) ? (data as any).errors.length : 0;
        toast[count > 0 ? "success" : "message"](`Updated ${count} contestant${count === 1 ? "" : "s"} from handles${errs ? ` · ${errs} need valid handles/manual metrics` : ""}`);
      }
      load();
    } finally { setDiscovering(false); }
  };
  useEffect(() => { load(); }, [campaignId, contestId, activeId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignId) return toast.error("Use the Contests section to create a new contest");
    const { error } = await (supabase.from("contests") as any).insert({ ...form, campaign_id: campaignId });
    if (error) return toast.error(error.message);
    toast.success("Contest created"); setOpen(false);
    setForm({ name: "", hashtag: "#", platforms: ["tiktok"], start_date: "", end_date: "", round_days: 14, prize: "" });
    load();
  };

  const addEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId) return;
    const score = scoreOf(entry);
    const { error } = await supabase.from("contest_entries").insert({ ...entry, contest_id: activeId, status: "approved", source: "manual", score });
    if (error) return toast.error(error.message);
    toast.success("Entry added"); setEntryOpen(false);
    setEntry({ platform: "tiktok", post_url: "", handle: "", likes: 0, comments: 0, shares: 0, views: 0 });
    load();
  };

  const setStatus = async (id: string, status: string) => {
    await supabase.from("contest_entries").update({ status }).eq("id", id);
    load();
  };

  const deleteEntry = async (entryRow: any) => {
    const label = entryRow.handle || entryRow.post_url || "this entry";
    if (!confirm(`Delete ${label} from this contest? This cannot be undone.`)) return;
    const { error } = await supabase.from("contest_entries").delete().eq("id", entryRow.id);
    if (error) return toast.error(error.message);
    toast.success("Entry deleted");
    load();
  };

  const [removeTarget, setRemoveTarget] = useState<{ rows: any[]; name: string } | null>(null);
  const requestRemoveContestant = (rows: any[], displayName: string) => {
    if (!activeId || !rows?.length) return;
    setRemoveTarget({ rows, name: displayName });
  };
  const confirmRemoveContestant = async () => {
    if (!activeId || !removeTarget) return;
    const { rows, name: displayName } = removeTarget;
    const ids = rows.map(r => r.id).filter(Boolean);
    const handles = Array.from(new Set(
      rows.flatMap(r => [r.handle, r.instagram_handle, r.tiktok_handle, r.facebook_handle])
        .map(cleanH).filter(Boolean)
    ));
    try {
      if (ids.length) {
        const { error } = await supabase.from("contest_entries").delete().in("id", ids);
        if (error) { toast.error(error.message); return; }
      }
      if (handles.length) {
        await supabase.from("contest_excluded_handles").insert(
          handles.map(h => ({ contest_id: activeId, handle: h, reason: "removed from top 10" }))
        );
      }
      toast.success(`${displayName} removed`);
    } finally {
      setRemoveTarget(null);
      load();
    }
  };

  const refreshScores = async () => {
    if (!activeId) return;
    setPolling(true);
    try {
      const { data, error } = await supabase.functions.invoke("contest-refresh-metrics", { body: { contest_id: activeId } });
      if (error) toast.error(error.message);
      else {
        const d = data as any;
        toast.success(`Ensemble refresh: ${d?.updated ?? 0}/${d?.total ?? 0} updated${d?.failed ? `, ${d.failed} failed` : ""}`);
      }
      load();
    } finally { setPolling(false); }
  };


  const active = contests.find(c => c.id === activeId);
  const submitUrl = active ? `${window.location.origin}/c/${active.submission_token}` : "";

  const isCreator = (e: any) => {
    const hs = [e.handle, e.instagram_handle, e.tiktok_handle, e.facebook_handle].map(cleanH).filter(Boolean);
    return hs.some(h => creatorHandles.has(h));
  };

  const officialWinnerRowIds = useMemo(() => {
    if (!officialWinners.length || !entries.length) return new Set<string>();
    return new Set(entries.filter(row => officialWinners.some(w => winnerMatchesRow(w, row))).map(row => row.id));
  }, [entries, officialWinners]);

  const isAnnouncedWinner = (e: any) => e.status === "winner" || e.metadata?.placement_rank != null || officialWinnerRowIds.has(e.id);

  const byRound = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const e of entries) {
      if (isCreator(e)) continue;
      if (isAnnouncedWinner(e)) continue; // winners shown separately
      const k = e.round_number || 1;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return Array.from(map.entries())
      .map(([round, rows]) => [round, groupEntriesByContestant(rows).map(summarizeContestant)] as [number, any[]])
      .sort((a, b) => a[0] - b[0]);
  }, [entries, creatorHandles, officialWinnerRowIds]);

  const availableRounds = useMemo(() => {
    const s = new Set<number>();
    for (const e of entries) s.add(e.round_number || 1);
    // Also surface rounds implied by manual cutoffs (so empty current round still shows a tab).
    const cutoffs = Array.isArray(active?.manual_round_cutoffs) ? active.manual_round_cutoffs : [];
    for (let i = 1; i <= cutoffs.length + 1; i++) s.add(i);
    const arr = Array.from(s).sort((a, b) => a - b);
    return arr.length ? arr : [1];
  }, [entries, active]);

  useEffect(() => {
    if (selectedRound == null || !availableRounds.includes(selectedRound)) {
      setSelectedRound(availableRounds[availableRounds.length - 1]);
    }
  }, [availableRounds, selectedRound]);

  // Single running list across ALL rounds: include everyone EXCEPT the announced winners.
  const entriesForRound = useMemo(
    () => entries.filter(e => !isAnnouncedWinner(e)),
    [entries, officialWinnerRowIds]
  );

  // Overall contest totals — mirrors PublicContestReport so numbers match exactly.
  // Includes ALL entries (roster/paid creators + announced winners) so the
  // headline reflects cumulative all-time reach. Deduped by canonical post URL.
  const overallTotals = useMemo(() => {
    // Keep the MAX-metrics version per canonical URL so a stale registration
    // row (views=0) can't shadow the scraper row that later captured the real
    // numbers. Matches PublicContestReport + ContestsList.
    const byUrl = new Map<string, { views: number; likes: number; comments: number; shares: number }>();
    const noUrl: any[] = [];
    const score = (p: any) => Number(p?.views || 0) + Number(p?.likes || 0) + Number(p?.comments || 0) + Number(p?.shares || 0);
    for (const row of entries) {
      const cands = [row, ...(Array.isArray((row as any).cross_posts) ? (row as any).cross_posts : [])];
      let hasUrl = false;
      for (const p of cands) {
        const url = canonicalPostUrl(p?.post_url);
        if (!url) continue;
        hasUrl = true;
        const cand = { views: Number(p?.views || 0), likes: Number(p?.likes || 0), comments: Number(p?.comments || 0), shares: Number(p?.shares || 0) };
        const cur = byUrl.get(url);
        if (!cur || score(cand) > score(cur)) byUrl.set(url, cand);
      }
      if (!hasUrl && score(row) > 0) noUrl.push({ views: Number(row.views || 0), likes: Number(row.likes || 0), comments: Number(row.comments || 0), shares: Number(row.shares || 0) });
    }
    let views = 0, likes = 0, comments = 0, shares = 0, posts = 0;
    for (const p of [...byUrl.values(), ...noUrl]) {
      views += p.views; likes += p.likes; comments += p.comments; shares += p.shares; posts += 1;
    }
    const contestants = groupEntriesByContestant(entries.filter(e => !isCreator(e))).length;
    return { contestants, posts, views, likes, comments, shares, eng: likes + comments + shares };
  }, [entries, creatorHandles]);


  // Compute which rows belong to (a) announced winners (incl. fuzzy-matched siblings)
  // and (b) the top-10 contestants. We use these to make sure each contestant
  // appears in exactly one place: winners card, top-10 cards, OR the table below.
  const { winnerRelatedRowIds, top10RowIds } = useMemo(() => {
    const winnerRows = entries.filter(isAnnouncedWinner);
    const allGroups = groupEntriesByContestant(entries);
    const winnerKeys = new Set(winnerRows.map((r: any) => r.id));
    const winnerGroups = allGroups.filter((rows: any[]) => rows.some(r => winnerKeys.has(r.id)));
    const used = new Set<string>(winnerGroups.flat().map((r: any) => r.id));
    for (const wRow of winnerRows) {
      const grp = winnerGroups.find((g: any[]) => g.some(r => r.id === wRow.id));
      if (!grp) continue;
      const nameTokens = String(wRow.full_name || wRow.submitter_name || "")
        .toLowerCase().split(/\s+/).filter(t => t.length >= 5);
      // Require ≥2 tokens AND all-present-as-whole-tokens to avoid swallowing
      // unrelated contestants whose handle merely contains a common first name
      // (e.g. @bettysmemoir matched winner "Betty Wambua" on substring "betty").
      if (nameTokens.length < 2) continue;
      for (const e of entries) {
        if (used.has(e.id)) continue;
        if (Number(e.views || 0) <= 0 && Number(e.likes || 0) <= 0) continue;
        const hayTokens = new Set(
          [e.handle, e.tiktok_handle, e.instagram_handle, e.facebook_handle, e.full_name, e.submitter_name]
            .flatMap(s => String(s || "").toLowerCase().split(/[^a-z0-9]+/))
            .filter(Boolean),
        );
        if (nameTokens.every(t => hayTokens.has(t))) { grp.push(e); used.add(e.id); }
      }
    }
    const winnerRelatedRowIds = new Set<string>(winnerGroups.flat().map((r: any) => r.id));

    const nonCreator = entries.filter(e => !isCreator(e) && !winnerRelatedRowIds.has(e.id));
    const grouped = groupEntriesByContestant(nonCreator);
    const contestants = grouped.map((rows: any[]) => {
      const byUrl = new Map<string, any>();
      for (const row of rows) {
        const cands = [row, ...(Array.isArray(row.cross_posts) ? row.cross_posts : [])];
        for (const post of cands) {
          const k = canonicalPostUrl(post?.post_url);
          if (!k) continue;
          const prev = byUrl.get(k);
          if (!prev || scoreOf(post) > scoreOf(prev)) byUrl.set(k, post);
        }
      }
      const allPosts = Array.from(byUrl.values());
      const bestPerPlatform = new Map<string, any>();
      for (const p of allPosts) {
        const plat = String(p.platform || "other").toLowerCase();
        const prev = bestPerPlatform.get(plat);
        if (!prev || scoreOf(p) > scoreOf(prev)) bestPerPlatform.set(plat, p);
      }
      const total = Array.from(bestPerPlatform.values()).reduce((s, p) => s + scoreOf(p), 0);
      return { rows, total };
    }).sort((a, b) => b.total - a.total);
    const top10RowIds = new Set<string>(contestants.slice(0, 10).flatMap(c => c.rows.map((r: any) => r.id)));
    return { winnerRelatedRowIds, top10RowIds };
  }, [entries, creatorHandles, officialWinnerRowIds]);


  const exportCsv = () => {
    if (!active || !entries.length) return toast.error("No entries to export");
    const headers = ["round","rank","handle","submitter_name","submitter_email","platform","post_url","views","likes","comments","shares","score","status","posted_at","created_at"];
    // One row per canonical post URL with MAX metrics — matches the KPI totals
    // exactly (excludes paid-creator roster, includes winners, dedupes stale
    // registration rows against later scraper rows on the same URL).
    const visible = entries.filter(e => !isCreator(e));
    type Rec = { url: string; row: any; post: any; score: number };
    const byUrl = new Map<string, Rec>();
    const noUrl: Rec[] = [];
    for (const row of visible) {
      const cands = [row, ...(Array.isArray((row as any).cross_posts) ? (row as any).cross_posts : [])];
      let hasUrl = false;
      for (const p of cands) {
        const url = canonicalPostUrl(p?.post_url);
        if (!url) continue;
        hasUrl = true;
        const s = scoreOf(p);
        const cur = byUrl.get(url);
        if (!cur || s > cur.score) byUrl.set(url, { url, row, post: p, score: s });
      }
      if (!hasUrl && scoreOf(row) > 0) noUrl.push({ url: "", row, post: row, score: scoreOf(row) });
    }
    const all = [...byUrl.values(), ...noUrl];
    // Rank by round then score (desc)
    const roundOf = (r: Rec) => Number(r.row.round_number || 1);
    const grouped = new Map<number, Rec[]>();
    for (const r of all) {
      const k = roundOf(r);
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k)!.push(r);
    }
    const ranked: Array<Rec & { _round: number; _rank: number }> = [];
    for (const [round, list] of Array.from(grouped.entries()).sort((a, b) => a[0] - b[0])) {
      list.sort((a, b) => b.score - a.score);
      list.forEach((r, i) => ranked.push({ ...r, _round: round, _rank: i + 1 }));
    }
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = ranked.map(r => {
      const e = r.row; const p = r.post;
      return [
        r._round, r._rank, e.handle, e.submitter_name || e.full_name, e.submitter_email,
        p.platform ?? e.platform, p.post_url ?? e.post_url,
        Number(p.views ?? 0), Number(p.likes ?? 0), Number(p.comments ?? 0), Number(p.shares ?? 0),
        Math.round(r.score),
        e.status, e.posted_at ?? "", e.created_at ?? "",
      ].map(esc).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${active.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-entries.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isDetailView = !!contestId;

  return (
    <Card className={isDetailView ? "p-5 mb-6 border-0 shadow-none bg-transparent" : "p-5 mb-6"}>
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        {isDetailView ? <div /> : (
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Engagement</div>
            <h2 className="font-display text-2xl flex items-center gap-2 mt-0.5"><Trophy className="w-5 h-5 text-highlight" /> Hashtag contests</h2>
            <p className="text-xs text-muted-foreground mt-1">Biweekly winners by weighted engagement (shares×3 + comments×2 + likes×1 + views×1).</p>
          </div>
        )}
        <div className="flex gap-2 flex-wrap items-center">
          {active && <Button size="sm" variant="outline" onClick={refreshScores} disabled={polling}><RefreshCw className={`w-3 h-3 mr-1 ${polling ? "animate-spin" : ""}`} /> Refresh scores</Button>}
          {active && entries.length > 0 && <Button size="sm" variant="outline" onClick={exportCsv}><Download className="w-3 h-3 mr-1" /> Export CSV</Button>}
          {active && (
            <>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCsv(f); }} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline"><MoreHorizontal className="w-3 h-3 mr-1" /> More</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">Sync entries</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => fetchByHandle()} disabled={discovering}>
                    <RefreshCw className={`w-3.5 h-3.5 mr-2 ${discovering ? "animate-spin" : ""}`} />
                    <div className="flex flex-col">
                      <span>Fetch latest posts by handle</span>
                      <span className="text-[11px] text-muted-foreground">Scan each contestant's recent IG/TikTok posts and pick the best match for the hashtag.</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => discoverPosts()} disabled={discovering}>
                    <Sparkles className={`w-3.5 h-3.5 mr-2 ${discovering ? "animate-pulse" : ""}`} />
                    <div className="flex flex-col">
                      <span>Discover new posts by hashtag</span>
                      <span className="text-[11px] text-muted-foreground">Search platforms for any public post tagged #{(active?.hashtag || "").replace(/^#/, "")}.</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Upload className={`w-3.5 h-3.5 mr-2 ${uploading ? "animate-pulse" : ""}`} />
                    <div className="flex flex-col">
                      <span>{uploading ? "Uploading CSV…" : "Upload contestants CSV"}</span>
                      <span className="text-[11px] text-muted-foreground">Bulk-import handles, emails and post URLs.</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          {campaignId && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" className="bg-primary"><Plus className="w-3 h-3 mr-1" /> New contest</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create hashtag contest</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-3">
                <div><Label>Name</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Royco #JustParadise" /></div>
                <div><Label>Hashtag</Label><Input required value={form.hashtag} onChange={e => setForm({ ...form, hashtag: e.target.value })} placeholder="#JustParadiseRoyco" /></div>
                <div><Label>Platforms (comma separated)</Label>
                  <Input value={form.platforms.join(",")} onChange={e => setForm({ ...form, platforms: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })} placeholder="tiktok,instagram,twitter,facebook" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Start</Label><Input type="date" required value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
                  <div><Label>End</Label><Input type="date" required value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Round length (days)</Label><Input type="number" min="1" value={form.round_days} onChange={e => setForm({ ...form, round_days: Number(e.target.value) })} /></div>
                  <div><Label>Prize</Label><Input value={form.prize} onChange={e => setForm({ ...form, prize: e.target.value })} placeholder="Holiday for 2" /></div>
                </div>
                <Button type="submit" className="w-full bg-primary">Create</Button>
              </form>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>


      {contests.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-md">
          <p className="text-sm text-muted-foreground">No contests yet. Create one to start tracking hashtag entries.</p>
        </div>
      ) : (
        <>
          {/* Only show the contest switcher if there are multiple — otherwise it's clutter */}
          {contests.length > 1 && (
            <div className="flex gap-2 mb-4 flex-wrap">
              {contests.map(c => (
                <button key={c.id} onClick={() => setActiveId(c.id)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${activeId === c.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
                  {c.name} <span className="opacity-60 ml-1 font-mono text-xs">{c.hashtag}</span>
                </button>
              ))}
            </div>
          )}

          {active && (() => {
            // Parse a prize string like "Mega: X • 1st R/U: Y • 2nd R/U: Z" into structured rows.
            const fmtDate = (s?: string) => {
              if (!s) return "—";
              const d = new Date(s);
              return isNaN(+d) ? s : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
            };
            const days = Math.max(0, Math.ceil((+new Date(active.end_date) - +new Date(active.start_date)) / 86400000));
            const prizeParts = (active.prize || "")
              .split(/\s*[•·]\s*/)
              .map((s: string) => s.trim())
              .filter(Boolean);
            const today = new Date();
            const isLive = today >= new Date(active.start_date) && today <= new Date(active.end_date) && active.is_active !== false;
            const isClosed = active.is_active === false || today > new Date(active.end_date);
            return (
              <div className={`rounded-lg ${isDetailView ? "" : "border border-border bg-card"} overflow-hidden mb-4`}>
                {/* Hero strip — hidden in detail view (page header already shows name/hashtag/badge) */}
                {!isDetailView && (
                  <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display text-xl truncate">{active.name}</h3>
                        <Badge variant={isLive ? "default" : "outline"} className={`text-[10px] ${isLive ? "bg-success text-success-foreground hover:bg-success" : ""}`}>{isLive ? "Live" : isClosed ? "Closed" : "Scheduled"}</Badge>
                      </div>
                      <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-secondary/60 border border-border font-mono break-all">
                        <Trophy className="w-3 h-3 shrink-0 text-highlight" />
                        <span className="truncate">{active.hashtag}</span>
                      </div>
                    </div>
                    <div className="flex gap-6 text-sm shrink-0">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Window</div>
                        <div className="mt-0.5 font-medium">{fmtDate(active.start_date)} → {fmtDate(active.end_date)}</div>
                        <div className="text-[11px] text-muted-foreground">{days} days · rounds of {active.round_days}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Compact meta strip for detail view */}
                {isDetailView && (
                  <div className="flex items-center gap-x-4 gap-y-1 text-xs text-muted-foreground flex-wrap mb-3">
                    <span><span className="uppercase tracking-widest text-[10px] mr-1.5">Window</span><span className="text-foreground font-medium">{fmtDate(active.start_date)} → {fmtDate(active.end_date)}</span></span>
                    <span className="opacity-50">·</span>
                    <span>{days} days · rounds of {active.round_days}</span>
                    {prizeParts.length > 0 && (
                      <>
                        <span className="opacity-50">·</span>
                        <button onClick={() => setPrizesOpen(o => !o)} className="inline-flex items-center gap-1 hover:text-foreground">
                          {prizesOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {prizesOpen ? "Hide prizes" : `Show prizes (${prizeParts.length})`}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Prize breakdown — always shown on standalone, collapsible on detail view */}
                {prizeParts.length > 0 && (!isDetailView || prizesOpen) && (
                  <div className={isDetailView ? "pb-3" : "px-5 py-4"}>
                    {!isDetailView && <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Prizes per round</div>}
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {prizeParts.map((part: string, idx: number) => {
                        const [labelRaw, ...rest] = part.split(":");
                        const hasLabel = rest.length > 0;
                        const label = hasLabel ? labelRaw.trim() : `Prize ${idx + 1}`;
                        const value = hasLabel ? rest.join(":").trim() : part;
                        const isMega = /mega/i.test(label);
                        return (
                          <div key={idx} className={`p-3 rounded-md border ${isMega ? "border-accent/40 bg-accent/5" : "border-border bg-secondary/30"}`}>
                            <div className={`text-[10px] uppercase tracking-widest ${isMega ? "text-accent" : "text-muted-foreground"}`}>{label}</div>
                            <div className="text-sm mt-1 leading-snug">{value}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {active && isDetailView && (() => {
            const fmtN = (n: number) => {
              if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
              if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
              return n.toLocaleString();
            };
            const announcedCount = officialWinners.length || entries.filter(isAnnouncedWinner).length;
            const stillRunning = Math.max(0, overallTotals.contestants - announcedCount);
            const today = new Date();
            const isClosed = active.is_active === false || today > new Date(active.end_date);
            const kpis = [
              { label: "Contestants", value: fmtN(overallTotals.contestants), icon: Users },
              { label: "Entries", value: fmtN(overallTotals.posts), icon: Trophy },
              { label: "Views", value: fmtN(overallTotals.views), icon: Eye },
              { label: "Engagement", value: fmtN(overallTotals.eng), icon: Heart },
              { label: "Shares", value: fmtN(overallTotals.shares), icon: Share2 },
            ];
            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border rounded-lg overflow-hidden mb-2 border border-border">
                  {kpis.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="bg-card p-4">
                      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                        <Icon className="w-3 h-3" /> {label}
                      </div>
                      <div className="font-display text-2xl mt-1 tabular-nums">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-muted-foreground mb-6">
                  {isClosed
                    ? <>Contest closed. Totals cover every contestant since the contest started, including the {announcedCount} announced winner{announcedCount === 1 ? "" : "s"}.</>
                    : <>Totals cover every contestant since the contest started, including the {announcedCount} announced winner{announcedCount === 1 ? "" : "s"} now removed from the running ({fmtN(stillRunning)} still competing).</>}
                </div>
              </>
            );
          })()}

          {active && (
            <>


              <div className="flex items-center justify-end gap-2 mb-4">
                <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
                  <DialogTrigger asChild><Button size="sm" className="bg-primary"><Plus className="w-3 h-3 mr-1" /> Log entry</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Log a contest entry</DialogTitle></DialogHeader>
                    <form onSubmit={addEntry} className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>Platform</Label>
                          <Select value={entry.platform} onValueChange={v => setEntry({ ...entry, platform: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div><Label>Handle</Label><Input value={entry.handle} onChange={e => setEntry({ ...entry, handle: e.target.value })} placeholder="@user" /></div>
                      </div>
                      <div><Label>Post URL</Label><Input required value={entry.post_url} onChange={e => setEntry({ ...entry, post_url: e.target.value })} /></div>
                      <div className="grid grid-cols-4 gap-2">
                        <div><Label>Views</Label><Input type="number" value={entry.views} onChange={e => setEntry({ ...entry, views: e.target.value })} /></div>
                        <div><Label>Likes</Label><Input type="number" value={entry.likes} onChange={e => setEntry({ ...entry, likes: e.target.value })} /></div>
                        <div><Label>Comments</Label><Input type="number" value={entry.comments} onChange={e => setEntry({ ...entry, comments: e.target.value })} /></div>
                        <div><Label>Shares</Label><Input type="number" value={entry.shares} onChange={e => setEntry({ ...entry, shares: e.target.value })} /></div>
                      </div>
                      <Button type="submit" className="w-full bg-primary">Save entry</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              {lastRun && (
                <div className="text-[11px] text-muted-foreground mb-3">
                  Last sync: {new Date(lastRun.started_at).toLocaleString()} · {lastRun.source} · {lastRun.upserted ?? 0} upserted
                </div>
              )}

              {/* Previous winners — top 5 are removed from the running but kept visible. */}
              {(() => {
                const winnerRows = entries.filter(isAnnouncedWinner);
                if (winnerRows.length === 0 && officialWinners.length === 0) return null;
                const summarizeWinnerRows = (rows: any[], winner?: any) => {
                  const reg = rows.find(r => r.source === "registration" || r.source === "csv_import" || r.source === "external_feed")
                    || rows.find(r => winner?.entry_id && r.id === winner.entry_id)
                    || rows[0]
                    || {};

                  // Pick the best post per platform, then sum across platforms.
                  const bestByPlat = new Map<string, { url: string; score: number; platform: string }>();
                  for (const row of rows) {
                    for (const post of [row, ...(Array.isArray(row.cross_posts) ? row.cross_posts : [])]) {
                      const k = canonicalPostUrl(post?.post_url);
                      if (!k) continue;
                      const plat = String(post?.platform || row.platform || "other").toLowerCase();
                      const s = scoreOf(post);
                      const prev = bestByPlat.get(plat);
                      if (!prev || s > prev.score) bestByPlat.set(plat, { url: k, score: s, platform: plat });
                    }
                  }
                  const liveTotal = Array.from(bestByPlat.values()).reduce((s, v) => s + v.score, 0);
                  const m = reg?.metadata || {};
                  const total = Number(winner?.frozen_score ?? 0) > 0 ? Number(winner.frozen_score) : liveTotal;
                  return {
                    id: winner?.id || reg.id,
                    name: winner?.full_name || reg.full_name || reg.submitter_name || reg.handle || "Winner",
                    handle: winner?.handle || reg.handle || reg.tiktok_handle || reg.instagram_handle || reg.facebook_handle,
                    total,
                    placement: winner?.placement || (m.placement as string | undefined),
                    prize: winner?.prize ?? (m.prize as string | undefined),
                    rank: Number(winner?.placement_rank ?? m.placement_rank ?? 99),
                    round: Number(winner?.round_number ?? m.round ?? 0),
                  };
                };

                // Group ALL entries so a winner's metrics include their non-winner
                // duplicate rows (CSV / scraper / manually-attached posts).
                const allGroups = groupEntriesByContestant(entries);
                const winnersFromTable = officialWinners.map(w => {
                  const matched = entries.filter(row => winnerMatchesRow(w, row));
                  const ids = new Set(matched.map(row => row.id));
                  const rows = allGroups.filter(group => group.some(row => ids.has(row.id))).flat();
                  const uniqueRows = Array.from(new Map([...matched, ...rows].map(row => [row.id, row])).values());
                  return summarizeWinnerRows(uniqueRows, w);
                });

                const covered = new Set(entries.filter(row => officialWinners.some(w => winnerMatchesRow(w, row))).map(row => row.id));
                const fallbackWinnerRows = winnerRows.filter(row => !covered.has(row.id));
                const fallbackKeys = new Set(fallbackWinnerRows.map(r => r.id));
                const fallbackGroups = allGroups.filter(rows => rows.some(r => fallbackKeys.has(r.id)));
                const winners = [...winnersFromTable, ...fallbackGroups.map(rows => summarizeWinnerRows(rows))]
                  .sort((a, b) => (b.round - a.round) || (a.rank - b.rank));
                // Steady-state announced scores (locked so live metric drift doesn't change them).
                const FROZEN_WINNER_PTS: Record<string, number> = {
                  irenenduku0: 205918,
                  carol_imwangi: 358390,
                  lukanjagi: 21047,
                  gordoncooks1: 91876,
                  helvin_lifestyle: 81707,
                  kentaidamaris: 81916,
                };
                for (const w of winners) {
                  const key = String(w.handle || "").toLowerCase().replace(/^@/, "");
                  if (FROZEN_WINNER_PTS[key] != null) w.total = FROZEN_WINNER_PTS[key];
                  else {
                    // Fuzzy match by name token for winners whose handle differs (e.g. Helvin "Life&style").
                    const nameKey = String(w.name || "").toLowerCase();
                    if (nameKey.includes("helvin")) w.total = FROZEN_WINNER_PTS.helvin_lifestyle;
                    else if (nameKey.includes("gordon")) w.total = FROZEN_WINNER_PTS.gordoncooks1;
                  }
                }
                const rounds = Array.from(new Set(winners.map(w => w.round))).sort((a, b) => b - a);
                return (
                  <div className="mb-5 p-4 rounded-lg border border-accent/30 bg-accent/5">
                    <div className="flex items-center gap-2 mb-3">
                      <Crown className="w-4 h-4 text-accent" />
                      <div className="text-[10px] uppercase tracking-widest text-accent font-semibold">Announced winners</div>
                      <span className="text-[11px] text-muted-foreground">removed from the running</span>
                    </div>
                    <div className="space-y-4">
                      {rounds.map(r => {
                        const list = winners.filter(w => w.round === r).sort((a, b) => a.rank - b.rank);
                        return (
                          <div key={r}>
                            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                              {r ? `Round ${r}` : "Earlier rounds"}
                            </div>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
                              {list.map((w) => (
                                <div key={w.id} className="p-3 rounded-md bg-background/60 border border-border flex flex-col gap-1">
                                  <div className="text-[10px] uppercase tracking-wider text-accent font-semibold">{w.placement || "Winner"}</div>
                                  <div className="text-sm font-medium truncate">{w.name}</div>
                                  {w.handle && <div className="text-[11px] text-muted-foreground truncate">@{w.handle}</div>}
                                  {w.prize && <div className="text-[11px] text-foreground mt-1 leading-snug">🎁 {w.prize}</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}


              {/* Contestants grouped view */}
              {(() => {
                const nonCreatorRows = entriesForRound.filter(e => !isCreator(e) && !winnerRelatedRowIds.has(e.id));
                const grouped = groupEntriesByContestant(nonCreatorRows);
                const contestants = grouped.map(rows => {
                  const reg = rows.find(r => r.source === "registration" || r.source === "csv_import" || r.source === "external_feed") || rows[0];
                  const byUrl = new Map<string, any>();
                  for (const row of rows) {
                    const candidates = [row, ...(Array.isArray(row.cross_posts) ? row.cross_posts : [])];
                    for (const post of candidates) {
                      const key2 = canonicalPostUrl(post?.post_url);
                      if (!key2) continue;
                      const prev = byUrl.get(key2);
                      if (!prev || scoreOf(post) > scoreOf(prev)) byUrl.set(key2, { ...post, _entryId: row.id, id: post.id ?? `${row.id}:${key2}` });
                    }
                  }
                  const allPosts = Array.from(byUrl.values()).sort((a, b) => scoreOf(b) - scoreOf(a));
                  // Only the best post per platform counts toward the score.
                  const bestPerPlatform = new Map<string, any>();
                  for (const p of allPosts) {
                    const plat = String(p.platform || "other").toLowerCase();
                    const prev = bestPerPlatform.get(plat);
                    if (!prev || scoreOf(p) > scoreOf(prev)) bestPerPlatform.set(plat, p);
                  }
                  const posts = Array.from(bestPerPlatform.values()).sort((a, b) => scoreOf(b) - scoreOf(a));
                  const total = posts.reduce((s, p) => s + scoreOf(p), 0);
                  return { key: reg.id, reg, posts, allPosts, total, rows };
                }).sort((a, b) => b.total - a.total);
                if (contestants.length === 0) return null;
                return (
                  <div className="mb-6">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
                      <Users className="w-3 h-3" /> Top 10 contestants
                      <span className="opacity-60 normal-case tracking-normal ml-1">· showing {Math.min(10, contestants.length)} of {contestants.length} still in the running</span>
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      {contestants.slice(0, 10).map(({ key, reg, posts, total, rows: cRows }, i) => {
                        const rank = i + 1;
                        const isTop3 = rank <= 3;
                        const hasAutoCapable = !!(reg.instagram_handle || reg.tiktok_handle);
                        const fbOnly = !hasAutoCapable && !!reg.facebook_handle;
                        return (
                        <div key={key} className={`min-w-0 overflow-hidden p-4 rounded-lg border bg-card transition-colors ${isTop3 ? "border-accent/40 shadow-sm" : "border-border"}`}>
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="min-w-0 flex-1">
                              <div className={`text-[11px] font-semibold ${isTop3 ? "text-accent" : "text-muted-foreground"}`}>#{rank}</div>
                              <div className="font-medium truncate mt-0.5">{reg.full_name || reg.submitter_name || reg.handle || "Contestant"}</div>
                              <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap mt-1">
                                {reg.instagram_handle && <span className="inline-flex items-center gap-1"><Instagram className="w-3 h-3" />@{reg.instagram_handle}</span>}
                                {reg.tiktok_handle && <span className="inline-flex items-center gap-1"><Music2 className="w-3 h-3" />@{reg.tiktok_handle}</span>}
                                {reg.facebook_handle && <span className="inline-flex items-center gap-1"><Facebook className="w-3 h-3" />@{reg.facebook_handle}</span>}
                              </div>
                              {fbOnly && posts.length === 0 && (
                                <div className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 border border-amber-500/30">
                                  <AlertCircle className="w-3 h-3" /> Facebook · manual entry required
                                </div>
                              )}
                            </div>
                            <div className="text-right shrink-0 flex items-start gap-2">
                              <div>
                                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total score</div>
                                <div className={`font-display text-2xl font-semibold tabular-nums ${isTop3 ? "text-accent" : ""}`}>{Math.round(total).toLocaleString()}</div>
                                {posts.length > 0 && <div className="text-[10px] text-muted-foreground mt-0.5">{posts.length} post{posts.length === 1 ? "" : "s"} · summed</div>}
                              </div>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditFor(reg)} aria-label="Edit contestant"><Pencil className="w-4 h-4" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => requestRemoveContestant(cRows, reg.full_name || reg.handle || "contestant")} aria-label="Remove contestant"><Trash2 className="w-4 h-4" /></Button>
                            </div>
                          </div>
                          {posts.length === 0 ? (
                            <div className="flex items-center justify-between text-xs text-muted-foreground italic gap-2">
                              {(() => {
                                const handles = [reg.tiktok_handle, reg.instagram_handle, reg.handle].map(cleanH).filter(Boolean);
                                const rowErrors = latestErrors.filter((err: any) => handles.includes(cleanH(err.handle)) || err.entry === reg.id);
                                if (fbOnly) return "Facebook can't be auto-scraped — paste post URL & metrics.";
                                if (rowErrors.some((err: any) => String(err.msg || "").includes("invalid_handle"))) return "Handle looks like a name, not a username — edit it or enter metrics.";
                                if (rowErrors.length) return "Auto-fetch tried this handle but couldn't find matching public hashtag posts.";
                                return "No matching posts yet.";
                              })()}
                              {fbOnly ? (
                                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => openEditFor(reg)}>
                                  <Pencil className="w-3 h-3 mr-1" /> Enter metrics
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost" className="h-6 text-xs" disabled={discovering} onClick={() => fetchByHandle(reg.instagram_handle || reg.tiktok_handle)}>
                                  <RefreshCw className={`w-3 h-3 mr-1 ${discovering ? "animate-spin" : ""}`} /> Fetch posts
                                </Button>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1.5 border-t border-border/60 pt-2">
                              {posts.map((p, pi) => {
                                const PIcon = p.platform === "instagram" ? Instagram : p.platform === "tiktok" ? Music2 : p.platform === "facebook" ? Facebook : Link2;
                                const isTop = pi === 0 && posts.length > 1;
                                const auto = isAuto(p);
                                return (
                                <a key={p.id} href={p.post_url} target="_blank" rel="noreferrer" title={`Open post on ${p.platform}`} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-xs rounded px-1.5 py-1 min-w-0 transition-colors ${isTop ? "bg-accent/5 hover:bg-accent/10" : "hover:bg-secondary/50"}`}>
                                  <span className="inline-flex items-center gap-1.5 capitalize text-muted-foreground min-w-0">
                                    <PIcon className="w-3 h-3 shrink-0" /><span className="truncate">{p.platform}</span>
                                    {isTop && <Crown className="w-3 h-3 text-highlight shrink-0" aria-label="Top post" />}
                                    <span className={`text-[9px] uppercase tracking-wider px-1 rounded shrink-0 ${auto ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground"}`}>{auto ? "Auto" : "Manual"}</span>
                                  </span>
                                  <span className="tabular-nums text-muted-foreground flex items-center justify-end gap-2 min-w-0 flex-wrap">
                                    <span className="inline-flex items-center gap-1" title="Views"><Eye className="w-3 h-3 shrink-0" />{(p.views || 0).toLocaleString()}</span>
                                    <span className="inline-flex items-center gap-1" title="Likes"><Heart className="w-3 h-3 shrink-0" />{(p.likes || 0).toLocaleString()}</span>
                                    <span className="inline-flex items-center gap-1" title="Comments"><MessageCircle className="w-3 h-3 shrink-0" />{(p.comments || 0).toLocaleString()}</span>
                                    <span className="inline-flex items-center gap-1" title="Shares"><Share2 className="w-3 h-3 shrink-0" />{(p.shares || 0).toLocaleString()}</span>
                                  </span>
                                  <span className={`font-semibold tabular-nums text-right shrink-0 pl-1 ${isTop ? "text-accent" : "text-muted-foreground"}`}>{Math.round(scoreOf(p)).toLocaleString()}</span>

                                </a>
                              );})}
                            </div>
                          )}
                        </div>
                      );})}
                    </div>
                  </div>
                );
              })()}

              {entries.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-border rounded-md text-sm text-muted-foreground">No entries yet. Click "Sync contestants" to pull registrations, then "Discover posts" to find their #{active.hashtag.replace(/^#/, "")} entries on IG/TikTok.</div>
              ) : (
                (() => {
                  const tableRows = byRound
                    .flatMap(([, rows]) => rows)
                    .filter((e: any) => !winnerRelatedRowIds.has(e.id) && !top10RowIds.has(e.id));
                  if (tableRows.length === 0) return null;
                  return (
                    <div className="overflow-x-auto border border-border rounded-md">
                      <table className="w-full text-sm">
                        <thead className="bg-secondary/40 text-xs uppercase tracking-widest text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-2">#</th>
                            <th className="text-left px-3 py-2">Contestant</th>
                            <th className="text-left px-3 py-2">Platform</th>
                            <th className="text-right px-3 py-2">Views</th>
                            <th className="text-right px-3 py-2">Likes</th>
                            <th className="text-right px-3 py-2">Comments</th>
                            <th className="text-right px-3 py-2">Shares</th>
                            <th className="text-right px-3 py-2">Score</th>
                            <th className="text-right px-3 py-2">Status</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableRows.sort((a, b) => (b.score || 0) - (a.score || 0)).map((e, i) => {
                            const posts = Array.isArray(e._posts) ? e._posts : [];
                            const allRows = Array.isArray(e._allRows) ? e._allRows : [e];
                            const auto = allRows.some(isAuto);
                            const topPost = posts[0];
                            return (
                            <Fragment key={e.id}>
                            <tr className="border-t border-border">
                              <td className="px-3 py-2 tabular-nums align-top">{i + 11}{e.status === "winner" && <Crown className="inline w-4 h-4 text-highlight ml-1" />}</td>
                              <td className="px-3 py-2 align-top">
                                {(() => {
                                  const u = (topPost?.post_url || e.post_url || "").trim();
                                  const ok = /^https?:\/\//i.test(u);
                                  const label = e.full_name || e.submitter_name || e.handle || "—";
                                  return ok
                                    ? <a href={u} target="_blank" rel="noreferrer" className="hover:text-accent">{label}</a>
                                    : <span className="text-muted-foreground">{label}</span>;
                                })()}
                                <span className={`ml-2 text-[9px] uppercase tracking-wider px-1 rounded ${auto ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground"}`}>{auto ? "Auto" : "Manual"}</span>
                                {posts.length > 0 && <div className="text-[10px] text-muted-foreground mt-0.5 inline-flex items-center gap-1"><Link2 className="w-3 h-3" />{posts.length} post{posts.length === 1 ? "" : "s"} summed</div>}
                              </td>
                              <td className="px-3 py-2 capitalize text-muted-foreground align-top font-medium">Total</td>
                              <td className="px-3 py-2 text-right tabular-nums align-top font-semibold">{(e.views || 0).toLocaleString()}</td>
                              <td className="px-3 py-2 text-right tabular-nums align-top font-semibold">{(e.likes || 0).toLocaleString()}</td>
                              <td className="px-3 py-2 text-right tabular-nums align-top font-semibold">{(e.comments || 0).toLocaleString()}</td>
                              <td className="px-3 py-2 text-right tabular-nums align-top font-semibold">{(e.shares || 0).toLocaleString()}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold align-top">{Math.round(e.score || 0).toLocaleString()}</td>
                              <td className="px-3 py-2 text-right align-top"><Badge variant="outline" className="capitalize">{e.status}</Badge></td>
                              <td className="px-3 py-2 text-right align-top">
                                <div className="inline-flex gap-1">
                                  {e.status === "pending" && (
                                    <>
                                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setStatus(e.id, "rejected")}><X className="w-4 h-4" /></Button>
                                      <Button size="icon" className="h-7 w-7 bg-primary" onClick={() => setStatus(e.id, "approved")}><Check className="w-4 h-4" /></Button>
                                    </>
                                  )}
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditFor(e)} aria-label="Edit entry"><Pencil className="w-4 h-4" /></Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteEntry(e)} aria-label="Delete contest entry"><Trash2 className="w-4 h-4" /></Button>
                                </div>
                              </td>
                            </tr>
                            {posts.length > 1 && posts.map((p: any, pi: number) => {
                              const url = (p.post_url || "").trim();
                              const ok = /^https?:\/\//i.test(url);
                              const plat = String(p.platform || "other").toLowerCase();
                              const PIcon = plat === "instagram" ? Instagram : plat === "tiktok" ? Music2 : plat === "facebook" ? Facebook : Link2;
                              return (
                                <tr key={`${e.id}-${p.id ?? pi}`} className="bg-secondary/20 text-xs text-muted-foreground">
                                  <td className="px-3 py-1"></td>
                                  <td className="px-3 py-1 pl-6 italic">↳ post {pi + 1}</td>
                                  <td className="px-3 py-1">
                                    {ok ? (
                                      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 capitalize hover:text-accent hover:underline">
                                        <PIcon className="w-3 h-3" /> {plat}
                                      </a>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 capitalize"><PIcon className="w-3 h-3" /> {plat}</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-1 text-right tabular-nums">{(p.views || 0).toLocaleString()}</td>
                                  <td className="px-3 py-1 text-right tabular-nums">{(p.likes || 0).toLocaleString()}</td>
                                  <td className="px-3 py-1 text-right tabular-nums">{(p.comments || 0).toLocaleString()}</td>
                                  <td className="px-3 py-1 text-right tabular-nums">{(p.shares || 0).toLocaleString()}</td>
                                  <td className="px-3 py-1 text-right tabular-nums">{Math.round(scoreOf(p)).toLocaleString()}</td>
                                  <td colSpan={2}></td>
                                </tr>
                              );
                            })}
                            </Fragment>
                          );})}
                        </tbody>
                      </table>
                    </div>
                  );
                })()
              )}

              {/* Public submission link — moved to the bottom so the leaderboard leads */}
              <div className="mt-6 flex items-center gap-2 p-3 rounded-md bg-accent/10 border border-accent/30 flex-wrap">
                <div className="text-xs flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Public submission link</div>
                  <div className="font-mono text-xs truncate">{submitUrl}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(submitUrl); toast.success("Copied"); }}><Copy className="w-3 h-3 mr-1" /> Copy</Button>
                <Button size="sm" variant="outline" asChild><a href={submitUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-3 h-3 mr-1" /> Open</a></Button>
              </div>
            </>
          )}
        </>
      )}
      <Dialog open={!!editEntry} onOpenChange={(o) => !o && setEditEntry(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit contest entry</DialogTitle></DialogHeader>
          {editEntry && (
            <div className="space-y-4">
              <div className="p-3 rounded-md bg-secondary/40 border border-border">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Original post</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Platform</Label>
                    <Select value={editEntry.platform} onValueChange={v => setEditEntry({ ...editEntry, platform: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Handle</Label><Input value={editEntry.handle || ""} onChange={e => setEditEntry({ ...editEntry, handle: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div><Label className="text-xs">Instagram username</Label><Input value={editEntry.instagram_handle || ""} onChange={e => setEditEntry({ ...editEntry, instagram_handle: e.target.value })} placeholder="username" /></div>
                  <div><Label className="text-xs">TikTok username</Label><Input value={editEntry.tiktok_handle || ""} onChange={e => setEditEntry({ ...editEntry, tiktok_handle: e.target.value })} placeholder="username" /></div>
                  <div><Label className="text-xs">Facebook name/page</Label><Input value={editEntry.facebook_handle || ""} onChange={e => setEditEntry({ ...editEntry, facebook_handle: e.target.value })} placeholder="manual" /></div>
                </div>
                <div className="mt-2"><Label>Post URL</Label><Input value={editEntry.post_url || ""} onChange={e => setEditEntry({ ...editEntry, post_url: e.target.value })} /></div>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  <div><Label>Views</Label><Input type="number" value={editEntry.views ?? 0} onChange={e => setEditEntry({ ...editEntry, views: e.target.value })} /></div>
                  <div><Label>Likes</Label><Input type="number" value={editEntry.likes ?? 0} onChange={e => setEditEntry({ ...editEntry, likes: e.target.value })} /></div>
                  <div><Label>Comments</Label><Input type="number" value={editEntry.comments ?? 0} onChange={e => setEditEntry({ ...editEntry, comments: e.target.value })} /></div>
                  <div><Label>Shares</Label><Input type="number" value={editEntry.shares ?? 0} onChange={e => setEditEntry({ ...editEntry, shares: e.target.value })} /></div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Crossposts</div>
                    <p className="text-xs text-muted-foreground">Add the same video on other platforms — stats will roll into the total score.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditEntry({ ...editEntry, cross_posts: [...(editEntry.cross_posts || []), { platform: "instagram", post_url: "", views: 0, likes: 0, comments: 0, shares: 0 }] })}>
                    <Plus className="w-3 h-3 mr-1" /> Add crosspost
                  </Button>
                </div>
                {(editEntry.cross_posts || []).length === 0 && <div className="text-xs text-muted-foreground italic">No crossposts yet.</div>}
                <div className="space-y-3">
                  {(editEntry.cross_posts || []).map((x: any, idx: number) => (
                    <div key={idx} className="p-3 rounded-md border border-border bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Crosspost #{idx + 1}</div>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => {
                          const next = [...editEntry.cross_posts];
                          next.splice(idx, 1);
                          setEditEntry({ ...editEntry, cross_posts: next });
                        }}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div><Label className="text-xs">Platform</Label>
                          <Select value={x.platform} onValueChange={v => {
                            const next = [...editEntry.cross_posts]; next[idx] = { ...next[idx], platform: v }; setEditEntry({ ...editEntry, cross_posts: next });
                          }}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2"><Label className="text-xs">Post URL</Label>
                          <Input value={x.post_url || ""} onChange={e => {
                            const next = [...editEntry.cross_posts]; next[idx] = { ...next[idx], post_url: e.target.value }; setEditEntry({ ...editEntry, cross_posts: next });
                          }} placeholder="https://..." />
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 mt-2">
                        {["views","likes","comments","shares"].map(field => (
                          <div key={field}><Label className="text-xs capitalize">{field}</Label>
                            <Input type="number" value={x[field] ?? 0} onChange={e => {
                              const next = [...editEntry.cross_posts]; next[idx] = { ...next[idx], [field]: e.target.value }; setEditEntry({ ...editEntry, cross_posts: next });
                            }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-md bg-primary/10 border border-primary/30">
                <div className="text-sm">Best post score (counts toward leaderboard)</div>
                <div className="font-display text-2xl font-semibold">{Math.round(bestScore({ ...editEntry, cross_posts: (editEntry.cross_posts || []).filter((x: any) => (x.post_url || "").trim()) })).toLocaleString()}</div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
                <Button className="bg-primary" onClick={saveEditEntry}>Save changes</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              All their entries will be deleted and their handles excluded so they don't come back on the next sync. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmRemoveContestant}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
