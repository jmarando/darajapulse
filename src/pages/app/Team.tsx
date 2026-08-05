import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant, tenantCopy } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";

type Member = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  title: string | null;
  roles: string[];
};

const Team = () => {
  const { roles: myRoles, user } = useAuth();
  const { tenant } = useTenant();
  const copy = tenantCopy(tenant?.agency_kind);
  const TITLE_OPTIONS = [
    { value: "lead", label: "Lead" },
    { value: "account_manager", label: "Account manager" },
    { value: "strategist", label: "Strategist" },
    { value: "creative", label: "Creative" },
    { value: "analyst", label: "Analyst" },
    { value: "agency_admin", label: copy.adminRole },
  ] as const;

  const titleLabel = (v?: string | null) =>
    TITLE_OPTIONS.find((o) => o.value === v)?.label ?? (v ? v.replace(/_/g, " ") : "");
  const isAdmin = myRoles.includes("agency_admin");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("account_manager");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: ur } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["agency_admin", "account_manager"]);
    const byUser = new Map<string, string[]>();
    (ur ?? []).forEach((r: any) => {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role);
      byUser.set(r.user_id, arr);
    });
    const ids = Array.from(byUser.keys());
    if (ids.length === 0) { setMembers([]); setLoading(false); return; }
    const { data: profs } = await (supabase as any).rpc("get_profiles_by_ids", { _ids: ids });
    const list: Member[] = ids.map((id) => {
      const p = (profs ?? []).find((x: any) => x.id === id);
      return { user_id: id, email: p?.email ?? null, full_name: p?.full_name ?? null, title: (p as any)?.title ?? null, roles: byUser.get(id) ?? [] };
    });
    list.sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
    setMembers(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="font-display text-2xl font-semibold">Team</h1>
        <p className="text-muted-foreground mt-2">Only {copy.adminRole.toLowerCase()}s can manage the team.</p>
      </div>
    );
  }

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const permission = role === "agency_admin" ? "agency_admin" : "account_manager";
    const title = role;
    const { data, error } = await supabase.functions.invoke("invite-teammate", {
      body: { email, role: permission, title },
    });
    setBusy(false);
    if (error || (data as any)?.error) return toast.error((data as any)?.error ?? error?.message ?? "Invite failed");
    toast.success((data as any)?.existed ? "Role assigned to existing user" : "Invite sent");
    setEmail("");
    load();
  };

  const removeRole = async (m: Member, r: string) => {
    if (m.user_id === user?.id) return toast.error("You can't remove your own role");
    if (!confirm(`Remove ${r} from ${m.email}?`)) return;
    const { error } = await supabase.from("user_roles").delete().eq("user_id", m.user_id).eq("role", r as any);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    load();
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Team</h1>
        <p className="text-muted-foreground">{copy.teamSubtitle}</p>
      </div>

      <Card className="p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2"><UserPlus className="w-4 h-4" /> Invite teammate</h2>
        <form onSubmit={invite} className="grid sm:grid-cols-[1fr_180px_auto] gap-3 items-end">
          <div>
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder={copy.invitePlaceholder} />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TITLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send invite"}</Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Current team ({members.length})</h2>
        {loading ? (
          <div className="text-muted-foreground text-sm">Loading…</div>
        ) : (
          <div className="divide-y">
            {members.map(m => (
              <div key={m.user_id} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium">{m.full_name || m.email || m.user_id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">{m.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  {m.title && m.title !== "agency_admin" && !m.roles.includes(m.title) && (
                    <Badge variant="outline">{titleLabel(m.title)}</Badge>
                  )}
                  {m.roles.map(r => (
                    <Badge key={r} variant={r === "agency_admin" ? "default" : "secondary"} className="gap-1">
                      {titleLabel(r)}
                      {!(m.user_id === user?.id && r === "agency_admin") && (
                        <button onClick={() => removeRole(m, r)} className="ml-1 opacity-60 hover:opacity-100">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
            {members.length === 0 && <div className="text-muted-foreground text-sm">No teammates yet.</div>}
          </div>
        )}
      </Card>
    </div>
  );
};

export default Team;
