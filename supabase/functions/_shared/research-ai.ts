// AI calls for consumer research: chat (text, images, video) and embeddings, through whichever
// provider _shared/ai-provider.ts picked. No Deno APIs, so tests run it with a stand-in fetch.
//
// Gemini directly (GEMINI_API_KEY): chat and images go to its OpenAI-compatible endpoint; video
// goes to its own generateContent API as inline data (that endpoint doesn't take video), and
// embeddings use its own batchEmbedContents with gemini-embedding-001, which returns one vector
// per text (Gemini Embedding 2 merges a list into one vector).
//
// Lovable's gateway: its docs name the models but not every request shape, so video goes as a
// `video_url` part, then as an `image_url` part with a video data URL; embeddings try Gemini
// Embedding 2, then 001. Whatever works is remembered for the run.
//
// Either way, a video the AI won't take falls back to key frames in the caller, and embeddings
// report which model made them, because an answer can only be compared with anchors embedded by
// the same model.
import { GEMINI_BASE, LOVABLE_BASE, type AiProvider } from "./ai-provider.ts";

export const CHAT_MODEL = "google/gemini-3-flash-preview";
export const LOVABLE_EMBEDDING_MODELS = ["google/gemini-embedding-2", "google/gemini-embedding-001"];
export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";

export type Part =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video"; dataUrl: string };

export type Message = { role: "system" | "user"; content: string | Part[] };

/** The provider said it is out of credits or quota (402) or busy (429): stop and come back later. */
export class GatewayPause extends Error {
  constructor(public status: 402 | 429, message: string) {
    super(message);
  }
}

/** The provider refused the request's shape (400/404/415/422): the caller may try another way. */
export class GatewayRejected extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Fetch = typeof fetch;

/** A signal that aborts after ms; AbortSignal.timeout where the runtime has it. */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

type VideoShape = "video_url" | "image_url" | "native";

export type Gateway = {
  chatJson: (messages: Message[], opts?: { timeoutMs?: number }) => Promise<unknown>;
  embed: (texts: string[]) => Promise<{ model: string; vectors: number[][] }>;
  /** Which video shape the provider took, once known; "none" when it took none. */
  videoShape: () => VideoShape | "none" | null;
};

function wirePart(p: Part, videoShape: "video_url" | "image_url"): unknown {
  if (p.type !== "video") return p;
  return videoShape === "video_url"
    ? { type: "video_url", video_url: { url: p.dataUrl } }
    : { type: "image_url", image_url: { url: p.dataUrl } };
}

async function failure(res: Response, who: string): Promise<Error> {
  const text = (await res.text().catch(() => "")).slice(0, 200);
  if (res.status === 402) return new GatewayPause(402, "The AI workspace is out of credits.");
  if (res.status === 429) return new GatewayPause(429, `${who} is busy or out of quota.`);
  if ([400, 404, 415, 422].includes(res.status)) return new GatewayRejected(res.status, `${who} ${res.status}: ${text}`);
  return new Error(`${who} ${res.status}: ${text}`);
}

/** "data:video/mp4;base64,AAA" as Gemini's inline data. */
export function inlineData(dataUrl: string): { inline_data: { mime_type: string; data: string } } | null {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  return m ? { inline_data: { mime_type: m[1], data: m[2] } } : null;
}

/** Messages as a Gemini generateContent body: system text as the system instruction, the rest as parts. */
export function nativeBody(messages: Message[]): unknown {
  const system = messages.filter((m) => m.role === "system").map((m) => (typeof m.content === "string" ? m.content : "")).join("\n\n");
  const parts: unknown[] = [];
  for (const m of messages.filter((x) => x.role !== "system")) {
    if (typeof m.content === "string") { parts.push({ text: m.content }); continue; }
    for (const p of m.content) {
      if (p.type === "text") parts.push({ text: p.text });
      else if (p.type === "image_url") parts.push(inlineData(p.image_url.url) ?? { text: "" });
      else parts.push(inlineData(p.dataUrl) ?? { text: "" });
    }
  }
  return {
    ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
    contents: [{ role: "user", parts }],
    generationConfig: { responseMimeType: "application/json" },
  };
}

