import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sessionTokenFrom, validateSession } from "../_shared/supabase.ts";

const MODEL = "gemini-2.5-flash";
const rateMap = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || now > entry.reset) {
    rateMap.set(key, { count: 1, reset: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function toGeminiContents(messages: { role: string; content: string }[]) {
  const contents = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  if (contents.length > 0 && contents[0].role === "model") contents.shift();
  return contents;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = sessionTokenFrom(req);
    const user = await validateSession(token);
    if (!user) return jsonResponse({ error: "Unauthorized — login required" }, 401);
    if (!checkRateLimit(String(user.id))) {
      return jsonResponse({ error: "Rate limit exceeded. Try again shortly." }, 429);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return jsonResponse({ error: "GEMINI_API_KEY not set on server" }, 500);

    const { systemPrompt, messages } = await req.json();
    const contents = toGeminiContents(messages || []);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        contents,
        generationConfig: { maxOutputTokens: 1000, temperature: 0.7 },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return jsonResponse({ error: data.error?.message || "Gemini API error" }, res.status);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response received.";
    return jsonResponse({ text });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
});
