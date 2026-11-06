import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "sonner";
import { useGeo } from "@/lib/geo";
import { AccountsEditor } from "./AccountsEditor";
import { accountsOf, accountsToColumns, matchRoster, mergeAccounts, type CreatorAccount } from "@/lib/creatorAccounts";

/* eslint-disable @typescript-eslint/no-explicit-any -- the influencers row is read and written loosely across this app, and account_stats isn't in the generated types yet. */

type Conflict = { kind: "handle" | "name"; row: any };

/**
 * The one form that adds or edits a creator, wherever that happens: the Creators page, the campaign's add dialog and
 * the campaign's "edit creator". A creator can hold any number of platforms. When someone already on the roster is
 * added again it stops and asks, because two rows for one person get paid twice.
 */
export function CreatorForm({ row, agencyId, roster, onSaved, onCancel, submitLabel }: {
  /** The creator being edited. Leave out to add a new one. */
  row?: any;
  /** Which agency's roster to look in, and to file a new creator under. Staff with one agency can leave it out. */
  agencyId?: string | null;
  roster: any[];
  onSaved: (saved: any) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const { countries, citiesOf } = useGeo();
  const initialAccounts = useMemo(() => (row ? accountsOf(row) : []), [row]);
  const [accounts, setAccounts] = useState<CreatorAccount[]>(initialAccounts);
  const [problems, setProblems] = useState(0);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [form, setForm] = useState({
    full_name: row?.full_name ?? "",
    niche: row?.niche ?? "",
    engagement: row?.engagement_rate ? String(row.engagement_rate) : "",
    region: row?.region ?? "",
    country_code: row?.country_code ?? "",
    city: row?.city ?? "",
    email: row?.email ?? "",
    phone_mpesa: row?.phone_mpesa ?? "",
  });

  const payload = () => {
    const email = form.email.trim().toLowerCase();
    return {
      full_name: form.full_name.trim(),
      ...accountsToColumns(accounts),
      // A row with no handle yet keeps its numbers: there's no account to carry them, but they are still its numbers.
      ...(accounts.length === 0 && row ? { primary_platform: row.primary_platform, follower_count: row.follower_count ?? 0 } : {}),
      engagement_rate: Number(form.engagement) || 0,
      niche: form.niche.trim() || null,
      region: form.region.trim() || null,
      country_code: form.country_code || null,
      city: form.city || null,
      // A person chose this country in the form, so it counts as confirmed.
      country_source: form.country_code ? "verified" : null,
      email: email || null,
      phone_mpesa: form.phone_mpesa.trim() || null,
    };
  };

  const write = async (id: string | null, values: Record<string, unknown>) => {
    setSaving(true);
    const table = supabase.from("influencers") as any;
    const { data, error } = id
      ? await table.update(values).eq("id", id).select().single()
      : await table.insert(agencyId ? { ...values, agency_id: agencyId } : values).select().single();
    setSaving(false);
    if (error) return toast.error(error.message);
    if (!values.email) toast.message("Saved without an email: briefs, contracts and invites can't reach them until you add one.");
    else toast.success("Creator saved");
    onSaved(data);
  };

  const save = (force = false) => {
    if (!form.full_name.trim()) return toast.error("Add their name.");
    if (problems > 0) return toast.error("One of the links can't be read. Fix it, or remove that row.");
    if (!force) {
      const others = roster.filter((r) => r.id !== row?.id);
      const match = matchRoster(accounts, form.full_name, others, agencyId);
      if (match.exact) return setConflict({ kind: "handle", row: match.exact });
      if (match.sameName.length && !row) return setConflict({ kind: "name", row: match.sameName[0] });
    }
    return write(row?.id ?? null, payload());
  };

  /** Adds what was typed to the creator already on the roster, and leaves their own details as they are. */
  const addToExisting = (existing: any) => {
    const { accounts: merged } = mergeAccounts(accountsOf(existing), accounts);
    const email = form.email.trim().toLowerCase();
    return write(existing.id, {
      ...accountsToColumns(merged),
      engagement_rate: existing.engagement_rate ?? 0,
      email: existing.email || email || null,
      phone_mpesa: existing.phone_mpesa || form.phone_mpesa.trim() || null,
    });
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => { e.preventDefault(); void save(); }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="creator-name">Full name</Label>
          <Input id="creator-name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="creator-niche">Niche</Label>
          <Input id="creator-niche" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="Food / Beauty / Comedy" />
        </div>
      </div>

      <div>
        <Label>Platforms</Label>
        <p className="mb-1.5 text-[11px] text-muted-foreground">Add every platform they're on. Paste a profile link and we fill in the rest. The star marks their main account.</p>
        <AccountsEditor initial={initialAccounts} onChange={(next, bad) => { setAccounts(next); setProblems(bad); setConflict(null); }} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="creator-email">Email</Label>
          <Input id="creator-email" type="text" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="creator@email.com" />
        </div>
        <div>
          <Label htmlFor="creator-phone">Phone (WhatsApp)</Label>
          <Input id="creator-phone" value={form.phone_mpesa} onChange={(e) => setForm({ ...form, phone_mpesa: e.target.value })} placeholder="2547..." />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Briefs, contracts, kick-off invites and approval notices are all sent by email, so a creator without one can't be contacted from the platform.</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Country</Label>
          <Combobox className="mt-1 w-full md:w-full" allValue="" value={form.country_code}
            onChange={(v) => setForm({ ...form, country_code: v, city: "" })}
            placeholder="Not specified"
            items={countries.map((c) => ({ id: c.code, label: c.name }))} />
        </div>
        <div>
          <Label>City</Label>
          <Combobox className="mt-1 w-full md:w-full" allValue="" value={form.city}
            onChange={(v) => setForm({ ...form, city: v })}
            placeholder="Not specified"
            items={citiesOf(form.country_code).map((c) => ({ id: c, label: c }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="creator-engagement">Engagement % (main account)</Label>
          <Input id="creator-engagement" type="number" step="0.1" value={form.engagement} onChange={(e) => setForm({ ...form, engagement: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="creator-region">Region (notes)</Label>
          <Input id="creator-region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
        </div>
      </div>

      {conflict && (
        <div role="alert" className="space-y-2 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm">
          <p>
            {conflict.kind === "handle"
              ? `One of these handles is already on your roster as ${conflict.row.full_name}.`
              : `You already have a ${conflict.row.full_name} on your roster. Is this the same person?`}
          </p>
          <div className="flex flex-wrap gap-2">
            {!row && (
              <Button type="button" size="sm" disabled={saving} onClick={() => void addToExisting(conflict.row)}>
                Add to {conflict.row.full_name}
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void save(true)}>
              {row ? "Save anyway" : "Create new"}
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        {onCancel && <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>Back</Button>}
        <Button type="submit" className="flex-1 bg-primary" disabled={saving}>
          {saving ? "Saving…" : submitLabel ?? (row ? "Save changes" : "Save")}
        </Button>
      </div>
    </form>
  );
}
