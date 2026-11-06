-- Follower numbers for a creator's other accounts. The main account's numbers stay in follower_count and engagement_rate,
-- which reports and jobs read, and the other handles stay in alt_handles. Keyed by "platform:handle" in lowercase, each
-- value being {"followers": n, "engagement_rate": n}. src/lib/creatorAccounts.ts is the only code that reads or writes it.
--
-- Anon has column-by-column SELECT grants on this table and gets none on this column, so public report and plan links
-- can't read it. Staff read it through their table-wide grant and the existing row policies.
ALTER TABLE public.influencers
  ADD COLUMN IF NOT EXISTS account_stats jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.influencers.account_stats IS
  'Numbers for accounts other than the main one, by "platform:handle": {"followers": n, "engagement_rate": n}. See src/lib/creatorAccounts.ts.';
