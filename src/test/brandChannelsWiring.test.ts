import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Edge functions run on Deno and migrations on the live database, neither of which can run here. Their decisions live
// in pure modules with their own tests; these pin the wiring that matters most: who may call, who may read, and that
// nothing spends or sends without passing its checks.
const supabase = resolve(__dirname, "../../supabase");
const read = (path: string) => (existsSync(resolve(supabase, path)) ? readFileSync(resolve(supabase, path), "utf8") : "");

describe("the brand channel tables: who can read and write", () => {
  const sql = read("migrations/20261106090000_brand_channels.sql");
  const tables = ["brand_channels", "brand_channel_days", "brand_posts", "brand_post_metrics", "brand_pull_credits"];

  it("turns row security on for every table and keeps anon out", () => {
    for (const table of tables) expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    expect(sql).toMatch(/REVOKE ALL ON public\.brand_channels, public\.brand_channel_days, public\.brand_posts, public\.brand_post_metrics, public\.brand_pull_credits FROM anon, authenticated;/);
  });

  it("lets a signed-in person add only a brand, a platform and a handle, so nobody can set source or status", () => {
    expect(sql).toContain("GRANT INSERT (client_id, platform, handle) ON public.brand_channels TO authenticated;");
    expect(sql).toContain("GRANT SELECT, DELETE ON public.brand_channels TO authenticated;");
    expect(sql).not.toMatch(/GRANT UPDATE[^;]*brand_channels TO authenticated/);
  });

  it("writes daily lines, posts and readings through the service role only", () => {
    expect(sql).toContain("GRANT SELECT ON public.brand_channel_days, public.brand_posts, public.brand_post_metrics TO authenticated;");
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*brand_(channel_days|posts|post_metrics) TO authenticated/);
  });

  it("gives portal users reading and agency staff changing", () => {
    const view = sql.slice(sql.indexOf("FUNCTION public.can_view_brand_channels"), sql.indexOf("FUNCTION public.can_manage_brand_channels"));
    expect(view).toContain("public.user_has_client_access(_user_id, _client_id)");
    const manage = sql.slice(sql.indexOf("FUNCTION public.can_manage_brand_channels"));
    expect(manage.slice(0, manage.indexOf("$function$;"))).not.toContain("user_has_client_access");
    expect(sql).toMatch(/"Brand channels: read"[\s\S]*USING \(public\.can_view_brand_channels\(auth\.uid\(\), client_id\)\)/);
    expect(sql).toMatch(/"Brand channels: add"[\s\S]*WITH CHECK \(public\.can_manage_brand_channels\(auth\.uid\(\), client_id\)\)/);
    expect(sql).toMatch(/"Brand channels: remove"[\s\S]*USING \(public\.can_manage_brand_channels\(auth\.uid\(\), client_id\)\)/);
  });

  it("has a job key and a run every 15 minutes through the night's window", () => {
    expect(sql).toContain("INSERT INTO public.internal_job_keys(name) VALUES ('brand-channels-sync') ON CONFLICT (name) DO NOTHING;");
    expect(sql).toContain("cron.schedule('brand-channels-sync-nightly', '*/15 1-2 * * *'");
    expect(sql).toContain("invoke_job_function('brand-channels-sync'");
  });

  it("says how to roll it back", () => {
    expect(sql).toMatch(/To roll back:[\s\S]*cron\.unschedule\('brand-channels-sync-nightly'\)/);
  });
});

describe("the report rows", () => {
  const sql = read("migrations/20261106090000_brand_channels.sql");
  const fn = sql.slice(sql.indexOf("FUNCTION public.get_brand_report_rows"));

  it("checks access before reading anything", () => {
    expect(fn.indexOf("can_view_brand_channels(auth.uid(), _client_id)")).toBeGreaterThan(-1);
    expect(fn.indexOf("can_view_brand_channels(auth.uid(), _client_id)")).toBeLessThan(fn.indexOf("brand_report_doc(_client_id"));
  });

  it("cuts periods in Nairobi time, and refuses a period over a year", () => {
    expect(sql).toContain("AT TIME ZONE 'Africa/Nairobi'");
    expect(fn).toMatch(/_to - _from > 366/);
  });

  it("keeps the internal document away from signed-in people and visitors", () => {
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.brand_report_doc(uuid, date, date) FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.brand_report_doc(uuid, date, date) TO service_role;");
  });

  it("leaves staff notes and who connected what out of the document, since visitors get the same one", () => {
    const doc = sql.slice(sql.indexOf("FUNCTION public.brand_report_doc"), sql.indexOf("FUNCTION public.get_brand_report_rows"));
    for (const secret of ["status_note", "connected_by", "created_by"]) expect(doc).not.toContain(secret);
  });
});

