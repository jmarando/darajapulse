import { afterAll, describe, expect, it, vi } from "vitest";

vi.stubGlobal("Deno", { env: { get: (name: string) => (name === "SCRAPECREATORS_API_KEY" ? "test-key" : undefined) } });
const { scrapeCreatorsGet } = await import("../../supabase/functions/_shared/scrapecreators");
afterAll(() => vi.unstubAllGlobals());

describe("scrapeCreatorsGet", () => {
  it("hands back a refusal as a status instead of throwing, so a 402 can be told from a 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false, message: "Gotta purchase more credits" }), { status: 402 })));
    await expect(scrapeCreatorsGet("/v1/tiktok/profile", { handle: "acme" })).resolves.toMatchObject({ status: 402, json: { success: false } });
  });

  it("sends the key in a header and the params in the query", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await scrapeCreatorsGet("/v1/tiktok/profile", { handle: "a b" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://api.scrapecreators.com/v1/tiktok/profile?handle=a+b");
    expect(init.headers["x-api-key"]).toBe("test-key");
  });

  it("copes with an answer that isn't JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    await expect(scrapeCreatorsGet("/x", {})).resolves.toEqual({ status: 502, json: null });
  });
});
