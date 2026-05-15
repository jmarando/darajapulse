import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, UserPlus2 } from "lucide-react";
import { toast } from "sonner";

type Scope = { type: "client"; client_id: string } | { type: "campaign"; campaign_id: string };

const ROLES = [
  { value: "lead", label: "Lead" },
  { value: "account_manager", label: "Account manager" },
  { value: "strategist", label: "Strategist" },
  { value: "creative", label: "Creative" },
  { value: "analyst", label: "Analyst" },
];

interface Props {
  scope: Scope;
  title?: string;
}

export const AgencyTeamPicker = ({ scope, title = "Agency team" }: Props) => {
  const table = scope.type === "client" ? "client_team_members" : "campaign_team_members";
  const fkCol = scope.type === "client" ? "client_id" : "campaign_id";
  const fkVal = scope.type === "client" ? scope.client_id : scope.campaign_id;

  const [rows, setRows] = useState<any[]>([]);
  const [agencyUsers, setAgencyUsers] = useState<any[]>([]);
  const [pickedUser, setPickedUser] = useState<string>("");
  const [pickedRole, setPickedRole] = useState<string>("account_manager");

  const load = async () => {
    const { data } = await (supabase as any).from(table).select("*").eq(fkCol, fkVal);
    const userIds = (data ?? []).map((r: any) => r.user_id);

    // Fetch all agency teammates via SECURITY DEFINER RPC (RLS-safe)
    const { data: team } = await (supabase as any).rpc("get_agency_team");
    const agency = (team ?? []) as any[];
    setAgencyUsers(agency);

    // Map assigned rows to profiles (fall back to RPC for non-agency users)
    let profiles: any[] = agency.filter((p) => userIds.includes(p.id));
    const missing = userIds.filter((id: string) => !profiles.find((p) => p.id === id));
    if (missing.length) {
      const { data: extra } = await (supabase as any).rpc("get_profiles_by_ids", { _ids: missing });
      profiles = profiles.concat(extra ?? []);
    }
    setRows((data ?? []).map((r: any) => ({ ...r, profile: profiles.find((p) => p.id === r.user_id) })));
  };

  useEffect(() => { load(); }, [fkVal]);

  const add = async () => {
    if (!pickedUser) return;
    const { error } = await (supabase as any).from(table).upsert(
      { [fkCol]: fkVal, user_id: pickedUser, team_role: pickedRole },
      { onConflict: `${fkCol},user_id` },
    );
    if (error) return toast.error(error.message);
    toast.success("Teammate assigned");
    setPickedUser("");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from(table).delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const updateRole = async (id: string, role: string) => {
    const { error } = await (supabase as any).from(table).update({ team_role: role }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const taken = new Set(rows.map((r) => r.user_id));
  const available = agencyUsers.filter((u) => !taken.has(u.id));

  return (
    <div className="border rounded-md p-3 space-y-3 bg-secondary/30">
      <div className="flex items-center gap-2 text-sm font-medium">
        <UserPlus2 className="w-4 h-4" /> {title}
      </div>
      <p className="text-xs text-muted-foreground">Internal only — clients never see this.</p>

      <div className="flex gap-2">
        <Select value={pickedUser} onValueChange={setPickedUser}>
          <SelectTrigger className="flex-1"><SelectValue placeholder={available.length ? "Pick a teammate" : "No more teammates"} /></SelectTrigger>
          <SelectContent>
            {available.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={pickedRole} onValueChange={setPickedRole}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={add} disabled={!pickedUser} className="bg-primary">Assign</Button>
      </div>

      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">No teammates assigned yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between border rounded-md px-3 py-2 bg-background">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{r.profile?.full_name || r.profile?.email || r.user_id}</div>
                {r.profile?.email && r.profile?.full_name && (
                  <div className="text-[10px] text-muted-foreground truncate">{r.profile.email}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Select value={r.team_role} onValueChange={(v) => updateRole(r.id, v)}>
                  <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((ro) => <SelectItem key={ro.value} value={ro.value}>{ro.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button onClick={() => remove(r.id)} className="text-muted-foreground hover:text-destructive">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
