import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, RefreshCw, ExternalLink, Trash2, Upload } from "lucide-react";

type OrgKind = "agency" | "brand_org";
type Agency = any;
type BrandOrg = any;
type Invoice = any;
type Payment = any;

const fmtKES = (n: number) => `KES ${Number(n || 0).toLocaleString()}`;

export default function Admin() {
  const { roles, loading } = useAuth();
  const isSuper = roles.includes("super_admin" as any);
  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!isSuper) return <div className="p-6"><h1 className="text-xl font-semibold">Admin</h1><p className="text-muted-foreground mt-2">Super admin access required.</p></div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold">Super Admin</h1>
        <p className="text-sm text-muted-foreground">Manage agencies, brand orgs, clients, users, and billing.</p>
      </div>
      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="agencies">Agencies</TabsTrigger>
          <TabsTrigger value="brand-orgs">Brand Orgs</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard"><Dashboard /></TabsContent>
        <TabsContent value="agencies"><AgenciesTab /></TabsContent>
        <TabsContent value="brand-orgs"><BrandOrgsTab /></TabsContent>
        <TabsContent value="clients"><ClientsTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="billing"><BillingTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard() {
  const [stats, setStats] = useState<any>({});
  useEffect(() => {
    (async () => {
      const [a, b, c, inv, pay] = await Promise.all([
        (supabase.from("agencies") as any).select("id", { count: "exact", head: true }),
        (supabase.from("brand_orgs") as any).select("id", { count: "exact", head: true }),
        (supabase.from("clients") as any).select("id", { count: "exact", head: true }),
        (supabase.from("invoices") as any).select("amount_kes,status"),
        (supabase.from("payments") as any).select("amount_kes,paid_at").order("paid_at", { ascending: false }).limit(30),
      ]);
      const invs = (inv.data ?? []) as any[];
      const outstanding = invs.filter(i => i.status !== "paid" && i.status !== "void").reduce((s, i) => s + (i.amount_kes ?? 0), 0);
      const collected = (pay.data ?? []).reduce((s: number, p: any) => s + (p.amount_kes ?? 0), 0);
      setStats({
        agencies: a.count ?? 0,
        brand_orgs: b.count ?? 0,
        clients: c.count ?? 0,
        outstanding,
        collected30d: collected,
      });
    })();
  }, []);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mt-4">
      {[
        { l: "Agencies", v: stats.agencies },
        { l: "Brand Orgs", v: stats.brand_orgs },
        { l: "Clients", v: stats.clients },
        { l: "Outstanding", v: fmtKES(stats.outstanding ?? 0) },
        { l: "Collected (30d)", v: fmtKES(stats.collected30d ?? 0) },
      ].map((c) => (
        <Card key={c.l}><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">{c.l}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{c.v ?? "—"}</CardContent></Card>
      ))}
    </div>
  );
}