export function gateway(provider: AiProvider, fetcher: Fetch = fetch): Gateway {
  const who = provider.kind === "gemini" ? "Gemini" : "AI gateway";
  const chatModel = provider.model(CHAT_MODEL);
  let videoShape: VideoShape | "none" | null = null;
  let embeddingModel: string | null = null;

  const post = (url: string, body: unknown, timeoutMs: number, headers = provider.headers) =>
    fetcher(url, { method: "POST", headers, signal: timeoutSignal(timeoutMs), body: JSON.stringify(body) });

  const geminiHeaders = { "Content-Type": "application/json", "x-goog-api-key": provider.apiKey };

  async function chatOnce(messages: Message[], shape: "video_url" | "image_url", timeoutMs: number): Promise<unknown> {
    const wire = messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : m.content.map((p) => wirePart(p, shape)),
    }));
    const res = await post(provider.chatUrl, { model: chatModel, response_format: { type: "json_object" }, messages: wire }, timeoutMs);
    if (!res.ok) throw await failure(res, who);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("The AI gave an empty reply.");
    return content;
  }

  async function nativeOnce(messages: Message[], timeoutMs: number): Promise<unknown> {
    const res = await post(`${GEMINI_BASE}/models/${chatModel}:generateContent`, nativeBody(messages), timeoutMs, geminiHeaders);
    if (!res.ok) throw await failure(res, who);
    const data = await res.json();
    const parts: unknown[] = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => (p as { text?: unknown })?.text).filter((t): t is string => typeof t === "string").join("");
    if (!text.trim()) throw new Error("The AI gave an empty reply.");
    return text;
  }

  const hasVideo = (messages: Message[]) =>
    messages.some((m) => typeof m.content !== "string" && m.content.some((p) => p.type === "video"));

  return {
    videoShape: () => videoShape,
    async chatJson(messages, opts = {}) {
      const timeoutMs = opts.timeoutMs ?? 60_000;
      if (!hasVideo(messages)) return chatOnce(messages, "video_url", timeoutMs);
      if (videoShape === "none") throw new GatewayRejected(400, "The AI does not take video.");
      if (provider.kind === "gemini") {
        try {
          const out = await nativeOnce(messages, timeoutMs);
          videoShape = "native";
          return out;
        } catch (e) {
          if (e instanceof GatewayRejected) videoShape = "none";
          throw e;
        }
      }
      const shapes: ("video_url" | "image_url")[] = videoShape === "video_url" || videoShape === "image_url" ? [videoShape] : ["video_url", "image_url"];
      let last: unknown = null;
      for (const shape of shapes) {
        try {
          const out = await chatOnce(messages, shape, timeoutMs);
          videoShape = shape;
          return out;
        } catch (e) {
          if (!(e instanceof GatewayRejected)) throw e;
          last = e;
        }
      }
      videoShape = "none";
      throw last ?? new GatewayRejected(400, "The AI does not take video.");
    },
    async embed(texts) {
      if (provider.kind === "gemini") {
        if (!texts.length) return { model: GEMINI_EMBEDDING_MODEL, vectors: [] };
        const res = await post(`${GEMINI_BASE}/models/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`, {
          requests: texts.map((text) => ({ model: `models/${GEMINI_EMBEDDING_MODEL}`, content: { parts: [{ text }] } })),
        }, 60_000, geminiHeaders);
        if (!res.ok) throw await failure(res, who);
        const data = await res.json();
        const vectors = (Array.isArray(data?.embeddings) ? data.embeddings : []).map((e: { values?: unknown }) => (Array.isArray(e?.values) ? (e.values as number[]) : []));
        if (vectors.length !== texts.length || vectors.some((v: number[]) => !v.length)) {
          throw new Error(`The embedding reply had ${vectors.length} vectors for ${texts.length} texts.`);
        }
        return { model: GEMINI_EMBEDDING_MODEL, vectors };
      }
      if (!texts.length) return { model: embeddingModel ?? LOVABLE_EMBEDDING_MODELS[0], vectors: [] };
      const models = embeddingModel ? [embeddingModel] : LOVABLE_EMBEDDING_MODELS;
      let last: unknown = null;
      for (const model of models) {
        const res = await post(`${LOVABLE_BASE}/embeddings`, { model, input: texts }, 60_000);
        if (!res.ok) {
          const err = await failure(res, who);
          if (err instanceof GatewayRejected) { last = err; continue; }
          throw err;
        }
        const data = await res.json();
        const rows: unknown[] = Array.isArray(data?.data) ? data.data : Array.isArray(data?.embeddings) ? data.embeddings : [];
        const vectors = rows.map((r) => {
          const v = (r as { embedding?: unknown; vector?: unknown; values?: unknown })?.embedding
            ?? (r as { vector?: unknown }).vector ?? (r as { values?: unknown }).values;
          return Array.isArray(v) ? (v as number[]) : [];
        });
        // Rows can come back out of order; OpenAI-style replies number them.
        if (rows.every((r) => typeof (r as { index?: unknown })?.index === "number")) {
          const ordered: number[][] = [];
          rows.forEach((r, i) => (ordered[(r as { index: number }).index] = vectors[i]));
          vectors.splice(0, vectors.length, ...ordered);
        }
        if (vectors.length !== texts.length || vectors.some((v) => !v?.length)) {
          throw new Error(`The embedding reply had ${vectors.length} vectors for ${texts.length} texts.`);
        }
        embeddingModel = model;
        return { model, vectors };
      }
      throw last ?? new Error("No embedding model answered.");
    },
  };
}

/** Bytes as a base64 data URL, in chunks so a large video doesn't overflow the call stack. */
export function dataUrl(bytes: Uint8Array, mime: string): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:${mime};base64,${btoa(bin)}`;
}
