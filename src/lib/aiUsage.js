import { today } from '../data/constants'

/** Daily free token budget per user — must match supabase/functions/_shared/aiUsage.ts */
export const AI_DAILY_FREE_TOKENS = 100_000
export const AI_WARN_AT_TOKENS = 80_000

export function formatTokens(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  return String(v)
}

function storageKey(userId) {
  return `marugen_ai_tokens_${today()}_${userId}`
}

export function getLocalTokenUsage(userId) {
  try {
    return parseInt(localStorage.getItem(storageKey(userId)) || '0', 10) || 0
  } catch {
    return 0
  }
}

export function addLocalTokenUsage(userId, tokens) {
  const next = getLocalTokenUsage(userId) + (tokens || 0)
  localStorage.setItem(storageKey(userId), String(next))
  return next
}

export function buildUsageMeta(tokens, extra = {}) {
  return {
    unit: 'tokens',
    tokens,
    inputTokens: extra.inputTokens ?? 0,
    outputTokens: extra.outputTokens ?? 0,
    requests: extra.requests ?? 0,
    limit: AI_DAILY_FREE_TOKENS,
    warnAt: AI_WARN_AT_TOKENS,
    remaining: Math.max(0, AI_DAILY_FREE_TOKENS - tokens),
    overFreeLimit: tokens > AI_DAILY_FREE_TOKENS,
  }
}

export function checkLocalUsage(userId, confirmOverage = false) {
  const tokens = getLocalTokenUsage(userId)
  if (tokens >= AI_DAILY_FREE_TOKENS && !confirmOverage) {
    return { allowed: false, requiresConfirm: true, usage: buildUsageMeta(tokens) }
  }
  return { allowed: true, usage: buildUsageMeta(tokens) }
}
