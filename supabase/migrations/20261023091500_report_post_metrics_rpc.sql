-- Public campaign reports read metric history for every post on the linked
-- campaign. Through post_metrics row security, Postgres chose to walk the whole
-- table in captured_at order and the anon role's 3s statement timeout fired on
-- big campaigns (an ~800-post report rendered as all zeros). This function checks
-- the report token once and reads only that campaign's posts by index.
-- It returns nothing an active report link could not already read.

create or replace function public.get_report_post_metrics(_token text)
returns table (
  post_id uuid,
  captured_at timestamptz,
  views integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  reach integer,
  impressions integer
)
language sql
stable
security definer
set search_path = public
as $$
  select pm.post_id, pm.captured_at, pm.views, pm.likes, pm.comments, pm.shares, pm.saves, pm.reach, pm.impressions
  from report_links rl
  join posts p on p.campaign_id = rl.campaign_id
  join post_metrics pm on pm.post_id = p.id
  where rl.token = _token and rl.is_active
  order by pm.post_id, pm.captured_at;
$$;

revoke all on function public.get_report_post_metrics(text) from public;
grant execute on function public.get_report_post_metrics(text) to anon, authenticated;
