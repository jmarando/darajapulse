import { useEffect, useRef, useState } from "react";
import { publicSupabase as supabase } from "@/integrations/supabase/publicClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileSignature, ShieldCheck, Eraser, Printer } from "lucide-react";
import { toast } from "sonner";

type Contract = {
  required: boolean;
  signed: boolean;
  title?: string;
  text?: string;
  signer_name?: string;
  signature_data_url?: string | null;
  signed_at?: string;
};

/** Simple finger/mouse signature pad — exports a PNG data URL. */
const SignaturePad = ({ onChange }: { onChange: (dataUrl: string | null) => void }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return (
    <div>
      <canvas
        ref={ref}
        className="w-full h-32 rounded-md border border-border bg-card touch-none"
        onPointerDown={(e) => {
          drawing.current = true;
          const ctx = ref.current!.getContext("2d")!;
          const p = pos(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = ref.current!.getContext("2d")!;
          const p = pos(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          dirty.current = true;
        }}
        onPointerUp={() => {
          drawing.current = false;
          if (dirty.current) onChange(ref.current!.toDataURL("image/png"));
        }}
      />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs text-muted-foreground">Sign with your finger or mouse</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            const c = ref.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            dirty.current = false;
            onChange(null);
          }}
        >
          <Eraser className="w-3.5 h-3.5 mr-1.5" /> Clear
        </Button>
      </div>
    </div>
  );
};

const ContractSign = ({
  token,
  creatorName,
  onSigned,
}: {
  token: string;
  creatorName?: string;
  onSigned?: () => void;
}) => {
  const [c, setC] = useState<Contract | null>(null);
  const [name, setName] = useState(creatorName || "");
  const [agree, setAgree] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase.rpc("get_contract_by_token", { _token: token });
    setC((data as any) ?? null);
  };
  useEffect(() => {
    load();
  }, [token]);

  useEffect(() => {
    if (creatorName && !name) setName(creatorName);
  }, [creatorName]);

  if (!c || !c.required) return null;

  const sign = async () => {
    if (!agree) return toast.error("Please tick the box to confirm you agree");
    if (name.trim().length < 3) return toast.error("Type your full legal name");
    setSaving(true);
    const { error } = await supabase.rpc("sign_contract_by_token", {
      _token: token,
      _signer_name: name.trim(),
      _signature_data_url: sig,
      _user_agent: navigator.userAgent,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Signed — thank you. A copy is saved to your record.");
    await load();
    onSigned?.();
  };

  /** Print just the agreement — not the surrounding brief page. */
  const printContract = () => {
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) return toast.error("Allow pop-ups to print your copy");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8" />
<title>${esc(c.title || "Creator agreement")}</title>
<style>
  @page { margin: 20mm; }
  body { font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; color:#111827; line-height:1.55; }
  h1 { font-size:20px; margin:0 0 4px; }
  .meta { font-size:12px; color:#6b7280; margin-bottom:20px; }
  pre { white-space:pre-wrap; font-family:inherit; font-size:12.5px; margin:0; }
  .sig { margin-top:28px; border-top:1px solid #e5e7eb; padding-top:16px; font-size:12.5px; }
  .sig img { height:64px; display:block; margin:8px 0; }
</style></head><body>
<h1>${esc(c.title || "Creator agreement")}</h1>
<div class="meta">Signed by ${esc(c.signer_name || "")}${
      c.signed_at ? ` on ${esc(new Date(c.signed_at).toLocaleString())}` : ""
    }</div>
<pre>${esc(c.text || "")}</pre>
<div class="sig"><strong>Signature</strong>${
      c.signature_data_url ? `<img src="${c.signature_data_url}" alt="Signature" />` : ""
    }<div>${esc(c.signer_name || "")}</div></div>
</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  if (c.signed) {
    return (
      <Card className="p-6 mt-6 border-success/40 bg-success/5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-success" />
          <h3 className="font-display text-xl">Agreement signed</h3>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {c.signed_at ? new Date(c.signed_at).toLocaleString() : ""}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Signed by <span className="text-foreground font-medium">{c.signer_name}</span>. This copy is stored exactly as
          you agreed to it.
        </p>
        {c.signature_data_url && (
          <img src={c.signature_data_url} alt="Your signature" className="h-16 mt-3 bg-white rounded border border-border p-1" />
        )}
        <ScrollArea className="h-56 mt-4 rounded-md border border-border bg-card p-4">
          <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">{c.text}</pre>
        </ScrollArea>
        <Button variant="outline" size="sm" className="mt-3" onClick={printContract}>
          <Printer className="w-3.5 h-3.5 mr-1.5" /> Print / save a copy
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6 mt-6 border-accent/40">
      <div className="flex items-center gap-2">
        <FileSignature className="w-5 h-5 text-accent" />
        <div className="text-[10px] uppercase tracking-widest text-accent">Required before you post</div>
      </div>
      <h3 className="font-display text-xl mt-1">{c.title || "Creator agreement"}</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Please read and sign. You can't submit post links until this is signed.
      </p>

      <ScrollArea className="h-72 mt-4 rounded-md border border-border bg-secondary/20 p-4">
        <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">{c.text}</pre>
      </ScrollArea>

      <div className="mt-5 space-y-4">
        <div>
          <Label className="text-sm">Your full legal name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="As it appears on your ID" className="h-12 mt-1.5" />
        </div>
        <SignaturePad onChange={setSig} />
        <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer">
          <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
          <span className="text-sm leading-snug">
            I have read and agree to this agreement, and I accept that my electronic signature is legally binding.
          </span>
        </label>
        <Button onClick={sign} disabled={saving} size="lg" className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90">
          {saving ? "Signing…" : "Sign agreement"}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">
          We record the exact wording, your name, signature, date and device for both parties' records.
        </p>
      </div>
    </Card>
  );
};

export default ContractSign;
