import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";
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
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });

    (async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const params = url.searchParams;

      // 1. Surface expired / already-used links before inspecting any existing session.
      const hashErr = hash.get("error_description") || hash.get("error");
      if (hashErr) { setFailed(decodeURIComponent(hashErr.replace(/\+/g, " "))); return; }

      // 2. Redeem the link before trusting a browser session that may belong to
      // another person already signed in on this device.
      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) { setFailed(error.message); return; }
        setReady(true);
        return;
      }

      // 3. Token hash flow (?token_hash=...&type=invite|recovery|signup)
      const tokenHash = params.get("token_hash") || params.get("token");
      const rawType = params.get("type") || "invite";
      const allowedTypes: EmailOtpType[] = ["invite", "recovery", "signup", "magiclink", "email_change", "email"];
      const type: EmailOtpType = allowedTypes.includes(rawType as EmailOtpType) ? rawType as EmailOtpType : "invite";
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
        if (error) { setFailed(error.message); return; }
        setReady(true);
        return;
      }

      // 4. Hash tokens may be consumed automatically by the SDK.
      setTimeout(async () => {
        const { data } = await supabase.auth.getSession();
        if (data.session) setReady(true);
        else setFailed("This link is invalid or has expired. Ask your admin to resend the invite.");
      }, 2500);
    })();

    return () => sub.subscription.unsubscribe();
  }, []);


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .in("role", ["agency_admin", "account_manager", "super_admin", "client_user"]);
    const roles = new Set((roleRows ?? []).map((row) => row.role));
    const destination = roles.has("client_user") && !roles.has("agency_admin") && !roles.has("account_manager") && !roles.has("super_admin")
      ? "/portal"
      : "/app";
    toast.success("Password updated. You're signed in.");
    nav(destination);
  };

  return (
    <div className="min-h-screen bg-gradient-paper flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logo} alt="Daraja Pulse" className="h-20 w-auto mx-auto mb-4" />
          <h1 className="font-display text-3xl font-semibold">Set a new password</h1>
        </div>
        <Card className="p-6 shadow-elegant">
          {failed ? (
            <div className="space-y-4">
              <p className="text-sm text-destructive">{failed}</p>
              <Button variant="outline" className="w-full" onClick={() => nav("/auth")}>Back to sign in</Button>
            </div>
          ) : !ready ? (
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
