import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  AI_DAILY_FREE_TOKENS,
  addDailyUsage,
  buildUsageMeta,
  getDailyRow,
  parseGeminiUsage,
  usageFlags,
} from "../_shared/aiUsage.ts";
import { sessionTokenFrom, validateSession } from "../_shared/supabase.ts";

const MODEL = "gemini-2.5-flash";
const rateMap = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

type ChatMessage = {
  role: string;
  content?: string;
  functionCalls?: { name: string; args: Record<string, unknown> }[];
  functionResponses?: { name: string; response: Record<string, unknown> }[];
};

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

function toGeminiContents(messages: ChatMessage[]) {
  const contents: { role: string; parts: Record<string, unknown>[] }[] = [];

  for (const m of messages) {
    if (m.functionCalls?.length) {
      contents.push({
        role: "model",
        parts: m.functionCalls.map((fc) => ({
          functionCall: { name: fc.name, args: fc.args || {} },
        })),
      });
      continue;
    }
    if (m.functionResponses?.length) {
      contents.push({
        role: "user",
        parts: m.functionResponses.map((fr) => ({
          functionResponse: { name: fr.name, response: fr.response },
        })),
      });
      continue;
    }
    if (m.role === "user" || m.role === "assistant") {
      contents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content || "" }],
      });
    }
  }

  if (contents.length > 0 && contents[0].role === "model" && !contents[0].parts[0]?.functionCall) {
    const first = contents[0].parts[0] as { text?: string };
    if (!first.text) contents.shift();
  }
  return contents;
}

async function checkDailyQuota(userId: number, confirmOverage: boolean) {
  const row = await getDailyRow(userId);
  if (row.total_tokens >= AI_DAILY_FREE_TOKENS && !confirmOverage) {
    return { blocked: true as const, usage: buildUsageMeta(row) };
  }
  return { blocked: false as const, usage: buildUsageMeta(row) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = sessionTokenFrom(req);
    const user = await validateSession(token);
    if (!user) return jsonResponse({ error: "Unauthorized — login required" }, 401);

    if (req.method === "GET") {
      const row = await getDailyRow(user.id);
      const flags = usageFlags(row.total_tokens);
      return jsonResponse({ usage: buildUsageMeta(row), ...flags });
    }

    if (!checkRateLimit(String(user.id))) {
      return jsonResponse({ error: "Rate limit exceeded. Try again shortly." }, 429);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return jsonResponse({ error: "GEMINI_API_KEY not set on server" }, 500);

    const body = await req.json();
    const { systemPrompt, messages, tools, confirmOverage } = body;

    const quota = await checkDailyQuota(user.id, Boolean(confirmOverage));
    if (quota.blocked) {
      return jsonResponse({
        requiresConfirm: true,
        usage: quota.usage,
        message: `You've used all ${(AI_DAILY_FREE_TOKENS / 1000).toFixed(0)}k free AI tokens today. Continue anyway?`,
      });
    }

    const contents = toGeminiContents(messages || []);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    const payload: Record<string, unknown> = {
      systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
      contents,
      generationConfig: { maxOutputTokens: 2000, temperature: 0.55 },
    };

    if (tools?.length) {
      payload.tools = [{ functionDeclarations: tools }];
      payload.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      return jsonResponse({ error: data.error?.message || "Gemini API error" }, res.status);
    }

    const tokenDelta = parseGeminiUsage(data);
    const prevRow = await getDailyRow(user.id);
    const row = await addDailyUsage(user.id, tokenDelta);
    const usage = buildUsageMeta(row);
    const flags = usageFlags(row.total_tokens, prevRow.total_tokens);

    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.filter((p: { text?: string }) => p.text).map((p: { text: string }) => p.text).join("\n").trim();
    const functionCalls = parts
      .filter((p: { functionCall?: { name: string; args?: Record<string, unknown> } }) => p.functionCall)
      .map((p: { functionCall: { name: string; args?: Record<string, unknown> } }) => ({
        name: p.functionCall.name,
        args: p.functionCall.args || {},
      }));

    const base = { usage, lastCallTokens: tokenDelta.totalTokens, ...flags };

    if (functionCalls.length) {
      return jsonResponse({ functionCalls, text: text || undefined, ...base });
    }

    return jsonResponse({ text: text || "No response received.", ...base });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
});
