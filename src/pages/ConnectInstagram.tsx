import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Instagram } from "lucide-react";

const ConnectInstagram = () => {
  const { influencerId } = useParams();
  const [params] = useSearchParams();
  const status = params.get("status");
  const reason = params.get("reason");
  const [name, setName] = useState<string>("");

  useEffect(() => {
    if (influencerId) {
      supabase.from("influencers").select("full_name").eq("id", influencerId).maybeSingle()
        .then(({ data }) => setName(data?.full_name ?? ""));
    }
  }, [influencerId]);

  const start = () => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-oauth-start?influencer_id=${influencerId}`;
    window.location.href = url;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-paper p-6">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground mx-auto flex items-center justify-center">
          <Instagram className="w-7 h-7" />
        </div>
        <h1 className="font-display text-3xl mt-4">Connect Instagram</h1>
        {status === "ok" ? (
          <div className="mt-6 space-y-3">
            <CheckCircle2 className="w-10 h-10 mx-auto text-accent" />
            <p className="text-muted-foreground">Your Instagram is connected. You can close this window.</p>
          </div>
        ) : status === "error" ? (
          <div className="mt-6 space-y-3">
            <AlertCircle className="w-10 h-10 mx-auto text-destructive" />
            <p className="text-muted-foreground">
              {reason === "no_ig_business"
                ? "We couldn't find an Instagram Business account linked to a Facebook Page you manage. Convert your IG to a Business/Creator account and link it to a Page, then retry."
                : "Something went wrong. Please try again."}
            </p>
            <Button onClick={start}>Retry</Button>
          </div>
        ) : (
          <>
            <p className="text-muted-foreground mt-3">
              {name ? `Hi ${name.split(" ")[0]} — ` : ""}Daraja Pulse needs read-only access to your Instagram Business account so we can report performance and pull hashtag mentions. We never post on your behalf.
            </p>
            <Button onClick={start} className="mt-6 w-full bg-primary" disabled={!influencerId}>
              Continue with Facebook
            </Button>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-4">
              Scopes: basic profile · insights · mentions
            </p>
          </>
        )}
      </Card>
    </div>
  );
};

export default ConnectInstagram;
