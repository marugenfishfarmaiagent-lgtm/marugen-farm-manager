import { adminClient } from "./supabase.ts";

/** Daily free token budget per user (Gemini input + output combined). */
export const AI_DAILY_FREE_TOKENS = 100_000;
export const AI_WARN_AT_TOKENS = 80_000;

export function todayUtc(): string {
  return new Date().toISOString().split("T")[0];
}

export type DailyUsageRow = {
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};

export type UsageMeta = {
  unit: "tokens";
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  limit: number;
  warnAt: number;
  remaining: number;
  overFreeLimit: boolean;
};

export function buildUsageMeta(row: DailyUsageRow): UsageMeta {
  const tokens = row.total_tokens;
  return {
    unit: "tokens",
    tokens,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    requests: row.request_count,
    limit: AI_DAILY_FREE_TOKENS,
    warnAt: AI_WARN_AT_TOKENS,
    remaining: Math.max(0, AI_DAILY_FREE_TOKENS - tokens),
    overFreeLimit: tokens > AI_DAILY_FREE_TOKENS,
  };
}

export async function getDailyRow(userId: number, date = todayUtc()): Promise<DailyUsageRow> {
  const db = adminClient();
  const { data } = await db
    .from("ai_usage_daily")
    .select("request_count, input_tokens, output_tokens, total_tokens")
    .eq("user_id", userId)
    .eq("usage_date", date)
    .maybeSingle();
  return {
    request_count: data?.request_count ?? 0,
    input_tokens: data?.input_tokens ?? 0,
    output_tokens: data?.output_tokens ?? 0,
    total_tokens: data?.total_tokens ?? 0,
  };
}

export type TokenDelta = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export async function addDailyUsage(userId: number, delta: TokenDelta): Promise<DailyUsageRow> {
  const db = adminClient();
  const date = todayUtc();
  const current = await getDailyRow(userId, date);
  const next: DailyUsageRow = {
    request_count: current.request_count + 1,
    input_tokens: current.input_tokens + delta.inputTokens,
    output_tokens: current.output_tokens + delta.outputTokens,
    total_tokens: current.total_tokens + delta.totalTokens,
  };

  const { error } = await db.from("ai_usage_daily").upsert(
    { user_id: userId, usage_date: date, ...next },
    { onConflict: "user_id,usage_date" },
  );
  if (error) throw error;
  return next;
}

export function usageFlags(tokens: number, prevTokens = 0) {
  return {
    nearLimit: tokens >= AI_WARN_AT_TOKENS && tokens < AI_DAILY_FREE_TOKENS,
    atFreeLimit: tokens >= AI_DAILY_FREE_TOKENS && prevTokens < AI_DAILY_FREE_TOKENS,
    overFreeLimit: tokens > AI_DAILY_FREE_TOKENS,
  };
}

export function parseGeminiUsage(data: Record<string, unknown>): TokenDelta {
  const meta = (data.usageMetadata || {}) as Record<string, number>;
  const inputTokens = meta.promptTokenCount ?? 0;
  const outputTokens = meta.candidatesTokenCount ?? 0;
  let totalTokens = meta.totalTokenCount ?? (inputTokens + outputTokens);
  if (!totalTokens) totalTokens = 500;
  return { inputTokens, outputTokens, totalTokens };
}

export async function fetchTodayUsageByUser() {
  const db = adminClient();
  const date = todayUtc();
  const [{ data: usage }, { data: users }] = await Promise.all([
    db.from("ai_usage_daily").select("user_id, request_count, input_tokens, output_tokens, total_tokens").eq("usage_date", date),
    db.from("farm_users").select("id, name, role, active"),
  ]);

  const byUser = new Map((usage || []).map((r) => [r.user_id, r]));
  return (users || [])
    .map((u) => {
      const row = byUser.get(u.id);
      return {
        userId: u.id,
        name: u.name,
        role: u.role,
        active: u.active !== false,
        tokens: row?.total_tokens ?? 0,
        inputTokens: row?.input_tokens ?? 0,
        outputTokens: row?.output_tokens ?? 0,
        requests: row?.request_count ?? 0,
      };
    })
    .sort((a, b) => b.tokens - a.tokens);
}

export async function fetchWeekUsageByUser() {
  const db = adminClient();
  const end = todayUtc();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 6);
  const startStr = start.toISOString().split("T")[0];

  const [{ data: usage }, { data: users }] = await Promise.all([
    db.from("ai_usage_daily")
      .select("user_id, request_count, input_tokens, output_tokens, total_tokens")
      .gte("usage_date", startStr)
      .lte("usage_date", end),
    db.from("farm_users").select("id, name, role"),
  ]);

  const totals = new Map<number, { tokens: number; requests: number; input: number; output: number }>();
  for (const row of usage || []) {
    const cur = totals.get(row.user_id) ?? { tokens: 0, requests: 0, input: 0, output: 0 };
    cur.tokens += row.total_tokens ?? 0;
    cur.requests += row.request_count ?? 0;
    cur.input += row.input_tokens ?? 0;
    cur.output += row.output_tokens ?? 0;
    totals.set(row.user_id, cur);
  }

  return (users || [])
    .map((u) => {
      const t = totals.get(u.id) ?? { tokens: 0, requests: 0, input: 0, output: 0 };
      return {
        userId: u.id,
        name: u.name,
        role: u.role,
        tokens: t.tokens,
        inputTokens: t.input,
        outputTokens: t.output,
        requests: t.requests,
      };
    })
    .sort((a, b) => b.tokens - a.tokens);
}
