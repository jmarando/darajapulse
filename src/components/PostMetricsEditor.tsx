import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Save, Pencil, X } from "lucide-react";

type Metrics = { views?: number; likes?: number; comments?: number; shares?: number; saves?: number; reach?: number } | null | undefined;

const fmt = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "k";
  return String(n);
};

const FIELDS = ["views", "likes", "comments", "shares", "saves", "reach"] as const;
const LABEL: Record<typeof FIELDS[number], string> = {
  views: "Views", likes: "Likes", comments: "Cmts", shares: "Shares", saves: "Saves", reach: "Reach",
};

export const PostMetricsEditor = ({
  post, metrics, onSave, onAutoFetch,
}: {
  post: any;
  metrics: Metrics;
  onSave: (fields: { views: number; likes: number; comments: number; shares: number; saves: number; reach: number }) => void | Promise<void>;
  onAutoFetch: () => void | Promise<void>;
}) => {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map(k => [k, String(metrics?.[k] ?? "")]))
  );

  const startEdit = () => {
    setV(Object.fromEntries(FIELDS.map(k => [k, String(metrics?.[k] ?? 0)])));
    setEditing(true);
  };

  const save = async () => {
    await onSave(Object.fromEntries(FIELDS.map(k => [k, parseInt(v[k] || "0", 10) || 0])) as any);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="px-2 py-2 border-t border-border space-y-1.5">
        <div className="grid grid-cols-3 gap-1">
          {FIELDS.map(k => (
            <div key={k}>
              <Input
                type="number"
                inputMode="numeric"
                value={v[k]}
                onChange={e => setV({ ...v, [k]: e.target.value })}
                className="h-7 text-xs px-1 text-center"
                placeholder="0"
              />
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground text-center mt-0.5">{LABEL[k]}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          <Button size="sm" className="h-7 text-xs flex-1 bg-primary" onClick={save}><Save className="w-3 h-3 mr-1" /> Save</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(false)}><X className="w-3 h-3" /></Button>
        </div>
      </div>
    );
  }

  const hasAny = metrics && FIELDS.some(k => Number(metrics[k] || 0) > 0);

  return (
    <div className="border-t border-border">
      {hasAny ? (
        <div className="grid grid-cols-3 gap-1 px-2 py-2 text-center">
          {FIELDS.map(k => (
            <div key={k}>
              <div className="font-display text-sm">{fmt(Number(metrics?.[k] || 0))}</div>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{LABEL[k]}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-2 py-2 text-center text-[10px] text-muted-foreground">No metrics yet</div>
      )}
      <div className="flex gap-1 px-2 pb-2">
        <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1" onClick={onAutoFetch}>
          <Sparkles className="w-3 h-3 mr-1" /> Auto-fetch
        </Button>
        <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1" onClick={startEdit}>
          <Pencil className="w-3 h-3 mr-1" /> {hasAny ? "Edit" : "Enter"}
        </Button>
      </div>
    </div>
  );
};
