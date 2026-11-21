// Which AI the edge functions call: Google's Gemini API directly when a GEMINI_API_KEY secret is
// set, otherwise Lovable's AI gateway (LOVABLE_API_KEY) as before. Both take OpenAI-style chat
// requests, so a call site only swaps the URL, headers and model name from here. Pure apart from
// reading the environment, so tests can pass their own.
//
// GEMINI_CHAT_MODEL overrides the Gemini model (default: the same Gemini Flash model the Lovable
// gateway was asked for, so prompts behave as they did).

export type AiProvider = {
  kind: "gemini" | "lovable";
  apiKey: string;
  /** OpenAI-compatible chat completions URL. */
  chatUrl: string;
  headers: Record<string, string>;
  /** The model to send, given the Lovable-style name a call site was written with ("google/gemini-3-flash-preview"). */
  model: (lovableName: string) => string;
};

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const LOVABLE_BASE = "https://ai.gateway.lovable.dev/v1";
export const DEFAULT_GEMINI_CHAT_MODEL = "gemini-3-flash-preview";

type Env = (name: string) => string | undefined;
const denoEnv: Env = (name) => {
  try {
    return (globalThis as { Deno?: { env: { get: (n: string) => string | undefined } } }).Deno?.env.get(name);
  } catch {
    return undefined;
  }
};

/** The provider to use, or null when neither key is set. */
export function aiProvider(env: Env = denoEnv): AiProvider | null {
  const gemini = env("GEMINI_API_KEY")?.trim();
  if (gemini) {
    const chosen = env("GEMINI_CHAT_MODEL")?.trim();
    return {
      kind: "gemini",
      apiKey: gemini,
      chatUrl: `${GEMINI_BASE}/openai/chat/completions`,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${gemini}` },
      // Gemini's own ids have no "google/" prefix; a non-Gemini model name falls back to the default.
      model: (name) => chosen || (name.startsWith("google/gemini") ? name.slice("google/".length) : DEFAULT_GEMINI_CHAT_MODEL),
    };
  }
  const lovable = env("LOVABLE_API_KEY")?.trim();
  if (lovable) {
    return {
      kind: "lovable",
      apiKey: lovable,
      chatUrl: `${LOVABLE_BASE}/chat/completions`,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovable}` },
      model: (name) => name,
    };
  }
  return null;
}

/** A provider that is certainly set: for call sites that used to assume LOVABLE_API_KEY. */
export function requireAiProvider(env: Env = denoEnv): AiProvider {
  const p = aiProvider(env);
  if (!p) throw new Error("No AI is configured: set GEMINI_API_KEY (or LOVABLE_API_KEY).");
  return p;
}
