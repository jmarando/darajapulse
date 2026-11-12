// Storing the posts one Listening keyword search found. Kept out of listening-sweep so it can be tested off Deno.
import { clip } from "./clip.ts";

export type MentionRow = {
  client_id: string;
  topic_id: string;
  source: string;
  url: string;
  title: string | null;
  snippet: string | null;
  author: string | null;
  reach: number | null;
  shares: number | null;
  published_at: string | null;
};

/** One insert of these rows: how many were new, or why the database refused them. */
export type SaveMentions = (rows: MentionRow[]) => Promise<{ count: number; error: { message: string } | null }>;

/**
 * Cleans the text first, so half an emoji or a NUL can't make the database refuse the posts, then stores them in one
 * insert. One insert takes all its rows or none, so if the database still refuses it, the posts go in one at a time
 * and a post it can't take costs only itself, not the whole search.
 */
export async function storeMentions(rows: MentionRow[], save: SaveMentions): Promise<{ stored: number; skipped: number; problem: string | null }> {
  if (!rows.length) return { stored: 0, skipped: 0, problem: null };
  const clean = rows.map((r) => ({ ...r, title: clip(r.title, 300), snippet: clip(r.snippet, 1200), author: clip(r.author, 120) }));
  const all = await save(clean);
  if (!all.error) return { stored: all.count, skipped: 0, problem: null };

  let stored = 0;
  let skipped = 0;
  let reason: string | null = null;
  for (const row of clean) {
    const one = await save([row]);
    if (one.error) {
      skipped++;
      reason ??= one.error.message;
    } else stored += one.count;
  }
  return { stored, skipped, problem: skipped ? `Could not store ${skipped} of ${rows.length} posts found (${reason}).` : null };
}
