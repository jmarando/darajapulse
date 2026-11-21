// Calls to the Lovable AI gateway for consumer research: chat (text, images, video) and
// embeddings. No Deno APIs, so tests run it with a stand-in fetch.
//
// The gateway's docs name the models but not every request shape, so the two that aren't
// pinned down are tried in order and the one that works is remembered for the rest of the
// run: video goes as a `video_url` part, then as an `image_url` part with a video data URL;
// if neither is taken the caller falls back to key frames. Embeddings try Gemini Embedding 2,
// then Gemini Embedding 001, and report which model made the vectors, because an answer can
// only be compared with anchors embedded by the same model.

export const GATEWAY = "https://ai.gateway.lovable.dev/v1";
export const CHAT_MODEL = "google/gemini-3-flash-preview";
export const EMBEDDING_MODELS = ["google/gemini-embedding-2", "google/gemini-embedding-001"];

export type Part =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video"; dataUrl: string };

export type Message = { role: "system" | "user"; content: string | Part[] };

/** The gateway said the workspace is out of AI credits (402) or busy (429): stop and come back later. */
export class GatewayPause extends Error {
  constructor(public status: 402 | 429, message: string) {
    super(message);
  }
}

/** The gateway refused the request's shape (400/415/422): the caller may try another way. */
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

export type Gateway = {
  chatJson: (messages: Message[], opts?: { timeoutMs?: number }) => Promise<unknown>;
  embed: (texts: string[]) => Promise<{ model: string; vectors: number[][] }>;
  /** Which video shape the gateway took, once known. */
  videoShape: () => "video_url" | "image_url" | "none" | null;
};

const VIDEO_SHAPES = ["video_url", "image_url"] as const;

function wirePart(p: Part, videoShape: (typeof VIDEO_SHAPES)[number]): unknown {
  if (p.type !== "video") return p;
  return videoShape === "video_url"
    ? { type: "video_url", video_url: { url: p.dataUrl } }
    : { type: "image_url", image_url: { url: p.dataUrl } };
}

async function failure(res: Response): Promise<Error> {
  const text = (await res.text().catch(() => "")).slice(0, 200);
  if (res.status === 402) return new GatewayPause(402, "The AI workspace is out of credits.");
  if (res.status === 429) return new GatewayPause(429, "The AI gateway is busy.");
  if ([400, 404, 415, 422].includes(res.status)) return new GatewayRejected(res.status, `AI gateway ${res.status}: ${text}`);
  return new Error(`AI gateway ${res.status}: ${text}`);
}

export function gateway(apiKey: string, fetcher: Fetch = fetch): Gateway {
  let videoShape: (typeof VIDEO_SHAPES)[number] | "none" | null = null;
  let embeddingModel: string | null = null;

  const post = (path: string, body: unknown, timeoutMs: number) =>
    fetcher(`${GATEWAY}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: timeoutSignal(timeoutMs),
      body: JSON.stringify(body),
    });

  async function chatOnce(messages: Message[], shape: (typeof VIDEO_SHAPES)[number], timeoutMs: number): Promise<unknown> {
    const wire = messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : m.content.map((p) => wirePart(p, shape)),
    }));
    const res = await post("/chat/completions", { model: CHAT_MODEL, response_format: { type: "json_object" }, messages: wire }, timeoutMs);
    if (!res.ok) throw await failure(res);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("The AI gave an empty reply.");
    return content;
  }

  const hasVideo = (messages: Message[]) =>
    messages.some((m) => typeof m.content !== "string" && m.content.some((p) => p.type === "video"));

  return {
    videoShape: () => videoShape,
    async chatJson(messages, opts = {}) {
      const timeoutMs = opts.timeoutMs ?? 60_000;
      if (!hasVideo(messages)) return chatOnce(messages, "video_url", timeoutMs);
      if (videoShape === "none") throw new GatewayRejected(400, "The AI gateway does not take video.");
      const shapes = videoShape ? [videoShape] : [...VIDEO_SHAPES];
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
      throw last ?? new GatewayRejected(400, "The AI gateway does not take video.");
    },
    async embed(texts) {
      if (!texts.length) return { model: embeddingModel ?? EMBEDDING_MODELS[0], vectors: [] };
      const models = embeddingModel ? [embeddingModel] : EMBEDDING_MODELS;
      let last: unknown = null;
      for (const model of models) {
        const res = await post("/embeddings", { model, input: texts }, 60_000);
        if (!res.ok) {
          const err = await failure(res);
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
