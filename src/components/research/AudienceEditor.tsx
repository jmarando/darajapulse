import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  MAX_ATTITUDES, PANEL_SIZES, cleanPanel, dimensionOptions, type PanelSpec, type Shares,
} from "../../../supabase/functions/_shared/research-panel";

const DIMENSIONS: { key: keyof Pick<PanelSpec, "ages" | "genders" | "regions" | "settings" | "incomes" | "languages">; label: string }[] = [
  { key: "ages", label: "Age" },
  { key: "genders", label: "Gender" },
  { key: "regions", label: "Region" },
  { key: "settings", label: "Setting" },
  { key: "incomes", label: "Income" },
  { key: "languages", label: "Language" },
];

/**
 * Who the study asks: a written description the AI turns into shares (for a person to check),
 * the panel size, each dimension's shares and optional mindsets.
 */
export default function AudienceEditor({ clientId, panel, onChange, disabled }: {
  clientId: string;
  panel: PanelSpec;
  onChange: (next: PanelSpec) => void;
  disabled?: boolean;
}) {
  const [description, setDescription] = useState(panel.description ?? "");
  const [filling, setFilling] = useState(false);
  const [attitude, setAttitude] = useState("");
  const options = dimensionOptions(panel.country);

  const fill = async () => {
    setFilling(true);
    const { data, error } = await supabase.functions.invoke("research-run", {
      body: { action: "parse_audience", client_id: clientId, description },
    });
    setFilling(false);
    if (error || data?.error || !data?.panel) {
      toast({ title: "Couldn't read that audience", description: data?.error ?? error?.message, variant: "destructive" });
      return;
    }
    onChange(cleanPanel({ ...data.panel, size: panel.size, description }));
    toast({ title: "Audience filled in", description: "Check the shares below and adjust anything that looks off." });
  };

  const setShare = (dim: (typeof DIMENSIONS)[number]["key"], option: string, value: number) => {
    const next: Shares = { ...panel[dim], [option]: Math.max(0, Math.min(100, value)) };
    onChange({ ...panel, [dim]: next });
  };

  const addAttitude = () => {
    const a = attitude.trim();
    if (!a || panel.attitudes.length >= MAX_ATTITUDES) return;
    onChange({ ...panel, attitudes: [...panel.attitudes, a.slice(0, 120)] });
    setAttitude("");
  };

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="audience-description" className="mb-1.5 block text-[13px] font-medium">Describe the audience</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Textarea
            id="audience-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Nairobi working women 25–40 who buy premium skincare"
            className="min-h-[64px]"
            maxLength={600}
            disabled={disabled}
          />
          <Button type="button" variant="outline" onClick={fill} disabled={disabled || filling || description.trim().length < 5} className="shrink-0 sm:self-start">
            <Sparkles className="mr-2 h-4 w-4" aria-hidden /> {filling ? "Filling in…" : "Fill in shares"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] font-medium">Panel size</span>
        <Select value={String(panel.size)} onValueChange={(v) => onChange({ ...panel, size: Number(v) })} disabled={disabled}>
          <SelectTrigger className="h-9 w-[150px]" aria-label="Panel size"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PANEL_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n} people</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-[12.5px] text-muted-foreground">Everyone sees every option you test.</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {DIMENSIONS.map((d) => {
          const shares = panel[d.key];
          const total = options[d.key].reduce((s, o) => s + (Number(shares[o]) || 0), 0);
          return (
            <fieldset key={d.key} className="rounded-xl border border-border/70 p-3">
              <legend className="px-1 text-[13px] font-medium">{d.label}</legend>
              <div className="space-y-1.5">
                {options[d.key].map((o) => (
                  <label key={o} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="min-w-0 truncate">{o}</span>
                    <span className="flex items-center gap-1">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        value={shares[o] ?? 0}
                        onChange={(e) => setShare(d.key, o, Number(e.target.value))}
                        className="h-8 w-[68px] text-right"
                        aria-label={`${d.label}: ${o} share`}
                        disabled={disabled}
                      />
                      <span className="text-muted-foreground">%</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className={`mt-2 text-[12px] ${Math.round(total) === 100 ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}`}>
                Adds to {Math.round(total)}%{Math.round(total) === 100 ? "" : " – shares are scaled to the panel either way"}
              </p>
            </fieldset>
          );
        })}
      </div>

      <div>
        <span className="mb-1.5 block text-[13px] font-medium">Mindsets <span className="font-normal text-muted-foreground">(optional, shared out evenly)</span></span>
        <div className="mb-2 flex flex-wrap gap-2">
          {panel.attitudes.map((a, i) => (
            <span key={`${a}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[12.5px]">
              {a}
              {!disabled && (
                <button type="button" aria-label={`Remove ${a}`} onClick={() => onChange({ ...panel, attitudes: panel.attitudes.filter((_, j) => j !== i) })}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
          {!panel.attitudes.length && <span className="text-[12.5px] text-muted-foreground">None: respondents are drawn from the shares alone.</span>}
        </div>
        {!disabled && panel.attitudes.length < MAX_ATTITUDES && (
          <div className="flex gap-2">
            <Input
              value={attitude}
              onChange={(e) => setAttitude(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAttitude(); } }}
              placeholder="e.g. price-sensitive mum of two"
              maxLength={120}
              className="h-9 max-w-sm"
              aria-label="New mindset"
            />
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={addAttitude} disabled={!attitude.trim()}>Add</Button>
          </div>
        )}
      </div>
    </div>
  );
}
