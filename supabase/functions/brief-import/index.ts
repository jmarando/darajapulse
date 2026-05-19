// Parses a pasted text OR uploaded brief doc (PDF/DOCX/TXT) and returns
// structured brief fields the UI can drop into the editor.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function extractTextFromBuffer(buf: Uint8Array, name: string): Promise<string> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    return new TextDecoder().decode(buf);
  }
  if (lower.endsWith(".docx")) {
    const mammoth = await import("npm:mammoth@1.8.0");
    const result = await mammoth.extractRawText({ buffer: buf as any });
    return result.value || "";
  }
  if (lower.endsWith(".pdf")) {
    // pdfjs-dist is reliable in Deno
    const pdfjs: any = await import("npm:pdfjs-dist@4.0.379/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({ data: buf, useSystemFonts: true, disableFontFace: true });
    const doc = await loadingTask.promise;
    let out = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      out += content.items.map((it: any) => it.str).join(" ") + "\n";
    }
    return out;
  }
  // Fallback: try as text
  return new TextDecoder().decode(buf);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    let text: string = (body.text || "").toString();
    const storagePath: string | undefined = body.storage_path;
    const fileName: string | undefined = body.file_name;

    if (!text && storagePath) {
      const { data: dl, error } = await supabase.storage.from("brief-docs").download(storagePath);
      if (error || !dl) {
        return new Response(JSON.stringify({ error: "Could not read uploaded file: " + (error?.message || "unknown") }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const buf = new Uint8Array(await dl.arrayBuffer());
      try {
        text = await extractTextFromBuffer(buf, fileName || storagePath);
      } catch (e) {
        console.error("extract error", e);
        return new Response(JSON.stringify({ error: "Could not extract text from this file. Try a .docx, .pdf, or paste the text." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    text = text.replace(/\s+\n/g, "\n").trim();
    if (!text || text.length < 30) {
      return new Response(JSON.stringify({ error: "Not enough text to import. Paste the brief or upload a readable document." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Cap to keep prompts cheap
    if (text.length > 25000) text = text.slice(0, 25000);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You convert a raw influencer-marketing brief document into structured fields for a campaign brief library. Be faithful to the source — do NOT invent. If a field is not present, leave it empty/[]. Hashtags should keep the '#' prefix; mentions keep '@'. Lists must be short, action-oriented bullets (max ~12 words each). Tone & content_format should be one short line." },
          { role: "user", content: `Brief document:\n\n${text}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_brief",
            description: "Save the extracted brief fields.",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "Short brief name, ~5 words" },
                objective: { type: "string" },
                brief: { type: "string", description: "1-2 paragraph background/story" },
                hashtag: { type: "string", description: "Primary campaign hashtag with #" },
                content_format: { type: "string" },
                tone: { type: "string" },
                dos: { type: "array", items: { type: "string" } },
                donts: { type: "array", items: { type: "string" } },
                mandatory_mentions: { type: "array", items: { type: "string" } },
                hashtags_extra: { type: "array", items: { type: "string" } },
              },
              required: ["objective", "brief", "dos", "donts"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "save_brief" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await aiResp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) {
      return new Response(JSON.stringify({ error: "AI did not return structured fields" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let fields: any = {};
    try { fields = JSON.parse(call.function.arguments); } catch { fields = {}; }

    return new Response(JSON.stringify({ fields }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
