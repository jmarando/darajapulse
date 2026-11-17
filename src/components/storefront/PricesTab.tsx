import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { WAYS, wayOf } from "@/lib/storefront";
import { editFrom, rowPatch, type PriceEdit } from "@/lib/storefrontPrices";

type Row = {
  id: string; title: string; kind: string; platform: string | null; is_active?: boolean; bookable?: boolean | null;
  price_model?: string | null; base_rate_kes?: number | null; price_unit?: string | null; min_spend_kes?: number | null;
  options?: { label: string; price_kes?: number | null; unit?: string | null }[] | null;
};

/** Every listing's price, choices and "Book online", grouped by way to buy, saved row by row. */
export default function PricesTab({ items, onSaved }: { items: Row[]; onSaved: () => void }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const active = items.filter((i) => i.is_active !== false && (!term || i.title.toLowerCase().includes(term)));
    return WAYS.map((w) => ({ ...w, rows: active.filter((i) => wayOf({ kind: i.kind, platform: i.platform }) === w.key) })).filter((g) => g.rows.length);
  }, [items, q]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input className="max-w-sm" placeholder="Find a listing" aria-label="Find a listing" value={q} onChange={(e) => setQ(e.target.value)} />
        <p className="text-sm text-muted-foreground">Prices exclude VAT. Sold per 1,000 views: the buyer sets a budget, at least the minimum.</p>
      </div>
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`prices-${g.key}`}>
          <h2 id={`prices-${g.key}`} className="mb-2 text-lg font-semibold">{g.title}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {g.rows.map((r) => <PriceRow key={r.id} row={r} onSaved={onSaved} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

function PriceRow({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const [edit, setEdit] = useState<PriceEdit>(() => editFrom(row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = JSON.stringify(edit) !== JSON.stringify(editFrom(row));
  const set = (patch: Partial<PriceEdit>) => { setEdit({ ...edit, ...patch }); setError(null); };
  const setOption = (n: number, patch: Partial<PriceEdit["options"][number]>) =>
    set({ options: edit.options.map((o, i) => (i === n ? { ...o, ...patch } : o)) });

  const save = async () => {
    const r = rowPatch(edit);
    if (r.ok === false) return setError(r.error);
    setSaving(true);
    // The new columns aren't in the generated types until Lovable regenerates them after the migration.
    const { error: e } = await (supabase.from("inventory_items") as unknown as { update: (p: unknown) => { eq: (k: string, v: string) => Promise<{ error: { message: string } | null }> } })
      .update(r.patch).eq("id", row.id);
    setSaving(false);
    if (e) return setError(e.message);
    toast.success(`Saved ${row.title}`);
    onSaved();
  };

  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[200px] flex-1 text-sm font-medium">{row.title}</div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={edit.bookable} onCheckedChange={(v) => set({ bookable: v })} aria-label={`Book online: ${row.title}`} /> Book online
        </label>
        <select aria-label={`How it's sold: ${row.title}`} value={edit.price_model} onChange={(e) => set({ price_model: e.target.value as PriceEdit["price_model"] })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs">
          <option value="unit">Per unit</option>
          <option value="cpm">Per 1,000 views or listens</option>
        </select>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {!edit.options.length && (
          <label className="text-xs text-muted-foreground">{edit.price_model === "cpm" ? "KES per 1,000" : "Price (KES)"}
            <Input className="mt-1 h-8 w-32" inputMode="numeric" value={edit.price} onChange={(e) => set({ price: e.target.value })} />
          </label>
        )}
        <label className="text-xs text-muted-foreground">Sold per
          <Input className="mt-1 h-8 w-32" value={edit.price_unit} placeholder={edit.price_model === "cpm" ? "1,000 views" : "spot, week…"} onChange={(e) => set({ price_unit: e.target.value })} />
        </label>
        {edit.price_model === "cpm" && (
          <label className="text-xs text-muted-foreground">Minimum (KES)
            <Input className="mt-1 h-8 w-32" inputMode="numeric" value={edit.min_spend} onChange={(e) => set({ min_spend: e.target.value })} />
          </label>
        )}
        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => set({ options: [...edit.options, { label: "", price: "", unit: "" }] })}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> Choice
        </Button>
        <Button type="button" size="sm" className="ml-auto h-8" disabled={!changed || saving} onClick={save}>{saving ? "Saving…" : "Save"}</Button>
      </div>
      {edit.options.length > 0 && (
        <div className="space-y-1.5">
          {edit.options.map((o, n) => (
            <div key={n} className="flex flex-wrap items-center gap-2">
              <Input className="h-8 min-w-[160px] flex-1" aria-label="Choice" placeholder="Choice, e.g. 6–9 AM" value={o.label} onChange={(e) => setOption(n, { label: e.target.value })} />
              <Input className="h-8 w-28" aria-label="Price (KES)" inputMode="numeric" placeholder="Price" value={o.price} onChange={(e) => setOption(n, { price: e.target.value })} />
              <Input className="h-8 w-24" aria-label="Unit" placeholder="Unit" value={o.unit} onChange={(e) => setOption(n, { unit: e.target.value })} />
              <button type="button" aria-label="Remove choice" className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => set({ options: edit.options.filter((_, i) => i !== n) })}>
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </li>
  );
}
