import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The two invite functions, run for real with Deno and the database stood in for. Until 20 Nov 2026 invite-org-admin let any
// agency admin make anyone (themselves included) an admin of any agency or brand org, and invite-client-user let any agency's
// staff add people to any other agency's client.
type Row = Record<string, unknown>;

const state = vi.hoisted(() => {
  const s = {
    tables: {} as Record<string, Record<string, unknown>[]>,
    writes: [] as { table: string; kind: string; row: unknown }[],
    invites: [] as { email: string; redirectTo?: string }[],
    rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
    caller: null as string | null,
    handlers: {} as Record<string, (req: Request) => Promise<Response>>,
    loading: "",
    client: (() => ({})) as () => unknown,
  };
  const rolesOf = (userId: unknown) => (s.tables.user_roles ?? []).filter((r) => r.user_id === userId);
  s.client = () => ({
    auth: {
      getUser: async () => (s.caller
        ? { data: { user: { id: s.caller } }, error: null }
        : { data: { user: null }, error: { message: "invalid token" } }),
      admin: {
        listUsers: async () => ({ data: { users: [] }, error: null }),
        inviteUserByEmail: async (email: string, opts?: { redirectTo?: string }) => {
          s.invites.push({ email, redirectTo: opts?.redirectTo });
          return { data: { user: { id: `new-${email}` } }, error: null };
        },
      },
    },
    // public.agency_staff_on_agency as defined in the database: a super admin, or agency_admin/account_manager of that agency.
    rpc: async (name: string, args: Record<string, unknown>) => {
      s.rpcCalls.push({ name, args });
      if (name !== "agency_staff_on_agency") return { data: null, error: { message: `unknown function ${name}` } };
      const rows = rolesOf(args._user_id);
      const staff = rows.some((r) => r.role === "super_admin")
        || rows.some((r) => ["agency_admin", "account_manager"].includes(String(r.role)) && r.agency_id === args._agency_id);
      return { data: staff, error: null };
    },
    from(table: string) {
      const filters: [string, unknown][] = [];
      let kind = "select";
      let row: unknown = null;
      let one = false;
      const result = () => {
        if (kind !== "select") {
          s.writes.push({ table, kind, row });
          return { data: null, error: null };
        }
        const rows = (s.tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
        return { data: one ? rows[0] ?? null : rows, error: null };
      };
      const query: Record<string, unknown> = {
        select: () => query,
        eq: (k: string, v: unknown) => { filters.push([k, v]); return query; },
        in: () => query,
        neq: () => query,
        is: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: () => { one = true; return query; },
        single: () => { one = true; return query; },
        upsert: (r: unknown) => { kind = "upsert"; row = r; return query; },
        insert: (r: unknown) => { kind = "insert"; row = r; return query; },
        update: (r: unknown) => { kind = "update"; row = r; return query; },
        delete: () => { kind = "delete"; return query; },
        then: (done: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(result()).then(done, fail),
      };
      return query;
    },
  });
  return s;
});

vi.mock("https://esm.sh/@supabase/supabase-js@2.45.0", () => ({ createClient: state.client }));
vi.mock("../../supabase/functions/_shared/app-email.ts", () => ({ sendAppEmail: async () => ({ success: true }) }));

const ENV: Record<string, string> = {
  SUPABASE_URL: "https://project.example.test",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-for-tests",
  SUPABASE_ANON_KEY: "anon-key-for-tests",
};
vi.stubGlobal("Deno", {
  env: { get: (name: string) => ENV[name] },
  serve: (handler: (req: Request) => Promise<Response>) => { state.handlers[state.loading] = handler; },
});
afterAll(() => vi.unstubAllGlobals());

const load = async (name: string) => {
  state.loading = name;
  await import(`../../supabase/functions/${name}/index.ts`);
  return state.handlers[name];
};
const call = async (name: string, caller: string, body: Row) => {
  state.caller = caller;
  const handler = await load(name);
  return handler(new Request("https://fn.example.test/", {
    method: "POST",
    headers: { Authorization: `Bearer token-of-${caller}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
};
const writesTo = (table: string) => state.writes.filter((w) => w.table === table);

const YELLOW = "agency-yellow";
const MAIN = "agency-main";
const SALADIN = "agency-saladin";

beforeEach(() => {
  state.writes = [];
  state.invites = [];
  state.rpcCalls = [];
  state.caller = null;
  state.tables = {
    user_roles: [
      { user_id: "yellow-admin", role: "agency_admin", agency_id: YELLOW },
      { user_id: "yellow-staff", role: "account_manager", agency_id: YELLOW },
      { user_id: "super", role: "super_admin", agency_id: null },
      { user_id: "super", role: "agency_admin", agency_id: MAIN },
    ],
    agencies: [
      { id: YELLOW, name: "Yellow", subdomain: "yellow" },
      { id: MAIN, name: "The Africa Growth Lab", subdomain: null },
      { id: SALADIN, name: "Saladin Media", subdomain: "saladin" },
    ],
    brand_orgs: [{ id: "brand-pesalink", name: "Pesalink", subdomain: "pesalink" }],
    clients: [
      { id: "client-yellow", agency_id: YELLOW, name: "Uber" },
      { id: "client-main", agency_id: MAIN, name: "Royco" },
    ],
    campaigns: [],
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("invite-org-admin", () => {
  it("refuses an agency admin who tries to make someone an admin of another agency", async () => {
    const res = await call("invite-org-admin", "yellow-admin", { kind: "agency", org_id: MAIN, email: "me@yellow.test" });
    expect(res.status).toBe(403);
    expect(state.invites).toEqual([]);
    expect(writesTo("user_roles")).toEqual([]);
  });

  it("refuses an agency admin even for their own agency: only super admins create workspace admins", async () => {
    const res = await call("invite-org-admin", "yellow-admin", { kind: "agency", org_id: YELLOW, email: "new@yellow.test" });
    expect(res.status).toBe(403);
    expect(state.invites).toEqual([]);
  });

  it("refuses an agency admin who tries to become a brand org's owner", async () => {
    const res = await call("invite-org-admin", "yellow-admin", { kind: "brand_org", org_id: "brand-pesalink", email: "me@yellow.test" });
    expect(res.status).toBe(403);
    expect(state.invites).toEqual([]);
    expect(writesTo("user_roles")).toEqual([]);
  });

  it("lets a super admin invite a workspace's admin, sent to the workspace's own address", async () => {
    const res = await call("invite-org-admin", "super", { kind: "agency", org_id: SALADIN, email: "Admin@Saladin.test" });
    expect(res.status).toBe(200);
    expect(state.invites).toEqual([{ email: "admin@saladin.test", redirectTo: "https://saladin.darajapulse.com/reset-password" }]);
    const granted = writesTo("user_roles").filter((w) => w.kind === "upsert").flatMap((w) => w.row as Row[]);
    expect(granted).toEqual([
      { user_id: "new-admin@saladin.test", role: "agency_admin", agency_id: SALADIN },
      { user_id: "new-admin@saladin.test", role: "account_manager", agency_id: SALADIN },
    ]);
  });
});

describe("invite-client-user", () => {
  it("refuses agency staff adding someone to another agency's client", async () => {
    const res = await call("invite-client-user", "yellow-staff", { client_id: "client-main", email: "spy@yellow.test" });
    expect(res.status).toBe(403);
    expect(state.invites).toEqual([]);
    expect(writesTo("client_members")).toEqual([]);
    expect(writesTo("user_roles")).toEqual([]);
  });

  it("answers 404 for a client that doesn't exist, inviting no one", async () => {
    const res = await call("invite-client-user", "yellow-staff", { client_id: "client-missing", email: "someone@client.test" });
    expect(res.status).toBe(404);
    expect(state.invites).toEqual([]);
  });

  it("lets agency staff invite people to their own agency's client", async () => {
    const res = await call("invite-client-user", "yellow-staff", { client_id: "client-yellow", email: "brand@uber.test" });
    expect(res.status).toBe(200);
    expect(state.invites.map((i) => i.email)).toEqual(["brand@uber.test"]);
    expect(writesTo("client_members").map((w) => (w.row as Row).client_id)).toEqual(["client-yellow"]);
    expect(state.rpcCalls).toEqual([{ name: "agency_staff_on_agency", args: { _user_id: "yellow-staff", _agency_id: YELLOW } }]);
  });

  it("lets a super admin invite people to any agency's client", async () => {
    const res = await call("invite-client-user", "super", { client_id: "client-yellow", email: "brand@uber.test" });
    expect(res.status).toBe(200);
    expect(state.invites.map((i) => i.email)).toEqual(["brand@uber.test"]);
  });
});
