import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { settingsPatch, type SettingsForm } from "@/lib/storefrontPrices";

const EMPTY: SettingsForm = {
  show_prices: false, booking: "off", support_email: "", audio: "", banner: "", print: "",
  account_name: "", bank_name: "", bank_branch: "", account_number: "", paybill: "", paybill_account: "",
};

// The columns this card reads and writes aren't in the generated types until the migration is applied.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** The storefront's own settings: prices on or off, online booking, where emails go, fees, and where buyers pay. */
export default function StorefrontSettings({ agencyId }: { agencyId: string }) {
  const [form, setForm] = useState<SettingsForm>(EMPTY);
  const [house, setHouse] = useState<{ slug: string; subdomain: string | null } | null>(null);
  const [onlineReady, setOnlineReady] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agencyId) return;
    (async () => {
      const [{ data: a }, { data: p }] = await Promise.all([
        db.from("agencies").select("slug, subdomain, support_email, storefront_show_prices, storefront_booking, storefront_production").eq("id", agencyId).maybeSingle(),
        db.from("storefront_payment_details").select("*").eq("agency_id", agencyId).maybeSingle(),
      ]);
      if (!a) return;
      const prod = (a.storefront_production ?? {}) as Record<string, number>;
      setHouse({ slug: a.slug, subdomain: a.subdomain ?? null });
      setForm({
        show_prices: Boolean(a.storefront_show_prices), booking: a.storefront_booking ?? "off", support_email: a.support_email ?? "",
        audio: prod.audio ? String(prod.audio) : "", banner: prod.banner ? String(prod.banner) : "", print: prod.print ? String(prod.print) : "",
        account_name: p?.account_name ?? "", bank_name: p?.bank_name ?? "", bank_branch: p?.bank_branch ?? "",
        account_number: p?.account_number ?? "", paybill: p?.paybill ?? "", paybill_account: p?.paybill_account ?? "",
      });
      const { data: opts } = await supabase.functions.invoke("storefront-booking", { body: { action: "options", agency_slug: a.slug } });
      setOnlineReady(Boolean((opts as { pesapal?: boolean } | null)?.pesapal));
    })();
  }, [agencyId]);

  const set = (k: keyof SettingsForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const testLink = house ? (house.subdomain ? `https://${house.subdomain}.darajapulse.com/?book=test` : `${window.location.origin}/shop/${house.slug}?book=test`) : "";

  const save = async () => {
    setSaving(true);
    const { agency, payment } = settingsPatch(form);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      db.from("agencies").update(agency).eq("id", agencyId),
      db.from("storefront_payment_details").upsert({ agency_id: agencyId, ...payment }),
    ]);
    setSaving(false);
    if (e1 || e2) return toast.error((e1 ?? e2).message);
    toast.success("Settings saved");
  };

  return (
    <div className="max-w-2xl space-y-6">
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Selling online</h2>
        <label className="flex items-center justify-between gap-3 text-sm">
          Show prices on the storefront <Switch checked={form.show_prices} onCheckedChange={(v) => setForm({ ...form, show_prices: v })} aria-label="Show prices" />
        </label>
        <fieldset className="space-y-1.5">
          <legend className="text-sm">Online booking</legend>
          {([["off", "Off: quote requests only"], ["test", "Test link only: Book now shows on the link below"], ["on", "On: anyone can book and pay"]] as const).map(([v, label]) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input type="radio" name="booking-mode" checked={form.booking === v} onChange={() => setForm({ ...form, booking: v })} /> {label}
            </label>
          ))}
        </fieldset>
        {form.booking === "test" && testLink && (
          <div className="flex items-center gap-2">
            <Input readOnly value={testLink} aria-label="Test link" className="font-mono text-xs" />
            <Button type="button" variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(testLink); toast.success("Test link copied"); }}><Copy className="h-3.5 w-3.5" aria-hidden /></Button>
          </div>
        )}
        <div className="space-y-1.5"><Label htmlFor="st-email">Where booking emails go</Label><Input id="st-email" type="email" value={form.support_email} onChange={set("support_email")} placeholder="ads@yourstation.co.ke" /></div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Making ads for buyers</h2>
        <p className="text-sm text-muted-foreground">What "Make it for me" adds, once per booking, before VAT. Leave empty to not offer it.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="st-audio">Audio advert (KES)</Label><Input id="st-audio" inputMode="numeric" value={form.audio} onChange={set("audio")} /></div>
          <div className="space-y-1.5"><Label htmlFor="st-banner">Banner set (KES)</Label><Input id="st-banner" inputMode="numeric" value={form.banner} onChange={set("banner")} /></div>
          <div className="space-y-1.5"><Label htmlFor="st-print">Print ad (KES)</Label><Input id="st-print" inputMode="numeric" value={form.print} onChange={set("print")} /></div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Where buyers pay</h2>
        <p className="text-sm text-muted-foreground">
          Shown to a buyer who pays by PesaLink or M-Pesa paybill, with their booking number as the reason. You confirm each payment in Bookings.
          Until you add them, buyers can still book: they're told you'll email an invoice, and the booking email asks you to send it.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="st-acname">Account name</Label><Input id="st-acname" value={form.account_name} onChange={set("account_name")} /></div>
          <div className="space-y-1.5"><Label htmlFor="st-bank">Bank</Label><Input id="st-bank" value={form.bank_name} onChange={set("bank_name")} /></div>
          <div className="space-y-1.5"><Label htmlFor="st-branch">Branch</Label><Input id="st-branch" value={form.bank_branch} onChange={set("bank_branch")} /></div>
          <div className="space-y-1.5"><Label htmlFor="st-acno">Account number</Label><Input id="st-acno" value={form.account_number} onChange={set("account_number")} /></div>
          <div className="space-y-1.5"><Label htmlFor="st-paybill">M-Pesa paybill</Label><Input id="st-paybill" value={form.paybill} onChange={set("paybill")} /></div>
          <div className="space-y-1.5"><Label htmlFor="st-payacc">Paybill account number</Label><Input id="st-payacc" value={form.paybill_account} onChange={set("paybill_account")} /></div>
        </div>
        <p className="text-sm">
          M-Pesa and card checkout (Pesapal): {onlineReady === null ? "checking…" : onlineReady ? "ready" : "not set up. Add the storefront's Pesapal key and secret to the project's secrets to turn it on."}
        </p>
      </section>

      <Button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
    </div>
  );
}
