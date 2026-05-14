import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Save, Pencil, X } from "lucide-react";

type Metrics = { views?: number; likes?: number; comments?: number; shares?: number; saves?: number } | null | undefined;

const fmt = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "k";
  return String(n);
};

export const PostMetricsEditor = ({
  post, metrics, onSave, onAutoFetch,
}: {
  post: any;
  metrics: Metrics;
  onSave: (fields: { views: number; likes: number; comments: number; shares: number }) => void | Promise<void>;
  onAutoFetch: () => void | Promise<void>;
}) => {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState({
    views: String(metrics?.views ?? ""),
    likes: String(metrics?.likes ?? ""),
    comments: String(metrics?.comments ?? ""),
    shares: String(metrics?.shares ?? ""),
  });

  const startEdit = () => {
    setV({
      views: String(metrics?.views ?? 0),
      likes: String(metrics?.likes ?? 0),
      comments: String(metrics?.comments ?? 0),
      shares: String(metrics?.shares ?? 0),
    });
    setEditing(true);
  };

  const save = async () => {
    await onSave({
      views: parseInt(v.views || "0", 10) || 0,
      likes: parseInt(v.likes || "0", 10) || 0,
      comments: parseInt(v.comments || "0", 10) || 0,
      shares: parseInt(v.shares || "0", 10) || 0,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="px-2 py-2 border-t border-border space-y-1.5">
        <div className="grid grid-cols-4 gap-1">
          {(["views","likes","comments","shares"] as const).map(k => (
            <div key={k}>
              <Input
                type="number"
                inputMode="numeric"
                value={(v as any)[k]}
                onChange={e => setV({ ...v, [k]: e.target.value })}
                className="h-7 text-xs px-1 text-center"
                placeholder="0"
              />
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground text-center mt-0.5 capitalize">{k === "comments" ? "Cmts" : k}</div>
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

  return (
    <div className="border-t border-border">
      {metrics ? (
        <div className="grid grid-cols-4 gap-1 px-2 py-2 text-center">
          <div><div className="font-display text-sm">{fmt(metrics.views || 0)}</div><div className="text-[9px] uppercase tracking-wider text-muted-foreground">Views</div></div>
          <div><div className="font-display text-sm">{fmt(metrics.likes || 0)}</div><div className="text-[9px] uppercase tracking-wider text-muted-foreground">Likes</div></div>
          <div><div className="font-display text-sm">{fmt(metrics.comments || 0)}</div><div className="text-[9px] uppercase tracking-wider text-muted-foreground">Cmts</div></div>
          <div><div className="font-display text-sm">{fmt(metrics.shares || 0)}</div><div className="text-[9px] uppercase tracking-wider text-muted-foreground">Shares</div></div>
        </div>
      ) : (
        <div className="px-2 py-2 text-center text-[10px] text-muted-foreground">No metrics yet</div>
      )}
      <div className="flex gap-1 px-2 pb-2">
        <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1" onClick={onAutoFetch}>
          <Sparkles className="w-3 h-3 mr-1" /> Auto-fetch
        </Button>
        <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1" onClick={startEdit}>
          <Pencil className="w-3 h-3 mr-1" /> {metrics ? "Edit" : "Enter"}
        </Button>
      </div>
    </div>
  );
};
