import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { aiProvider, requireAiProvider } from "../../supabase/functions/_shared/ai-provider";

const env = (vars: Record<string, string>) => (n: string) => vars[n];

describe("aiProvider", () => {
  it("uses Gemini directly when GEMINI_API_KEY is set, even with a Lovable key", () => {
    const p = aiProvider(env({ GEMINI_API_KEY: "g", LOVABLE_API_KEY: "k" }))!;
    expect(p.kind).toBe("gemini");
    expect(p.chatUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(p.headers.Authorization).toBe("Bearer g");
    expect(p.model("google/gemini-3-flash-preview")).toBe("gemini-3-flash-preview");
    expect(p.model("google/gemini-2.5-flash")).toBe("gemini-2.5-flash");
  });

  it("lets GEMINI_CHAT_MODEL choose the Gemini model for every call", () => {
    expect(aiProvider(env({ GEMINI_API_KEY: "g", GEMINI_CHAT_MODEL: "gemini-3.6-flash" }))!.model("google/gemini-3-flash-preview")).toBe("gemini-3.6-flash");
  });

  it("falls back to Lovable's gateway unchanged, and to nothing without either key", () => {
    const p = aiProvider(env({ LOVABLE_API_KEY: "k" }))!;
    expect(p.kind).toBe("lovable");
    expect(p.chatUrl).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
    expect(p.model("google/gemini-3-flash-preview")).toBe("google/gemini-3-flash-preview");
    expect(aiProvider(env({ GEMINI_API_KEY: "  " }))).toBeNull();
    expect(() => requireAiProvider(env({}))).toThrow(/GEMINI_API_KEY/);
  });
});

describe("every AI call goes through the provider", () => {
  const root = resolve(__dirname, "../../supabase/functions");
  const fns = ["listening-sweep", "discovery-seed-shows", "generate-learnings", "storefront-match", "discovery-match", "discovery-enrich",
    "submit-creator-story", "brief-import", "discovery-seed", "research-run"];
  it.each(fns)("%s has no hard-coded Lovable AI gateway or key", (fn) => {
    const src = readFileSync(resolve(root, fn, "index.ts"), "utf8");
    expect(src).not.toContain("ai.gateway.lovable.dev");
    expect(src).not.toMatch(/Deno\.env\.get\("LOVABLE_API_KEY"\)/);
    expect(src).toMatch(/ai-provider\.ts/);
  });
});
