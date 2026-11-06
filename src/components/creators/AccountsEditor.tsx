import { useEffect, useRef, useState } from "react";
import { Plus, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CREATOR_PLATFORMS, TRACKED_PLATFORMS, accountKey, parseAccount, platformName, type CreatorAccount } from "@/lib/creatorAccounts";

type Row = { id: number; platform: string; text: string; followers: string; engagement: number | null };

const USUAL_PLATFORMS = ["tiktok", "instagram", "facebook"];

const readRow = (row: Row) => (row.text.trim() ? parseAccount(row.text, row.platform) : null);

/**
 * A creator's platforms: one row each, the same account on any form that adds or edits a creator. A pasted link fills
 * in its own platform. The first row a report can use is the main account. Rows are local until read back through
 * `onChange`, so reset the editor by giving it a new `key`.
 */
export function AccountsEditor({ initial, onChange }: {
  initial: CreatorAccount[];
  /** The readable rows as accounts, and how many rows hold something that can't be saved. */
  onChange: (accounts: CreatorAccount[], problems: number) => void;
}) {
  const nextId = useRef(0);
  const newRow = (platform: string, text = "", followers: number | null = null, engagement: number | null = null): Row => ({
    id: nextId.current++, platform, text, followers: followers == null ? "" : String(followers), engagement,
  });
  const [rows, setRows] = useState<Row[]>(() => {
    const existing = initial.map((a) => newRow(a.platform, a.handle, a.followers, a.engagement));
    const missing = USUAL_PLATFORMS.filter((p) => !initial.some((a) => a.platform === p)).map((p) => newRow(p));
    return [...existing, ...missing];
  });

  useEffect(() => {
    const seen = new Set<string>();
    const accounts: CreatorAccount[] = [];
    let problems = 0;
    for (const row of rows) {
      const parsed = readRow(row);
      if (!parsed) continue;
      if ("error" in parsed) {
        problems++;
        continue;
      }
      const key = accountKey(parsed.platform, parsed.handle);
      if (seen.has(key)) continue;
      seen.add(key);
      accounts.push({ ...parsed, followers: Number(row.followers.replace(/\D/g, "")) || null, engagement: row.engagement });
    }
    onChange(accounts, problems);
    // Only the rows change what the parent should hear; it often passes a new function each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const update = (id: number, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const setText = (row: Row, text: string) => {
    // Read with no platform given, so only a link or "platform:handle" can say which platform this is.
    const said = parseAccount(text);
    if (!said.platform) return update(row.id, { text });
    const cleaned = "error" in said ? text : said.handle;
    setRows((all) => all.map((r) => {
      if (r.id === row.id) return { ...r, platform: said.platform as string, text: cleaned };
      // The empty row already on that platform takes this row's old one, so no platform loses its place.
      if (r.platform === said.platform && !r.text.trim() && said.platform !== row.platform) return { ...r, platform: row.platform };
      return r;
    }));
  };

  const addRow = () => setRows((all) => {
    const unused = CREATOR_PLATFORMS.find((p) => !all.some((r) => r.platform === p.key));
    return [...all, newRow(unused?.key ?? "tiktok")];
  });

  const mainId = rows.find((r) => TRACKED_PLATFORMS.includes(r.platform) && r.text.trim())?.id;

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const parsed = readRow(row);
        const name = platformName(row.platform);
        return (
          <div key={row.id}>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Platform"
                className="h-9 w-32 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
                value={row.platform}
                onChange={(e) => update(row.id, { platform: e.target.value })}
              >
                {CREATOR_PLATFORMS.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}{TRACKED_PLATFORMS.includes(p.key) ? "" : " (profile only)"}</option>
                ))}
              </select>
              <Input
                aria-label="Handle or profile link"
                className="h-9 min-w-[140px] flex-1"
                placeholder="@handle or profile link"
                value={row.text}
                onChange={(e) => setText(row, e.target.value)}
              />
              <Input
                aria-label="Followers"
                className="h-9 w-24"
                inputMode="numeric"
                placeholder="Followers"
                value={row.followers}
                onChange={(e) => update(row.id, { followers: e.target.value })}
              />
              {row.id === mainId ? (
                <span className="flex h-9 w-9 items-center justify-center text-accent" title="Main account: shown on cards and in reports">
                  <Star className="h-4 w-4 fill-current" />
                </span>
              ) : row.text.trim() && TRACKED_PLATFORMS.includes(row.platform) ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground"
                  aria-label={`Make ${name} the main account`}
                  title={`Make ${name} the main account`}
                  onClick={() => setRows((all) => [row, ...all.filter((r) => r.id !== row.id)])}
                >
                  <Star className="h-4 w-4" />
                </Button>
              ) : (
                <span className="h-9 w-9" />
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground"
                aria-label={`Remove ${name}`}
                onClick={() => setRows((all) => all.filter((r) => r.id !== row.id))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {parsed && "error" in parsed && <p className="mt-1 text-[11px] text-destructive">{parsed.error}</p>}
            {parsed && !("error" in parsed) && !parsed.readable && (
              <p className="mt-1 text-[11px] text-muted-foreground">This looks like a name, not a handle. Paste their profile link so we can read their numbers.</p>
            )}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add another platform
      </Button>
    </div>
  );
}
