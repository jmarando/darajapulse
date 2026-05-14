import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type State = "loading" | "valid" | "already" | "invalid" | "submitting" | "done" | "error";

const Unsubscribe = () => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    (async () => {
      try {
        const r = await fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, { headers: { apikey: ANON } });
        const j = await r.json();
        if (j.valid) setState("valid");
        else if (j.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      } catch { setState("error"); }
    })();
  }, [token]);

  const confirm = async () => {
    setState("submitting");
    const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
    if (error) { setState("error"); return; }
    if ((data as any)?.success || (data as any)?.reason === "already_unsubscribed") setState("done");
    else setState("error");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full text-center space-y-5 p-8 rounded-xl border bg-card">
        <h1 className="font-display text-3xl">Email preferences</h1>
        {state === "loading" && <p className="text-muted-foreground">Checking your link…</p>}
        {state === "invalid" && <p className="text-muted-foreground">This unsubscribe link is invalid or expired.</p>}
        {state === "already" && <p className="text-muted-foreground">You're already unsubscribed. No further emails will be sent.</p>}
        {state === "error" && <p className="text-destructive">Something went wrong. Please try again.</p>}
        {state === "valid" && (
          <>
            <p className="text-muted-foreground">Click below to unsubscribe from Daraja Pulse emails.</p>
            <Button onClick={confirm} className="w-full">Confirm unsubscribe</Button>
          </>
        )}
        {state === "submitting" && <p className="text-muted-foreground">Processing…</p>}
        {state === "done" && <p className="text-foreground">You've been unsubscribed. Sorry to see you go.</p>}
      </div>
    </div>
  );
};

export default Unsubscribe;
