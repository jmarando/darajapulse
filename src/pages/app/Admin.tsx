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
          <TabsTrigger value="demo-requests">Demo Requests</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard"><Dashboard /></TabsContent>
        <TabsContent value="agencies"><AgenciesTab /></TabsContent>
        <TabsContent value="brand-orgs"><BrandOrgsTab /></TabsContent>
        <TabsContent value="clients"><ClientsTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="billing"><BillingTab /></TabsContent>
        <TabsContent value="demo-requests"><DemoRequestsTab /></TabsContent>
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
      .select("id,name,slug,subdomain,kind,monthly_fee_kes,billing_cycle,billing_notes,is_active,logo_url,support_email")
      .order("name");
    setRows((data as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const blank = { name: "", slug: "", subdomain: "", kind: "agency", monthly_fee_kes: 0, billing_cycle: "monthly", billing_notes: "", is_active: true, logo_url: "", support_email: user?.email ?? "" };

  const save = async (a: Agency) => {
    const payload = { ...a };
    const isNew = !a.id;
    const prev = !isNew ? rows.find((r) => r.id === a.id) : null;
    const emailChanged = !!payload.support_email && (prev?.support_email ?? "").toLowerCase() !== String(payload.support_email).toLowerCase();
    let err, newId: string | undefined;
    if (a.id) ({ error: err } = await (supabase.from("agencies") as any).update(payload).eq("id", a.id));
    else {
      const res = await (supabase.from("agencies") as any).insert(payload).select("id").single();
      err = res.error; newId = (res.data as any)?.id;
    }
    if (err) return toast({ title: "Save failed", description: err.message, variant: "destructive" });
    const orgId = newId ?? a.id;
    const shouldInvite = (isNew || emailChanged) && orgId && payload.support_email;
    if (shouldInvite) {
      const { error: invErr } = await supabase.functions.invoke("invite-org-admin", {
        body: { kind: "agency", org_id: orgId, email: payload.support_email, redirect_to: `${window.location.origin}/app` },
      });
      if (invErr) toast({ title: "Saved, but invite failed", description: invErr.message, variant: "destructive" });
      else toast({ title: "Saved", description: `Welcome email sent to ${payload.support_email}` });
    } else {
      toast({ title: "Saved" });
    }
    setOpen(false); load();
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{rows.length} agencies</p>
        <Button onClick={() => { setEditing(blank); setOpen(true); }}><Plus className="w-4 h-4 mr-2" />New agency</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Subdomain</TableHead><TableHead>Fee</TableHead><TableHead>Cycle</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{((a as any).kind ?? "agency").replace("_"," ")}</Badge></TableCell>
                <TableCell className="text-muted-foreground text-sm">{a.subdomain ?? "—"}</TableCell>
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
      <Field label="Type">
        <Select value={value.kind ?? "agency"} onValueChange={(v) => set("kind", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="agency">Agency</SelectItem>
            <SelectItem value="media_house">Media House</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Slug"><Input value={value.slug ?? ""} onChange={(e) => set("slug", e.target.value)} placeholder="auto from name (used in URLs)" /></Field>
      <Field label="Subdomain"><Input value={value.subdomain ?? ""} onChange={(e) => set("subdomain", e.target.value)} placeholder="e.g. mediamax" /></Field>
      <Field label="Fee (KES)"><Input type="number" value={value.monthly_fee_kes ?? 0} onChange={(e) => set("monthly_fee_kes", Number(e.target.value))} /></Field>
      <Field label="Cycle">
        <Select value={value.billing_cycle ?? "monthly"} onValueChange={(v) => set("billing_cycle", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem><SelectItem value="annual">Annual</SelectItem></SelectContent>
        </Select>
      </Field>
      <Field label="Logo" className="col-span-2"><LogoUploader value={value.logo_url ?? ""} onChange={(v) => set("logo_url", v)} /></Field>
      <Field label="Admin email" className="col-span-2"><Input type="email" value={value.support_email ?? ""} onChange={(e) => set("support_email", e.target.value)} placeholder="admin@youragency.com" /></Field>
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
  const { user } = useAuth();
  const [rows, setRows] = useState<BrandOrg[]>([]);
  const [editing, setEditing] = useState<BrandOrg | null>(null);
  const [open, setOpen] = useState(false);
  const load = async () => {
    const { data } = await (supabase.from("brand_orgs") as any)
      .select("id,name,slug,subdomain,subscription_fee_kes,billing_cycle,billing_notes,is_active,logo_url,support_email")
      .order("name");
    setRows((data as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const blank = { name: "", slug: "", subdomain: "", subscription_fee_kes: 180000, billing_cycle: "quarterly", billing_notes: "", is_active: true, logo_url: "", support_email: user?.email ?? "" };

  const save = async (b: BrandOrg) => {
    const isNew = !b.id;
    const prev = !isNew ? rows.find((r) => r.id === b.id) : null;
    const emailChanged = !!b.support_email && (prev?.support_email ?? "").toLowerCase() !== String(b.support_email).toLowerCase();
    let err, newId: string | undefined;
    if (b.id) ({ error: err } = await (supabase.from("brand_orgs") as any).update(b).eq("id", b.id));
    else {
      const res = await (supabase.from("brand_orgs") as any).insert(b).select("id").single();
      err = res.error; newId = (res.data as any)?.id;
    }
    if (err) return toast({ title: "Save failed", description: err.message, variant: "destructive" });
    const orgId = newId ?? b.id;
    const shouldInvite = (isNew || emailChanged) && orgId && b.support_email;
    if (shouldInvite) {
      const { error: invErr } = await supabase.functions.invoke("invite-org-admin", {
        body: { kind: "brand_org", org_id: orgId, email: b.support_email, redirect_to: `${window.location.origin}/app` },
      });
      if (invErr) toast({ title: "Saved, but invite failed", description: invErr.message, variant: "destructive" });
      else toast({ title: "Saved", description: `Welcome email sent to ${b.support_email}` });
    } else {
      toast({ title: "Saved" });
    }
    setOpen(false); load();
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{rows.length} brand orgs</p>
        <Button onClick={() => { setEditing(blank); setOpen(true); }}><Plus className="w-4 h-4 mr-2" />New brand org</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Subdomain</TableHead><TableHead>Fee</TableHead><TableHead>Cycle</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{b.subdomain ?? "—"}</TableCell>
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
      <Field label="Slug"><Input value={value.slug ?? ""} onChange={(e) => set("slug", e.target.value)} placeholder="auto from name (used in URLs)" /></Field>
      <Field label="Subdomain"><Input value={value.subdomain ?? ""} onChange={(e) => set("subdomain", e.target.value)} /></Field>
      
      <Field label="Fee (KES)"><Input type="number" value={value.subscription_fee_kes ?? 0} onChange={(e) => set("subscription_fee_kes", Number(e.target.value))} /></Field>
      <Field label="Cycle">
        <Select value={value.billing_cycle ?? "quarterly"} onValueChange={(v) => set("billing_cycle", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem><SelectItem value="annual">Annual</SelectItem></SelectContent>
        </Select>
      </Field>
      <Field label="Logo" className="col-span-2"><LogoUploader value={value.logo_url ?? ""} onChange={(v) => set("logo_url", v)} /></Field>
      <Field label="Admin email" className="col-span-2"><Input type="email" value={value.support_email ?? ""} onChange={(e) => set("support_email", e.target.value)} placeholder="admin@brand.com" /></Field>
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

  const getBillingRecipients = async (kind: OrgKind, orgId: string): Promise<string[]> => {
    const { data } = await (supabase.from("billing_contacts") as any)
      .select("email,is_primary")
      .eq("org_kind", kind).eq("org_id", orgId);
    const contacts = ((data as any) ?? []) as { email: string; is_primary: boolean }[];
    if (contacts.length) {
      const primary = contacts.find((c) => c.is_primary) ?? contacts[0];
      return [primary.email, ...contacts.filter((c) => c.email !== primary.email).map((c) => c.email)];
    }
    // Fallback to org support_email
    const table = kind === "agency" ? "agencies" : "brand_orgs";
    const { data: org } = await (supabase.from(table) as any).select("support_email").eq("id", orgId).maybeSingle();
    return org?.support_email ? [org.support_email] : [];
  };

  const sendInvoiceEmail = async (inv: Invoice, overrideTo?: string) => {
    setBusy(inv.id);
    try {
      const org = kindOrgLookup(inv);
      const recipients = overrideTo ? [overrideTo] : await getBillingRecipients(inv.org_kind, inv.org_id);
      if (!recipients.length) {
        toast({ title: "No recipient", description: "Add a billing contact or set the org support email.", variant: "destructive" });
        return;
      }
      const invoiceUrl = `${window.location.origin}/invoice/${inv.view_token}`;
      const results = await Promise.all(recipients.map((email) =>
        supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "invoice-notification",
            recipientEmail: email,
            idempotencyKey: `invoice-${inv.id}-${email}-${Date.now()}`,
            templateData: {
              invoice_number: inv.invoice_number,
              bill_to: org?.legal_name || org?.name || "",
              amount_kes: inv.amount_kes,
              due_date: inv.due_date,
              period_start: inv.period_start,
              period_end: inv.period_end,
              invoice_url: invoiceUrl,
              pay_url: inv.pesapal_redirect_url || null,
            },
          },
        })
      ));
      const failed = results.find((r) => r.error);
      if (failed) toast({ title: "Send failed", description: failed.error?.message, variant: "destructive" });
      else toast({ title: "Invoice emailed", description: recipients.join(", ") });
    } finally { setBusy(null); }
  };

  const kindOrgLookup = (inv: Invoice) => {
    if (inv.org_kind === "agency") return agencies.find((a: any) => a.id === inv.org_id);
    return brandOrgs.find((b: any) => b.id === inv.org_id);
  };

  const manageContacts = async (kind: OrgKind, org: any) => {
    const { data } = await (supabase.from("billing_contacts") as any)
      .select("id,name,email,role,is_primary")
      .eq("org_kind", kind).eq("org_id", org.id).order("is_primary", { ascending: false });
    const existing = ((data as any) ?? []) as any[];
    const summary = existing.length
      ? existing.map((c) => `• ${c.email}${c.name ? ` (${c.name})` : ""}${c.is_primary ? " — primary" : ""}`).join("\n")
      : "(none)";
    const action = prompt(
      `Billing contacts for ${org.name}:\n\n${summary}\n\nType 'add' to add, 'clear' to remove all, or Cancel.`,
      "add"
    );
    if (!action) return;
    if (action === "clear") {
      await (supabase.from("billing_contacts") as any).delete().eq("org_kind", kind).eq("org_id", org.id);
      toast({ title: "Billing contacts cleared" });
      return;
    }
    if (action === "add") {
      const email = prompt("Email address? (e.g. finance@example.com)");
      if (!email) return;
      const name = prompt("Contact name? (optional)", "") || null;
      const role = prompt("Role? (e.g. Finance)", "Finance") || null;
      const isPrimary = existing.length === 0 || confirm("Make this the primary billing contact?");
      if (isPrimary) {
        await (supabase.from("billing_contacts") as any)
          .update({ is_primary: false }).eq("org_kind", kind).eq("org_id", org.id);
      }
      const { error } = await (supabase.from("billing_contacts") as any).insert({
        org_kind: kind, org_id: org.id, email, name, role, is_primary: isPrimary,
      });
      if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
      else toast({ title: "Billing contact added", description: email });
    }
  };

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
    const { data: inserted, error } = await (supabase.from("invoices") as any).insert({
      org_kind: kind, org_id: org.id, amount_kes: fee,
      period_start: start.toISOString().slice(0, 10), period_end: end.toISOString().slice(0, 10),
      due_date: due.toISOString().slice(0, 10), status: "sent",
    }).select("*").single();
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Invoice generated" });
    await load();
    // Auto-send email
    if (inserted) {
      const shouldSend = confirm(`Send invoice ${inserted.invoice_number ?? ""} by email now?`);
      if (shouldSend) await sendInvoiceEmail(inserted);
    }
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
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => manageContacts("agency", a)}>Contacts</Button>
                  <Button size="sm" variant="outline" onClick={() => generateInvoice("agency", a)}>Generate</Button>
                </div>
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
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => manageContacts("brand_org", b)}>Contacts</Button>
                  <Button size="sm" variant="outline" onClick={() => generateInvoice("brand_org", b)}>Generate</Button>
                </div>
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
                  {inv.view_token && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => window.open(`/invoice/${inv.view_token}`, "_blank")}>
                        <ExternalLink className="w-3 h-3 mr-1" />View
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                        const url = `${window.location.origin}/invoice/${inv.view_token}`;
                        navigator.clipboard.writeText(url);
                        toast({ title: "Invoice link copied", description: url });
                      }}>Copy link</Button>
                    </>
                  )}
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

function LogoUploader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const handle = async (file: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast({ title: "Logo must be under 2MB", variant: "destructive" });
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("client-logos").upload(path, file, { upsert: false, contentType: file.type });
    if (error) { setUploading(false); return toast({ title: "Upload failed", description: error.message, variant: "destructive" }); }
    const { data } = supabase.storage.from("client-logos").getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
    toast({ title: "Logo uploaded" });
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {value && (
          <div className="w-12 h-12 rounded-md border border-border bg-secondary overflow-hidden flex items-center justify-center">
            <img src={value} alt="logo preview" className="w-full h-full object-contain p-1" />
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ""; }} />
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Upload className="w-3 h-3 mr-1" /> {uploading ? "Uploading…" : value ? "Replace" : "Upload"}
        </Button>
        {value && <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>Remove</Button>}
      </div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="…or paste a logo URL" />
    </div>
  );
}

/* ---------------- Demo Requests ---------------- */
function DemoRequestsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase.from("demo_requests") as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast({ title: "Failed to load", description: error.message, variant: "destructive" });
    setRows(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Demo Requests</CardTitle>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-3 h-3 mr-1" /> Refresh</Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No demo requests yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><a className="underline" href={`mailto:${r.email}`}>{r.email}</a></TableCell>
                  <TableCell>{r.company ?? "—"}</TableCell>
                  <TableCell>{r.role ?? "—"}</TableCell>
                  <TableCell className="max-w-md whitespace-pre-wrap text-sm">{r.message ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

