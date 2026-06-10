import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

type Agency = {
  id: string;
  name: string;
  monthly_fee_kes: number;
  billing_cycle: string;
  billing_notes: string | null;
};
type BrandOrg = {
  id: string;
  name: string;
  subscription_fee_kes: number;
  billing_cycle: string;
  billing_notes: string | null;
};

export default function AdminBilling() {
  const { roles, loading } = useAuth();
  const isSuper = roles.includes("super_admin" as any);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [brandOrgs, setBrandOrgs] = useState<BrandOrg[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    const [{ data: a }, { data: b }] = await Promise.all([
      (supabase.from("agencies") as any).select("id,name,monthly_fee_kes,billing_cycle,billing_notes").order("name"),
      (supabase.from("brand_orgs") as any).select("id,name,subscription_fee_kes,billing_cycle,billing_notes").order("name"),
    ]);
    setAgencies((a as any) ?? []);
    setBrandOrgs((b as any) ?? []);
  };

  useEffect(() => {
    if (!loading) load();
  }, [loading]);

  const saveAgency = async (a: Agency) => {
    setSaving(a.id);
    const { error } = await (supabase.from("agencies") as any)
      .update({
        monthly_fee_kes: a.monthly_fee_kes,
        billing_cycle: a.billing_cycle,
        billing_notes: a.billing_notes,
      })
      .eq("id", a.id);
    setSaving(null);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: "Saved" });
  };

  const saveBrand = async (b: BrandOrg) => {
    setSaving(b.id);
    const { error } = await (supabase.from("brand_orgs") as any)
      .update({
        subscription_fee_kes: b.subscription_fee_kes,
        billing_cycle: b.billing_cycle,
        billing_notes: b.billing_notes,
      })
      .eq("id", b.id);
    setSaving(null);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: "Saved" });
  };

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!isSuper)
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Admin · Billing</h1>
        <p className="text-muted-foreground mt-2">Super admin access required.</p>
      </div>
    );

  return (
    <div className="p-6 space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Negotiated Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Set per-agency and per-brand subscription fees. Pesapal collection and KRA PIN come later.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Agencies</h2>
        {agencies.length === 0 && <p className="text-sm text-muted-foreground">No agencies yet.</p>}
        {agencies.map((a, idx) => (
          <Card key={a.id}>
            <CardHeader><CardTitle className="text-base">{a.name}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Fee (KES)</Label>
                <Input
                  type="number"
                  value={a.monthly_fee_kes}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setAgencies((prev) => prev.map((x, i) => (i === idx ? { ...x, monthly_fee_kes: v } : x)));
                  }}
                />
              </div>
              <div>
                <Label>Cycle</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={a.billing_cycle}
                  onChange={(e) =>
                    setAgencies((prev) => prev.map((x, i) => (i === idx ? { ...x, billing_cycle: e.target.value } : x)))
                  }
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={a.billing_notes ?? ""}
                  onChange={(e) =>
                    setAgencies((prev) => prev.map((x, i) => (i === idx ? { ...x, billing_notes: e.target.value } : x)))
                  }
                />
              </div>
              <div>
                <Button onClick={() => saveAgency(a)} disabled={saving === a.id}>
                  {saving === a.id ? "Saving…" : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Brand Organizations</h2>
        {brandOrgs.length === 0 && <p className="text-sm text-muted-foreground">No brand orgs yet.</p>}
        {brandOrgs.map((b, idx) => (
          <Card key={b.id}>
            <CardHeader><CardTitle className="text-base">{b.name}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Fee (KES)</Label>
                <Input
                  type="number"
                  value={b.subscription_fee_kes}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setBrandOrgs((prev) => prev.map((x, i) => (i === idx ? { ...x, subscription_fee_kes: v } : x)));
                  }}
                />
              </div>
              <div>
                <Label>Cycle</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={b.billing_cycle}
                  onChange={(e) =>
                    setBrandOrgs((prev) => prev.map((x, i) => (i === idx ? { ...x, billing_cycle: e.target.value } : x)))
                  }
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={b.billing_notes ?? ""}
                  onChange={(e) =>
                    setBrandOrgs((prev) => prev.map((x, i) => (i === idx ? { ...x, billing_notes: e.target.value } : x)))
                  }
                />
              </div>
              <div>
                <Button onClick={() => saveBrand(b)} disabled={saving === b.id}>
                  {saving === b.id ? "Saving…" : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
