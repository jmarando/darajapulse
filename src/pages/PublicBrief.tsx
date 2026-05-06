import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Hash, Wallet, Calendar, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

const PublicBrief = () => {
  const { token } = useParams();
  const [b, setB] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.rpc("get_brief_by_token", { _token: token });
    if (error) toast.error(error.message);
    setB(data); setLoading(false);
  };
  useEffect(() => { load(); }, [token]);

  const act = async (status: string) => {
    setActing(true);
    const { error } = await supabase.rpc("update_brief_status", { _token: token, _status: status });
    setActing(false);
    if (error) return toast.error(error.message);
    toast.success(status === "confirmed" ? "Thanks — you're confirmed!" : status === "declined" ? "Declined." : "Updated");
    load();
  };

  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!b) return <div className="p-10 text-center"><h1 className="font-display text-2xl">Brief not found</h1><p className="text-muted-foreground mt-2">This invite link is invalid or has been revoked.</p></div>;

  const final = ["confirmed","declined"].includes(b.status);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-6 md:p-10">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{b.client.name} · Creator brief</div>
        <h1 className="font-display text-4xl md:text-5xl font-semibold mt-2">{b.campaign.name}</h1>
        <p className="text-muted-foreground mt-3">Hi {b.influencer.full_name?.split(" ")[0]}, you've been invited to collaborate.</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden mt-8 border border-border">
          <div className="bg-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Fee</div>
            <div className="font-display text-xl mt-1">KES {Number(b.fee_kes || 0).toLocaleString()}</div>
          </div>
          <div className="bg-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Deliverables</div>
            <div className="font-display text-xl mt-1">{b.deliverables_count}</div>
          </div>
          <div className="bg-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Hashtag</div>
            <div className="font-display text-xl mt-1 truncate">{b.campaign.hashtag || "—"}</div>
          </div>
          <div className="bg-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Window</div>
            <div className="font-display text-base mt-1">{b.campaign.start_date || "—"} → {b.campaign.end_date || "—"}</div>
          </div>
        </div>

        {b.campaign.objective && (
          <Card className="p-6 mt-6">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Objective</div>
            <p className="mt-2 leading-relaxed">{b.campaign.objective}</p>
          </Card>
        )}
        {b.campaign.brief && (
          <Card className="p-6 mt-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">The brief</div>
            <p className="mt-2 leading-relaxed whitespace-pre-wrap">{b.campaign.brief}</p>
          </Card>
        )}

        <div className="mt-8 flex items-center gap-3 flex-wrap">
          <Badge variant="outline" className="capitalize">Status: {b.status}</Badge>
          {!final && (
            <>
              <Button onClick={() => act("confirmed")} disabled={acting} className="bg-success text-success-foreground hover:bg-success/90">
                <CheckCircle2 className="w-4 h-4 mr-2" /> Accept
              </Button>
              <Button onClick={() => act("declined")} disabled={acting} variant="outline">
                <XCircle className="w-4 h-4 mr-2" /> Decline
              </Button>
            </>
          )}
          {final && <span className="text-sm text-muted-foreground">Thanks — your response has been recorded.</span>}
        </div>
      </div>
    </div>
  );
};
export default PublicBrief;
