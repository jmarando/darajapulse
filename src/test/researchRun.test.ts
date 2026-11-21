import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MONTHLY_UNITS, UNIT_PER_FULL_WATCH, UNIT_PER_VIDEO_ACCOUNT, allowanceMonth, parseAnchors, parseAnswers,
  parseAudience, parseSummary, questionsText, spread, stimulusText, studyCost,
} from "../../supabase/functions/_shared/research-run";
import { GatewayPause, GatewayRejected, dataUrl, gateway } from "../../supabase/functions/_shared/research-ai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("studyCost", () => {
  it("charges one unit per respondent per text or image stimulus", () => {
    expect(studyCost({ respondents: 100, stimuli: [{ kind: "text" }, { kind: "image" }], videoMode: "summary" })).toBe(200);
  });
  it("adds a video's written account once, and charges full watches more", () => {
    expect(studyCost({ respondents: 50, stimuli: [{ kind: "video" }], videoMode: "summary" })).toBe(50 + UNIT_PER_VIDEO_ACCOUNT);
    expect(studyCost({ respondents: 50, stimuli: [{ kind: "video" }], videoMode: "full" })).toBe(50 * UNIT_PER_FULL_WATCH + UNIT_PER_VIDEO_ACCOUNT);
  });
  it("keeps the unset allowance in step with the migration's default", () => {
    const sql = readFileSync(resolve(__dirname, "../../supabase/migrations/20261121090000_consumer_research.sql"), "utf8");
    expect(sql).toContain(`research_allowances WHERE client_id = _client_id), ${DEFAULT_MONTHLY_UNITS})`);
  });
});

describe("allowanceMonth", () => {
  it("rolls over at Nairobi midnight, not UTC", () => {
    expect(allowanceMonth(new Date("2026-11-30T20:59:00Z"))).toBe("2026-11");
    expect(allowanceMonth(new Date("2026-11-30T21:01:00Z"))).toBe("2026-12");
  });
});

describe("what respondents are shown and asked", () => {
  it("puts plain-number prices in the brand's currency and keeps worded prices as written", () => {
    const s = { label: "Pack A", kind: "text" as const, body: "Mint toothpaste", price: "250", account: null };
    expect(stimulusText(s, "Brand", "KE")).toContain("Price: KES 250");
    expect(stimulusText({ ...s, price: "3 for 500" }, "Brand", "UG")).toContain("Price: UGX 3 for 500");
    expect(stimulusText({ ...s, price: "Free sample" }, "Brand", "UG")).toContain("Price: Free sample");
  });
  it("describes a video through its account and labels its text as the script", () => {
    const t = stimulusText({ label: "TikTok", kind: "video", body: "Hey guys", price: null, account: "A woman opens..." }, "B", "KE");
    expect(t).toContain("Script or caption: Hey guys");
    expect(t).toContain("described scene by scene:\nA woman opens...");
  });
  it("asks for every question by key in a JSON reply", () => {
    const t = questionsText([{ key: "appeal", kind: "likert", prompt: "Like it?" }, { key: "message", kind: "open", prompt: "What?" }]);
    expect(t).toContain('- "appeal": Like it?');
    expect(t).toContain('{"answers": {"appeal": "...", "message": "..."}}');
  });
});

describe("reading replies", () => {
  const qs = [{ key: "appeal", kind: "likert" as const, prompt: "" }, { key: "value", kind: "likert" as const, prompt: "" }];
  it("reads answers, fenced or not, and refuses a reply missing one", () => {
    expect(parseAnswers('{"answers":{"appeal":"I like it","value":"Too pricey"}}', qs)).toEqual({ appeal: "I like it", value: "Too pricey" });
    expect(parseAnswers('```json\n{"answers":{"appeal":"ok ok","value":"fine"}}\n```', qs)).not.toBeNull();
    expect(parseAnswers('{"answers":{"appeal":"I like it"}}', qs)).toBeNull();
    expect(parseAnswers("not json", qs)).toBeNull();
  });
  it("reads anchors only when there are five distinct ones", () => {
    expect(parseAnchors('{"anchors":["No way at all","Not really","Maybe so","Yes mostly","Absolutely yes"]}')).toHaveLength(5);
    expect(parseAnchors('{"anchors":["a b","c d"]}')).toBeNull();
  });
  it("reads an audience into shares and attitudes", () => {
    const a = parseAudience('{"ages":{"25-34":60,"35-44":40},"genders":{"Female":100},"attitudes":["skincare fan"]}');
    expect(a?.ages).toEqual({ "25-34": 60, "35-44": 40 });
    expect(a?.attitudes).toEqual(["skincare fan"]);
  });
  it("reads the summary and trims long lists", () => {
    const s = parseSummary(JSON.stringify({ stimuli: [{ label: "A", likes: ["1", "2", "3", "4"], barriers: [], quotes: ["q"] }], verdict: "A wins", changes: ["x"] }));
    expect(s?.stimuli[0].likes).toHaveLength(3);
    expect(parseSummary('{"verdict": 1}')).toBeNull();
  });
  it("spread picks evenly through a list", () => {
    expect(spread([1, 2, 3, 4, 5, 6, 7, 8], 4)).toEqual([1, 3, 5, 7]);
    expect(spread([1, 2], 4)).toEqual([1, 2]);
  });
});

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fail = (status: number) => new Response("nope", { status });

