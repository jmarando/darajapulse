import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import logo from "@/assets/logo-pulse-mark.png";

const ResetPassword = () => {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase puts a recovery session in the URL hash; the SDK picks it up automatically.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated. You're signed in.");
    nav("/app");
  };

  return (
    <div className="min-h-screen bg-gradient-paper flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logo} alt="Daraja Pulse" className="h-20 w-auto mx-auto mb-4" />
          <h1 className="font-display text-3xl font-semibold">Set a new password</h1>
        </div>
        <Card className="p-6 shadow-elegant">
          {!ready ? (
            <p className="text-sm text-muted-foreground">Validating reset link…</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div><Label>New password</Label><Input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} /></div>
              <Button type="submit" className="w-full bg-primary" disabled={busy}>{busy ? "…" : "Update password"}</Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
