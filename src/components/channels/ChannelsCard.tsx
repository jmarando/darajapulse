import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Panel } from "@/components/dash/Panel";
import { StatusChip, type Tone } from "@/components/dash/chips";
import { addChannel, pullChannel, removeChannel, updatedLabel, type BrandChannel } from "@/lib/brandChannels";
import { platformLabel } from "@/lib/reportInsights";
import { normaliseHandle, type ChannelPlatform } from "../../../supabase/functions/_shared/brand-sources";

const PLATFORMS: ChannelPlatform[] = ["facebook", "instagram", "tiktok"];

function chipFor(c: BrandChannel): { tone: Tone; label: string } {
  if (c.status === "error") return { tone: "bad", label: "Not found" };
  if (c.status === "needs_reconnect") return { tone: "warn", label: "Needs reconnecting" };
  if (c.status === "paused") return { tone: "warn", label: "Paused" };
  return c.source === "connected" ? { tone: "good", label: "Connected" } : { tone: "neutral", label: "Public" };
}

/**
 * A brand's accounts: where each one's numbers come from, when they were last read and why they might be out of date.
 * Agency staff add and remove handles; the brand's own users only read the list.
 */
export default function ChannelsCard({ clientId, brandName, channels, canManage, onChanged, connect }: {
  clientId: string;
  brandName: string;
  channels: BrandChannel[];
  canManage: boolean;
  onChanged: () => void;
  connect?: React.ReactNode;
}) {
  const [platform, setPlatform] = useState<ChannelPlatform>("facebook");
  const [input, setInput] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const found = normaliseHandle(platform, input);
    if ("error" in found) return setProblem(found.error);
    setProblem(null);
    setBusy(true);
    let added: BrandChannel;
    try {
      added = await addChannel(clientId, platform, found.handle);
    } catch (e) {
      setBusy(false);
      const { code, message } = e as { code?: string; message?: string };
      return setProblem(code === "23505" ? "That account is already on this brand." : message ?? "Couldn't add that account.");
    }
    setInput("");
    onChanged();
    try {
      const read = await pullChannel(added.id);
      if (read.status === "error") toast({ title: "Couldn't read that account", description: read.note ?? undefined, variant: "destructive" });
    } catch {
      toast({ title: "Added", description: "The first read didn't finish. Tonight's run will read it." });
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const remove = async (c: BrandChannel) => {
    if (!window.confirm(`Remove @${c.handle} from ${brandName}? Its numbers go with it.`)) return;
    try {
      await removeChannel(c.id);
      onChanged();
    } catch (e) {
      toast({ title: "Couldn't remove it", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Panel title="Accounts" subtitle={`${brandName}'s own pages. Public numbers from the day a handle is added; Meta's official numbers once connected.`} action={connect} className="mb-5">
      {channels.length > 0 && (
        <ul className="divide-y divide-border/70">
          {channels.map((c) => {
            const chip = chipFor(c);
            return (
              <li key={c.id} className="flex items-start gap-3 py-3 first:pt-0">
                {c.avatar_url ? (
                  <img src={c.avatar_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-full bg-secondary object-cover" />
                ) : (
                  <span className="h-9 w-9 shrink-0 rounded-full bg-secondary" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{c.display_name ?? `@${c.handle}`}</div>
                  <div className="truncate text-[12.5px] text-muted-foreground">@{c.handle} · {platformLabel(c.platform)}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
                    <span className="text-[12px] text-muted-foreground">{updatedLabel(c.last_good_pull_at)}</span>
                  </div>
                  {c.status_note && <p className="mt-1.5 text-[12.5px] text-muted-foreground">{c.status_note}</p>}
                </div>
                {canManage && (
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`Remove @${c.handle}`} onClick={() => remove(c)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canManage && (
        <div className={channels.length > 0 ? "mt-4 border-t border-border/70 pt-4" : ""}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={platform} onValueChange={(v) => setPlatform(v as ChannelPlatform)}>
              <SelectTrigger className="h-9 sm:w-[140px]" aria-label="Platform"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{platformLabel(p)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              aria-label="Handle or link"
              placeholder="@handle or a link to the page"
              className="h-9 min-w-0 flex-1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !busy) add(); }}
            />
            <Button size="sm" className="h-9" onClick={add} disabled={busy}>{busy ? "Reading…" : "Add handle"}</Button>
          </div>
          {problem && <p role="alert" className="mt-2 text-[12.5px] text-destructive">{problem}</p>}
        </div>
      )}
    </Panel>
  );
}
