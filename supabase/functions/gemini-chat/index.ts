import { checkRateLimit } from "../_shared/rateLimit.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import {
  AI_DAILY_FREE_TOKENS,
  addDailyUsage,
  buildUsageMeta,
  getDailyRow,
  parseGeminiUsage,
  usageFlags,
} from "../_shared/aiUsage.ts";
import { adminClient, sessionTokenFrom, hasPermission, validateSession } from "../_shared/supabase.ts";

const PRIMARY_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.5-flash-lite";
const MAX_GEMINI_ATTEMPTS = 4;
const RETRYABLE_GEMINI = /high demand|overloaded|resource.?exhausted|unavailable|try again|too many requests|deadline exceeded/i;
const MODEL_UNAVAILABLE = /no longer available|deprecated|not found|does not exist/i;

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const MAX_CHAT_HISTORY = 40;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiError(status: number, message: string): boolean {
  if (MODEL_UNAVAILABLE.test(message)) return false;
  if (status === 429 || status === 503 || status === 500 || status === 502 || status === 504) return true;
  return RETRYABLE_GEMINI.test(message);
}

type ChatMessage = {
  role: string;
  content?: string;
  images?: string[];
  functionCalls?: { name: string; args: Record<string, unknown> }[];
  functionResponses?: { name: string; response: Record<string, unknown> }[];
};

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
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
      const parts: Record<string, unknown>[] = [];
      for (const src of m.images || []) {
        const parsed = parseDataUrl(src);
        if (parsed) {
          parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.data } });
        }
      }
      const text = (m.content || "").trim();
      if (text) {
        parts.push({ text });
      } else if (parts.length) {
        parts.push({ text: "Please look at the attached photo(s) and help with my Marugen farm request." });
      }
      if (parts.length) {
        contents.push({
          role: m.role === "assistant" ? "model" : "user",
          parts,
        });
      }
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
  if (req.method === "OPTIONS") return optionsResponse(req);

  const J = (payload: unknown, status = 200) => jsonResponse(payload, status, req);

  try {
    const db = adminClient();
    const token = sessionTokenFrom(req);
    const user = await validateSession(token);
    if (!user) return J({ error: "Unauthorized — login required" }, 401);
    if (!hasPermission(user, "chat")) {
      return J({ error: "Permission denied (chat)" }, 403);
    }

    if (req.method === "GET") {
      const row = await getDailyRow(user.id);
      const flags = usageFlags(row.total_tokens);
      return J({ usage: buildUsageMeta(row), ...flags });
    }

    if (!(await checkRateLimit(db, `gemini:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS))) {
      return J({ error: "Rate limit exceeded. Try again shortly." }, 429);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return J({ error: "GEMINI_API_KEY not set on server" }, 500);

    const body = await req.json();
    const { systemPrompt, messages, tools, confirmOverage } = body;

    const quota = await checkDailyQuota(user.id, Boolean(confirmOverage));
    if (quota.blocked) {
      return J({
        requiresConfirm: true,
        usage: quota.usage,
        message: `You've used all ${(AI_DAILY_FREE_TOKENS / 1000).toFixed(0)}k free AI tokens today. Continue anyway?`,
      });
    }

    const history = Array.isArray(messages) ? messages.slice(-MAX_CHAT_HISTORY) : [];
    const contents = toGeminiContents(history);

    const payload: Record<string, unknown> = {
      systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
      contents,
      generationConfig: { maxOutputTokens: 2000, temperature: 0.55 },
    };

    if (tools?.length) {
      payload.tools = [{ functionDeclarations: tools }];
      payload.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
    }

    let data: Record<string, unknown> = {};
    let lastError = "Gemini API error";
    let lastStatus = 500;

    for (let attempt = 0; attempt < MAX_GEMINI_ATTEMPTS; attempt++) {
      const model = attempt >= 2 ? FALLBACK_MODEL : PRIMARY_MODEL;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      data = await res.json();
      if (res.ok && !data.error) break;

      lastError = (data.error as { message?: string })?.message || "Gemini API error";
      lastStatus = res.status || 500;
      const retryable = isRetryableGeminiError(lastStatus, lastError);
      if (!retryable || attempt === MAX_GEMINI_ATTEMPTS - 1) {
        return J({
          error: lastError,
          retryable,
          modelAttempted: model,
        }, lastStatus >= 400 ? lastStatus : 503);
      }
      await sleep(800 * (2 ** attempt));
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
      return J({ functionCalls, text: text || undefined, ...base });
    }

    return J({ text: text || "No response received.", ...base });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, req);
  }
});