describe("the gateway client", () => {
  it("sends a video as video_url first and remembers the shape that worked", async () => {
    const fetcher = vi.fn().mockResolvedValue(ok({ choices: [{ message: { content: '{"account":"x"}' } }] }));
    const g = gateway("k", fetcher as unknown as typeof fetch);
    await g.chatJson([{ role: "user", content: [{ type: "video", dataUrl: "data:video/mp4;base64,AA" }] }]);
    const sent = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(sent.messages[0].content[0]).toEqual({ type: "video_url", video_url: { url: "data:video/mp4;base64,AA" } });
    expect(g.videoShape()).toBe("video_url");
  });

  it("tries image_url when video_url is refused, then gives up on video for the run", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(fail(400))
      .mockResolvedValueOnce(ok({ choices: [{ message: { content: "{}" } }] }));
    const g = gateway("k", fetcher as unknown as typeof fetch);
    await g.chatJson([{ role: "user", content: [{ type: "video", dataUrl: "data:video/mp4;base64,AA" }] }]);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).messages[0].content[0].type).toBe("image_url");
    expect(g.videoShape()).toBe("image_url");

    const never = vi.fn().mockResolvedValue(fail(400));
    const g2 = gateway("k", never as unknown as typeof fetch);
    await expect(g2.chatJson([{ role: "user", content: [{ type: "video", dataUrl: "d" }] }])).rejects.toBeInstanceOf(GatewayRejected);
    expect(g2.videoShape()).toBe("none");
    await expect(g2.chatJson([{ role: "user", content: [{ type: "video", dataUrl: "d" }] }])).rejects.toBeInstanceOf(GatewayRejected);
    expect(never).toHaveBeenCalledTimes(2);
  });

  it("stops on 402 and 429 instead of retrying", async () => {
    const g = gateway("k", vi.fn().mockResolvedValue(fail(402)) as unknown as typeof fetch);
    await expect(g.chatJson([{ role: "user", content: "hi" }])).rejects.toBeInstanceOf(GatewayPause);
    const g2 = gateway("k", vi.fn().mockResolvedValue(fail(429)) as unknown as typeof fetch);
    await expect(g2.embed(["a"])).rejects.toMatchObject({ status: 429 });
  });

  it("embeds with the first model that answers, in input order, and reports the model", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(fail(404))
      .mockResolvedValueOnce(ok({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] }));
    const g = gateway("k", fetcher as unknown as typeof fetch);
    const out = await g.embed(["first", "second"]);
    expect(out.model).toBe("google/gemini-embedding-001");
    expect(out.vectors).toEqual([[1, 0], [0, 1]]);
    expect(fetcher.mock.calls[1][0]).toBe("https://ai.gateway.lovable.dev/v1/embeddings");
  });

  it("refuses an embedding reply with the wrong number of vectors", async () => {
    const g = gateway("k", vi.fn().mockResolvedValue(ok({ data: [{ embedding: [1] }] })) as unknown as typeof fetch);
    await expect(g.embed(["a", "b"])).rejects.toThrow(/1 vectors for 2/);
  });

  it("builds data URLs for large files without overflowing", () => {
    const bytes = new Uint8Array(200_000).fill(65);
    const url = dataUrl(bytes, "image/png");
    expect(url.startsWith("data:image/png;base64,QUFB")).toBe(true);
  });
});