describe("brand-channels-sync: who may call", () => {
  const fn = read("functions/brand-channels-sync/index.ts");

  it("checks the caller with the job key as the first thing its handler does", () => {
    expect(fn).toContain('requireCaller(req, { job: "brand-channels-sync" })');
    expect(fn).toMatch(/Deno\.serve\(async \(req\) => \{\s*if \(req\.method === "OPTIONS"\)[^\n]*\n\s*const caller = await requireCaller\(/);
    expect(fn.indexOf("requireCaller(")).toBeLessThan(fn.indexOf("req.json()"));
  });

  it("lets a signed-in person read one channel of a brand they manage, and not again within minutes", () => {
    const user = fn.slice(fn.indexOf('caller.kind === "user"'));
    expect(user).toMatch(/ids\.length !== 1/);
    expect(user.indexOf('"can_manage_brand_channels"')).toBeGreaterThan(-1);
    expect(user.indexOf('"can_manage_brand_channels"')).toBeLessThan(user.indexOf("runChannels("));
    expect(user.indexOf("THROTTLE_MS")).toBeLessThan(user.indexOf("runChannels("));
  });
});

describe("brand-channels-sync: spending", () => {
  const fn = read("functions/brand-channels-sync/index.ts");

  it("takes the agency's allowance before it spends a call", () => {
    expect(fn).toContain('rpc("take_brand_pull_credits"');
    expect(fn).toContain("maxPublicCalls(platform, mode)");
    expect(fn.indexOf('rpc("take_brand_pull_credits"')).toBeLessThan(fn.indexOf("pullPublic({"));
  });

  it("stops below the credit floor, so campaign metrics keep their credits", () => {
    expect(fn).toMatch(/run\.balance < SC_CREDIT_FLOOR/);
  });

  it("logs what it spent where the other jobs do", () => {
    expect(fn).toMatch(/scraper_credit_log[\s\S]*context: "brand_channels"/);
  });

  it("takes the job lock for a full run, and gives it back", () => {
    expect(fn).toContain('rpc("take_job_lock", { _name: LOCK, _seconds: 170 })');
    expect(fn).toMatch(/finally \{\s*await supabase\.rpc\("release_job_lock"/);
  });

  it("warns super admins at most once a day, through a lock it keeps on purpose", () => {
    expect(fn).toContain('rpc("take_job_lock", { _name: "brand-channels-credits-warning", _seconds: 86_400 })');
    expect(fn).toContain('templateName: "brand-channels-credits"');
    expect(fn).not.toMatch(/release_job_lock[^\n]*credits-warning/);
  });
});

describe("brand-channels-sync: writing", () => {
  const fn = read("functions/brand-channels-sync/index.ts");

  it("marks a read good only after its numbers are saved", () => {
    const write = fn.slice(fn.indexOf("async function writePull"));
    expect(write.indexOf('from("brand_post_metrics")')).toBeLessThan(write.indexOf('from("brand_channels")'));
    expect(write.indexOf('from("brand_channel_days")')).toBeLessThan(write.indexOf('from("brand_channels")'));
  });

  it("writes readings only through snapshotRow, so an unknown post has no row of zeros", () => {
    expect(fn).toContain("snapshotRow(");
    expect(fn).not.toContain("withMetricFallbacks");
  });
});

describe("brand-channels-sync: registered", () => {
  it("is a function that checks its own caller, not the platform's JWT check", () => {
    expect(read("config.toml")).toMatch(/\[functions\.brand-channels-sync\]\s+verify_jwt = false/);
  });

  it("has its warning email in the registry", () => {
    const registry = read("functions/_shared/transactional-email-templates/registry.ts");
    expect(registry).toContain("import { template as brandChannelsCredits } from './brand-channels-credits.tsx'");
    expect(registry).toContain("'brand-channels-credits': brandChannelsCredits");
  });
});

describe("the Channels page: where it lives", () => {
  const src = (path: string) => read(`../src/${path}`);

  it("is on the menu after Listening, and has its route", () => {
    const shell = src("components/AppShell.tsx");
    expect(shell.indexOf('label: "Channels"')).toBeGreaterThan(shell.indexOf('label: "Listening"'));
    expect(shell.indexOf('label: "Channels"')).toBeLessThan(shell.indexOf('label: "Approvals"'));
    expect(src("App.tsx")).toContain('<Route path="channels" element={<Channels />} />');
  });

  it("works out staff from the role, and never shows the brand portal staff tools", () => {
    expect(src("components/channels/ChannelsPage.tsx")).toContain("const canManage = !portal && (isAgency || isSuperAdmin);");
  });

  it("never fills in a brand post's numbers", () => {
    for (const file of ["components/channels/OrganicReport.tsx", "components/channels/ChannelsPage.tsx", "lib/brandChannels.ts"]) {
      expect(src(file)).not.toContain("withMetricFallbacks");
    }
  });
});

describe("connecting: where tokens live", () => {
  const sql = read("migrations/20261106100000_brand_channel_connect.sql");

  it("keeps the three server-only tables away from everyone but the service role", () => {
    for (const table of ["brand_channel_secrets", "brand_oauth_states", "brand_connect_pending"]) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`REVOKE ALL ON public.${table} FROM anon, authenticated;`);
      expect(sql).not.toMatch(new RegExp(`POLICY[^;]*ON public\\.${table}`));
    }
  });

  it("lets only the service role run the functions that touch tokens", () => {
    const fns = [
      "set_brand_channel_token(uuid, text, text, text[], text, text, uuid, text)", "brand_channel_token(uuid)",
      "create_brand_connect_pending(text, uuid, jsonb, text, text, text, text[], uuid)", "brand_connect_pending_token(uuid, text)",
      "clear_brand_connect_expired()", "revoke_brand_tokens_for_meta_user(text)",
    ];
    for (const fn of fns) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn} FROM PUBLIC, anon, authenticated;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`);
    }
  });

  it("deletes the vault secret whenever a row holding one goes", () => {
    expect(sql).toMatch(/DELETE FROM vault\.secrets WHERE id = OLD\.vault_secret_id/);
    expect(sql).toMatch(/AFTER DELETE ON public\.brand_channel_secrets[\s\S]*brand_drop_vault_secret/);
    expect(sql).toMatch(/AFTER DELETE ON public\.brand_connect_pending[\s\S]*brand_drop_vault_secret/);
  });

  it("gives a visitor nothing but a link's status and names", () => {
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.get_brand_connect_link(text) TO anon, authenticated;");
    const links = sql.slice(sql.indexOf("brand_connect_links ENABLE"));
    expect(links).toContain("REVOKE ALL ON public.brand_connect_links FROM anon, authenticated;");
    expect(links).toContain("GRANT SELECT, INSERT (client_id), UPDATE (revoked_at) ON public.brand_connect_links TO authenticated;");
  });

  it("lets anyone who can see a brand disconnect it, and checks that first", () => {
    const fn = sql.slice(sql.indexOf("FUNCTION public.disconnect_brand_channel"));
    expect(fn.indexOf("can_view_brand_channels(auth.uid()")).toBeLessThan(fn.indexOf("DELETE FROM public.brand_channel_secrets"));
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.disconnect_brand_channel(uuid) TO authenticated;");
  });

  it("says how to roll it back", () => {
    expect(sql).toMatch(/To roll back[\s\S]*DROP TABLE IF EXISTS public\.brand_connect_pending/);
  });
});

describe("connecting: the functions", () => {
  const start = read("functions/brand-connect-start/index.ts");
  const callback = read("functions/brand-connect-callback/index.ts");
  const confirm = read("functions/brand-connect-confirm/index.ts");
  const deauth = read("functions/meta-deauthorize/index.ts");
  const sync = read("functions/brand-channels-sync/index.ts");
  const auth = read("functions/_shared/auth.ts");

  it("start: refuses expired and cancelled links", () => {
    expect(start).toMatch(/revoked_at[\s\S]*expires_at/);
    expect(start).toContain("This link has expired or was cancelled.");
  });

  it("start: a signed-in person needs the view rule on that brand, whatever their role", () => {
    expect(start).toContain("requireCaller(req, { anySignedIn: true })");
    expect(start.indexOf('"can_view_brand_channels"')).toBeLessThan(start.indexOf('from("brand_oauth_states")'));
  });

  it("start: uses Login for Business only when its secret is set", () => {
    expect(start).toContain('Deno.env.get("META_LOGIN_CONFIG_ID")');
    expect(start).toContain("metaDialogUrl(");
  });

  it("callback: takes the state away before anything else, so it works once", () => {
    expect(callback).toMatch(/from\("brand_oauth_states"\)\s*\.delete\(\)\s*\.eq\("state", state\)\s*\.select\(/);
    expect(callback.indexOf('from("brand_oauth_states")')).toBeLessThan(callback.indexOf("await swap({ client_id"));
  });

  it("callback: a cancelled login and an account with no pages store nothing and say why", () => {
    expect(callback).toContain('"denied"');
    expect(callback).toContain('"no_pages"');
    expect(callback.indexOf('"no_pages"')).toBeLessThan(callback.indexOf("create_brand_connect_pending"));
  });

  it("confirm: takes the brand from the pending row, never from the request", () => {
    expect(confirm).not.toMatch(/body\??\.client_id/);
    expect(confirm).toMatch(/pending\.client_id/);
  });

  it("confirm: refuses anything not shared at login, and an empty list", () => {
    expect(confirm).toMatch(/assets\.filter\(\(a\) => wanted\.has\(a\.id\)\)/);
    expect(confirm).toMatch(/picked\.length !== wanted\.size|!picked\.length/);
  });

  it("confirm: deletes the pending row, and so the login token, once done", () => {
    const flow = confirm.slice(confirm.indexOf("set_brand_channel_token"));
    expect(flow).toMatch(/from\("brand_connect_pending"\)\s*\.delete\(\)/);
  });

  it("confirm: answers 410 for a step that's finished or expired", () => {
    expect(confirm).toContain("This step is finished or has expired. Open the link again if you still need to connect.");
    expect(confirm).toMatch(/, 410\)/);
  });

  it("deauthorise: checks the signature before touching the database", () => {
    expect(deauth.indexOf("parseSignedRequest(")).toBeGreaterThan(-1);
    expect(deauth.indexOf("parseSignedRequest(")).toBeLessThan(deauth.indexOf("revoke_brand_tokens_for_meta_user"));
  });

  it("never logs a token or an address that holds one", () => {
    for (const fn of [start, callback, confirm, deauth, sync]) {
      expect(fn).not.toMatch(/console\.\w+\([^)]*(token|url|code|secret)/i);
    }
  });

  it("all four check their own callers, not the platform's JWT check", () => {
    const config = read("config.toml");
    for (const name of ["brand-connect-start", "brand-connect-callback", "brand-connect-confirm", "meta-deauthorize"]) {
      expect(config).toMatch(new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt = false`));
    }
  });

  it("auth: anySignedIn only skips the role check, and everyone else still needs a staff role", () => {
    expect(auth).toContain("anySignedIn?: boolean");
    expect(auth).toMatch(/!opts\.anySignedIn && !roles\.some/);
  });

  it("sync: reads connected channels from Meta with the token from the vault, public numbers standing in once it's rejected", () => {
    expect(sync).toContain("pullRoute(row)");
    expect(sync).toContain('rpc("brand_channel_token"');
    expect(sync).toContain("reconcilePosts(");
    expect(sync).toContain('rpc("clear_brand_connect_expired")');
    expect(sync).not.toContain("access_token=");
  });
});

describe("the privacy policy", () => {
  it("says what connecting a brand's pages reads and how to undo it", () => {
    const privacy = read("../src/pages/Privacy.tsx");
    expect(privacy).toContain("When a brand connects its Facebook Pages or Instagram accounts");
    expect(privacy).toContain("We can't post, comment or read messages.");
    expect(privacy).toContain("deletes the token straight away");
  });
});

describe("a newly connected page", () => {
  it("reads back as far as a first read, since its older posts only have public numbers so far", () => {
    expect(read("functions/brand-connect-confirm/index.ts")).toContain("JSON.stringify({ channel_ids: channelIds, first_read: true })");
    const sync = read("functions/brand-channels-sync/index.ts");
    expect(sync).toContain('const mode: PullMode = forceFirst ? "first" : pullMode(row, now);');
    const user = sync.slice(sync.indexOf('caller.kind === "user"'), sync.indexOf("if (ids.length) {"));
    expect(user).not.toContain("first_read"); // only another function may ask for it: a first read spends more
  });
});