/* ---------------- Agencies ---------------- */
function AgenciesTab() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Agency[]>([]);
  const [editing, setEditing] = useState<Agency | null>(null);
  const [open, setOpen] = useState(false);
  const load = async () => {
    const { data } = await (supabase.from("agencies") as any)
      .select("id,name,slug,subdomain,kra_pin,monthly_fee_kes,billing_cycle,billing_notes,is_active,logo_url,support_email")
      .order("name");
    setRows((data as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const blank = { name: "", slug: "", subdomain: "", kra_pin: "", monthly_fee_kes: 0, billing_cycle: "monthly", billing_notes: "", is_active: true, logo_url: "", support_email: user?.email ?? "" };

  const save = async (a: Agency) => {
    const payload = { ...a };
    let err;
    if (a.id) ({ error: err } = await (supabase.from("agencies") as any).update(payload).eq("id", a.id));
    else ({ error: err } = await (supabase.from("agencies") as any).insert(payload));
    if (err) return toast({ title: "Save failed", description: err.message, variant: "destructive" });
    toast({ title: "Saved" });
    setOpen(false); load();
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{rows.length} agencies</p>
        <Button onClick={() => { setEditing(blank); setOpen(true); }}><Plus className="w-4 h-4 mr-2" />New agency</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Subdomain</TableHead><TableHead>KRA PIN</TableHead><TableHead>Fee</TableHead><TableHead>Cycle</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{a.subdomain ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{a.kra_pin ?? "—"}</TableCell>
                <TableCell>{fmtKES(a.monthly_fee_kes ?? 0)}</TableCell>
                <TableCell className="capitalize">{a.billing_cycle ?? "—"}</TableCell>
                <TableCell><Badge variant={a.is_active ? "default" : "secondary"}>{a.is_active ? "active" : "inactive"}</Badge></TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => { setEditing(a); setOpen(true); }}>Edit</Button></TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit agency" : "New agency"}</DialogTitle></DialogHeader>
          {editing && <AgencyForm value={editing} onChange={setEditing} />}
          <DialogFooter><Button onClick={() => editing && save(editing)}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AgencyForm({ value, onChange }: any) {
  const set = (k: string, v: any) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Name"><Input value={value.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label="Slug"><Input value={value.slug ?? ""} onChange={(e) => set("slug", e.target.value)} placeholder="auto from name" /></Field>
      <Field label="Subdomain"><Input value={value.subdomain ?? ""} onChange={(e) => set("subdomain", e.target.value)} /></Field>
      <Field label="KRA PIN"><Input value={value.kra_pin ?? ""} onChange={(e) => set("kra_pin", e.target.value)} /></Field>
      <Field label="Fee (KES)"><Input type="number" value={value.monthly_fee_kes ?? 0} onChange={(e) => set("monthly_fee_kes", Number(e.target.value))} /></Field>
      <Field label="Cycle">
        <Select value={value.billing_cycle ?? "monthly"} onValueChange={(v) => set("billing_cycle", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem><SelectItem value="annual">Annual</SelectItem></SelectContent>
        </Select>
      </Field>
      <Field label="Logo" className="col-span-2"><LogoUploader value={value.logo_url ?? ""} onChange={(v) => set("logo_url", v)} /></Field>
      <Field label="Support email" className="col-span-2"><Input type="email" value={value.support_email ?? ""} onChange={(e) => set("support_email", e.target.value)} placeholder="ops@youragency.com" /></Field>
      <Field label="Active" className="col-span-2 flex items-center gap-2">
        <input type="checkbox" checked={!!value.is_active} onChange={(e) => set("is_active", e.target.checked)} />
        <span className="text-sm text-muted-foreground">Active</span>
      </Field>
      <Field label="Billing notes" className="col-span-2">
        <Textarea rows={2} value={value.billing_notes ?? ""} onChange={(e) => set("billing_notes", e.target.value)} />
      </Field>
    </div>
  );
}

/* ---------------- Brand Orgs ---------------- */
function BrandOrgsTab() {
  const [rows, setRows] = useState<BrandOrg[]>([]);
  const [editing, setEditing] = useState<BrandOrg | null>(null);
  const [open, setOpen] = useState(false);
  const load = async () => {
    const { data } = await (supabase.from("brand_orgs") as any)
      .select("id,name,slug,subdomain,kra_pin,subscription_fee_kes,billing_cycle,billing_notes,is_active,logo_url,support_email")
      .order("name");
    setRows((data as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const blank = { name: "", slug: "", subdomain: "", kra_pin: "", subscription_fee_kes: 180000, billing_cycle: "quarterly", billing_notes: "", is_active: true, logo_url: "", support_email: "" };

  const save = async (b: BrandOrg) => {
    let err;
    if (b.id) ({ error: err } = await (supabase.from("brand_orgs") as any).update(b).eq("id", b.id));
    else ({ error: err } = await (supabase.from("brand_orgs") as any).insert(b));
    if (err) return toast({ title: "Save failed", description: err.message, variant: "destructive" });
    toast({ title: "Saved" }); setOpen(false); load();
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{rows.length} brand orgs</p>
        <Button onClick={() => { setEditing(blank); setOpen(true); }}><Plus className="w-4 h-4 mr-2" />New brand org</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Subdomain</TableHead><TableHead>KRA PIN</TableHead><TableHead>Fee</TableHead><TableHead>Cycle</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{b.subdomain ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{b.kra_pin ?? "—"}</TableCell>
                <TableCell>{fmtKES(b.subscription_fee_kes ?? 0)}</TableCell>
                <TableCell className="capitalize">{b.billing_cycle ?? "—"}</TableCell>
                <TableCell><Badge variant={b.is_active ? "default" : "secondary"}>{b.is_active ? "active" : "inactive"}</Badge></TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => { setEditing(b); setOpen(true); }}>Edit</Button></TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit brand org" : "New brand org"}</DialogTitle></DialogHeader>
          {editing && <BrandOrgForm value={editing} onChange={setEditing} />}
          <DialogFooter><Button onClick={() => editing && save(editing)}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BrandOrgForm({ value, onChange }: any) {
  const set = (k: string, v: any) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Name"><Input value={value.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label="Slug"><Input value={value.slug ?? ""} onChange={(e) => set("slug", e.target.value)} /></Field>
      <Field label="Subdomain"><Input value={value.subdomain ?? ""} onChange={(e) => set("subdomain", e.target.value)} /></Field>
      <Field label="KRA PIN"><Input value={value.kra_pin ?? ""} onChange={(e) => set("kra_pin", e.target.value)} /></Field>
      <Field label="Fee (KES)"><Input type="number" value={value.subscription_fee_kes ?? 0} onChange={(e) => set("subscription_fee_kes", Number(e.target.value))} /></Field>
      <Field label="Cycle">
        <Select value={value.billing_cycle ?? "quarterly"} onValueChange={(v) => set("billing_cycle", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem><SelectItem value="annual">Annual</SelectItem></SelectContent>
        </Select>
      </Field>
      <Field label="Logo URL"><Input value={value.logo_url ?? ""} onChange={(e) => set("logo_url", e.target.value)} /></Field>
      <Field label="Support email"><Input value={value.support_email ?? ""} onChange={(e) => set("support_email", e.target.value)} /></Field>
      <Field label="Active" className="col-span-2 flex items-center gap-2">
        <input type="checkbox" checked={!!value.is_active} onChange={(e) => set("is_active", e.target.checked)} />
        <span className="text-sm text-muted-foreground">Active</span>
      </Field>
      <Field label="Notes" className="col-span-2"><Textarea rows={2} value={value.billing_notes ?? ""} onChange={(e) => set("billing_notes", e.target.value)} /></Field>
    </div>
  );
}

/* ---------------- Clients overview ---------------- */
function ClientsTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from("clients") as any)
        .select("id,name,industry,primary_contact_email,created_at,agency_id, agencies(name)")
        .order("created_at", { ascending: false });
      setRows(data ?? []);
    })();
  }, []);
  return (
    <Card className="mt-4"><CardContent className="p-0">
      <Table><TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Agency</TableHead><TableHead>Industry</TableHead><TableHead>Contact</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-medium">{c.name}</TableCell>
            <TableCell className="text-muted-foreground text-sm">{c.agencies?.name ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground text-sm">{c.industry ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground text-sm">{c.primary_contact_email ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground text-sm">{c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}</TableCell>
          </TableRow>
        ))}</TableBody>
      </Table>
    </CardContent></Card>
  );
}

/* ---------------- Users & Roles ---------------- */
const ALL_ROLES = ["super_admin","agency_admin","account_manager","brand_owner","brand_viewer","client_user","client_viewer","influencer"];

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const load = async () => {
    const { data: profs } = await (supabase.from("profiles") as any).select("id,email,full_name").order("email");
    const { data: rs } = await (supabase.from("user_roles") as any).select("user_id,role,agency_id,brand_org_id");
    const byUser: Record<string, any[]> = {};
    (rs ?? []).forEach((r: any) => { (byUser[r.user_id] ||= []).push(r); });
    setUsers((profs ?? []).map((p: any) => ({ ...p, roles: byUser[p.id] ?? [] })));
  };
  useEffect(() => { load(); }, []);

  const addRole = async (user_id: string, role: string) => {
    const { error } = await (supabase.from("user_roles") as any).insert({ user_id, role });
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    load();
  };
  const removeRole = async (user_id: string, role: string) => {
    const { error } = await (supabase.from("user_roles") as any).delete().eq("user_id", user_id).eq("role", role);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    load();
  };

  const filtered = users.filter(u => !search || (u.email ?? "").toLowerCase().includes(search.toLowerCase()) || (u.full_name ?? "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4 mt-4">
      <Input placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>User</TableHead><TableHead>Roles</TableHead><TableHead>Add role</TableHead></TableRow></TableHeader>
          <TableBody>{filtered.map((u) => (
            <TableRow key={u.id}>
              <TableCell><div className="font-medium">{u.full_name ?? "—"}</div><div className="text-xs text-muted-foreground">{u.email}</div></TableCell>
              <TableCell><div className="flex flex-wrap gap-1">{u.roles.map((r: any, i: number) => (
                <Badge key={i} variant="secondary" className="gap-1">{r.role}
                  <button onClick={() => removeRole(u.id, r.role)} className="ml-1 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                </Badge>
              ))}{u.roles.length === 0 && <span className="text-xs text-muted-foreground">No roles</span>}</div></TableCell>
              <TableCell><Select onValueChange={(v) => addRole(u.id, v)}><SelectTrigger className="w-44"><SelectValue placeholder="Grant role…" /></SelectTrigger>
                <SelectContent>{ALL_ROLES.filter(r => !u.roles.some((x: any) => x.role === r)).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">To add a brand new user, have them sign up at /auth — they appear here once their account is created. Scoped roles (agency, brand_org) can be assigned via the relevant page.</p>
    </div>
  );
}

/* ---------------- Billing (Invoices + Payments + Pesapal) ---------------- */
function BillingTab() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [brandOrgs, setBrandOrgs] = useState<BrandOrg[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const [a, b, i, p] = await Promise.all([
      (supabase.from("agencies") as any).select("id,name,monthly_fee_kes,billing_cycle").order("name"),
      (supabase.from("brand_orgs") as any).select("id,name,subscription_fee_kes,billing_cycle").order("name"),
      (supabase.from("invoices") as any).select("*").order("created_at", { ascending: false }),
      (supabase.from("payments") as any).select("*").order("paid_at", { ascending: false }).limit(50),
    ]);
    setAgencies((a.data as any) ?? []);
    setBrandOrgs((b.data as any) ?? []);
    setInvoices((i.data as any) ?? []);
    setPayments((p.data as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const orgsMap = useMemo(() => {
    const m: Record<string, string> = {};
    agencies.forEach((a) => m[`agency:${a.id}`] = a.name);
    brandOrgs.forEach((b) => m[`brand_org:${b.id}`] = b.name);
    return m;
  }, [agencies, brandOrgs]);

  const generateInvoice = async (kind: OrgKind, org: any) => {
    const fee = kind === "agency" ? org.monthly_fee_kes : org.subscription_fee_kes;
    const cycle = org.billing_cycle ?? "monthly";
    if (!fee) return toast({ title: "Set a fee first", variant: "destructive" });
    const start = new Date();
    const end = new Date(start);
    if (cycle === "monthly") end.setMonth(end.getMonth() + 1);
    else if (cycle === "quarterly") end.setMonth(end.getMonth() + 3);
    else end.setFullYear(end.getFullYear() + 1);
    const due = new Date(start); due.setDate(due.getDate() + 14);
    const { error } = await (supabase.from("invoices") as any).insert({
      org_kind: kind, org_id: org.id, amount_kes: fee,
      period_start: start.toISOString().slice(0, 10), period_end: end.toISOString().slice(0, 10),
      due_date: due.toISOString().slice(0, 10), status: "sent",
    });
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Invoice generated" }); load();
  };

  const createPesapalOrder = async (inv: Invoice) => {
    setBusy(inv.id);
    const { data, error } = await supabase.functions.invoke("pesapal-create-order", { body: { invoice_id: inv.id } });
    setBusy(null);
    if (error || (data as any)?.error) return toast({ title: "Pesapal", description: error?.message ?? (data as any)?.error, variant: "destructive" });
    const url = (data as any).redirect_url;
    if (url) window.open(url, "_blank");
    load();
  };

  const refreshStatus = async (inv: Invoice) => {
    setBusy(inv.id);
    const { data, error } = await supabase.functions.invoke("pesapal-get-status", { body: { invoice_id: inv.id } });
    setBusy(null);
    if (error) return toast({ title: "Pesapal", description: error.message, variant: "destructive" });
    toast({ title: `Status ${(data as any)?.payment_status_description ?? ""}` });
    load();
  };

  const recordManual = async (inv: Invoice) => {
    const amt = prompt(`Amount paid in KES (default ${inv.amount_kes})?`, String(inv.amount_kes));
    if (!amt) return;
    const method = prompt("Method (mpesa/bank/cash/other)?", "mpesa") ?? "other";
    const reference = prompt("Reference (optional)?", "") ?? "";
    const { error: e1 } = await (supabase.from("payments") as any).insert({
      invoice_id: inv.id, org_kind: inv.org_kind, org_id: inv.org_id,
      amount_kes: Number(amt), method, reference: reference || null,
    });
    if (e1) return toast({ title: "Failed", description: e1.message, variant: "destructive" });
    await (supabase.from("invoices") as any).update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", inv.id);
    toast({ title: "Payment recorded" }); load();
  };

  return (
    <div className="space-y-6 mt-4">
      <section className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">Agencies — generate next invoice</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {agencies.map((a) => (
              <div key={a.id} className="flex items-center justify-between border rounded-md p-2">
                <div><div className="font-medium text-sm">{a.name}</div><div className="text-xs text-muted-foreground">{fmtKES(a.monthly_fee_kes ?? 0)} · {a.billing_cycle ?? "monthly"}</div></div>
                <Button size="sm" variant="outline" onClick={() => generateInvoice("agency", a)}>Generate</Button>
              </div>
            ))}
            {agencies.length === 0 && <p className="text-sm text-muted-foreground">No agencies.</p>}
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-base">Brand orgs — generate next invoice</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {brandOrgs.map((b) => (
              <div key={b.id} className="flex items-center justify-between border rounded-md p-2">
                <div><div className="font-medium text-sm">{b.name}</div><div className="text-xs text-muted-foreground">{fmtKES(b.subscription_fee_kes ?? 0)} · {b.billing_cycle ?? "quarterly"}</div></div>
                <Button size="sm" variant="outline" onClick={() => generateInvoice("brand_org", b)}>Generate</Button>
              </div>
            ))}
            {brandOrgs.length === 0 && <p className="text-sm text-muted-foreground">No brand orgs.</p>}
          </CardContent>
        </Card>
      </section>

      <Card><CardHeader><CardTitle className="text-base">Invoices</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table><TableHeader><TableRow><TableHead>Org</TableHead><TableHead>Period</TableHead><TableHead>Amount</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>{invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="text-sm">{orgsMap[`${inv.org_kind}:${inv.org_id}`] ?? inv.org_id.slice(0, 8)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{inv.period_start} → {inv.period_end}</TableCell>
                <TableCell>{fmtKES(inv.amount_kes)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{inv.due_date ?? "—"}</TableCell>
                <TableCell><Badge variant={inv.status === "paid" ? "default" : inv.status === "overdue" ? "destructive" : "secondary"}>{inv.status}</Badge></TableCell>
                <TableCell className="space-x-2">
                  {inv.status !== "paid" && inv.status !== "void" && (
                    <>
                      {inv.pesapal_redirect_url
                        ? <Button size="sm" variant="outline" onClick={() => window.open(inv.pesapal_redirect_url, "_blank")}><ExternalLink className="w-3 h-3 mr-1" />Pay link</Button>
                        : <Button size="sm" onClick={() => createPesapalOrder(inv)} disabled={busy === inv.id}>Create Pesapal link</Button>}
                      {inv.pesapal_order_tracking_id && <Button size="sm" variant="ghost" onClick={() => refreshStatus(inv)} disabled={busy === inv.id}><RefreshCw className="w-3 h-3" /></Button>}
                      <Button size="sm" variant="ghost" onClick={() => recordManual(inv)}>Record manual</Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}{invoices.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No invoices yet.</TableCell></TableRow>}</TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle className="text-base">Recent payments</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Org</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead></TableRow></TableHeader>
            <TableBody>{payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-xs text-muted-foreground">{new Date(p.paid_at).toLocaleString()}</TableCell>
                <TableCell className="text-sm">{orgsMap[`${p.org_kind}:${p.org_id}`] ?? p.org_id.slice(0, 8)}</TableCell>
                <TableCell>{fmtKES(p.amount_kes)}</TableCell>
                <TableCell className="capitalize">{p.method}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.reference ?? p.pesapal_confirmation_code ?? "—"}</TableCell>
              </TableRow>
            ))}{payments.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No payments yet.</TableCell></TableRow>}</TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">Pesapal IPN: register once via the <code>pesapal-register-ipn</code> edge function, save the returned <code>ipn_id</code> as the <code>PESAPAL_IPN_ID</code> secret, then use “Create Pesapal link”.</p>
    </div>
  );
}

/* ---------------- helpers ---------------- */
function Field({ label, children, className = "" }: any) {
  return <div className={className}><Label className="text-xs">{label}</Label>{children}</div>;
}
