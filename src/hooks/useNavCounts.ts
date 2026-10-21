import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type NavCounts = { pendingDrafts: number; unreadThreads: number };

/** Counts for the menu badges: drafts awaiting review and inbox conversations with unread mail. */
export function useNavCounts(enabled = true): NavCounts {
  const [counts, setCounts] = useState<NavCounts>({ pendingDrafts: 0, unreadThreads: 0 });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      const [drafts, threads] = await Promise.all([
        supabase.from("creator_drafts").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("email_threads").select("id", { count: "exact", head: true }).gt("unread_count", 0).neq("status", "done"),
      ]);
      if (!cancelled) setCounts({ pendingDrafts: drafts.count ?? 0, unreadThreads: threads.count ?? 0 });
    };
    load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener("focus", load);
    // The inbox and approval pages announce changes so the badges don't wait a minute.
    window.addEventListener("nav-counts:refresh", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
      window.removeEventListener("nav-counts:refresh", load);
    };
  }, [enabled]);

  return counts;
}

export const refreshNavCounts = () => window.dispatchEvent(new Event("nav-counts:refresh"));
