import { clearSession, fetchWithSessionRetry, getAuthHeaders, getSessionToken, hasCloudSession } from './auth'
import { getFunctionsUrl, isSupabaseConfigured } from './supabase'
import {
  CHAT_BUSY_MESSAGE,
  CHAT_HISTORY_MAX,
  CHAT_NETWORK_MESSAGE,
  CHAT_UNAVAILABLE_MESSAGE,
  chatError,
  isChatUnavailable,
} from './chatOps'

const RETRYABLE_CHAT = /high demand|overloaded|resource.?exhausted|unavailable|try again|rate limit|too many requests/i

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function friendlyGeminiError(data, status) {
  const raw = data?.error || `Edge function error: ${status}`
  if (RETRYABLE_CHAT.test(raw) || data?.retryable === true) {
    return {
      message: CHAT_BUSY_MESSAGE,
      retryable: data?.retryable !== false,
    }
  }
  return { message: raw, retryable: false }
}

function chatHeaders() {
  return getAuthHeaders({ 'Content-Type': 'application/json' })
}

async function callGeminiChat(body, { method = 'POST' } = {}) {
  if (isChatUnavailable()) {
    throw chatError(CHAT_UNAVAILABLE_MESSAGE, { retryable: false })
  }
  if (isSupabaseConfigured && !hasCloudSession()) {
    throw chatError('Please log in to use AI Chat.', { retryable: false })
  }
  const token = getSessionToken()
  if (!isSupabaseConfigured && !token) {
    throw chatError('Please log in to use AI Chat.', { retryable: false })
  }

  const maxAttempts = method === 'POST' ? 2 : 1
  let lastErr = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let response
    try {
      response = await fetchWithSessionRetry(`${getFunctionsUrl()}/gemini-chat`, {
        method,
        credentials: 'include',
        headers: chatHeaders(),
        body: method === 'POST' ? JSON.stringify(body) : undefined,
      })
    } catch {
      throw chatError(CHAT_NETWORK_MESSAGE, { retryable: true })
    }

    let data
    try {
      data = await response.json()
    } catch {
      throw chatError('Invalid response from AI server.', { retryable: true })
    }
    if (response.status === 401) {
      clearSession()
      throw chatError('Session expired. Please log in again.', { retryable: false })
    }
    if (response.ok || data.requiresConfirm) return data

    const { message, retryable } = friendlyGeminiError(data, response.status)
    lastErr = chatError(message, { retryable })
    if (!retryable || attempt === maxAttempts - 1) throw lastErr
    await sleep(1200 * (attempt + 1))
  }

  throw lastErr || chatError('AI request failed.', { retryable: true })
}

export async function fetchAiUsage() {
  if (!isSupabaseConfigured) return null
  const data = await callGeminiChat({}, { method: 'GET' })
  return data.usage
}

export async function fetchAiUsageStats() {
  if (!isSupabaseConfigured) return null
  if (!hasCloudSession() && !getSessionToken()) throw new Error('Not authenticated')

  const res = await fetchWithSessionRetry(`${getFunctionsUrl()}/farm-api`, {
    method: 'POST',
    credentials: 'include',
    headers: chatHeaders(),
    body: JSON.stringify({ action: 'ai_usage_stats' }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load AI usage stats')
  return data
}

export async function sendChatMessage({
  systemPrompt,
  messages,
  tools,
  executeFunctions,
  confirmOverage = false,
}) {
  if (isChatUnavailable()) {
    throw chatError(CHAT_UNAVAILABLE_MESSAGE, { retryable: false })
  }
  if (!Array.isArray(messages) || !messages.length) {
    throw chatError('No messages to send.', { retryable: false })
  }
  if (!systemPrompt?.trim()) {
    throw chatError('AI context is missing. Refresh the page and try again.', { retryable: false })
  }

  let thread = [...messages].slice(-CHAT_HISTORY_MAX)
  const executed = []
  const maxRounds = 5

  for (let round = 0; round < maxRounds; round++) {
    const data = await callGeminiChat({
      systemPrompt,
      messages: thread,
      tools,
      confirmOverage: round === 0 ? confirmOverage : true,
    })

    if (data.requiresConfirm) {
      return {
        requiresConfirm: true,
        usage: data.usage,
        message: data.message || `You've used all free AI tokens for today. Continue anyway?`,
        executed,
      }
    }

    if (!data.functionCalls?.length) {
      return {
        text: data.text || 'No response received.',
        executed,
        usage: data.usage,
        nearLimit: data.nearLimit,
        atFreeLimit: data.atFreeLimit,
        overFreeLimit: data.overFreeLimit,
      }
    }

    if (!executeFunctions) {
      throw chatError('AI requested actions but no executor is configured.', { retryable: false })
    }

    const results = executeFunctions(data.functionCalls)
    const pendingConfirm = results.filter((r) => r.response?.requiresConfirm)
    if (pendingConfirm.length) {
      return {
        requiresActionConfirm: true,
        confirmSummaries: pendingConfirm.map((r) => r.response.summary),
        resumeState: {
          thread,
          functionCalls: data.functionCalls,
          partialResults: results,
        },
        executed: [
          ...executed,
          ...results.filter((r) => !r.response?.requiresConfirm).map((r) => ({ name: r.name, ...r.response })),
        ],
        usage: data.usage,
        nearLimit: data.nearLimit,
        atFreeLimit: data.atFreeLimit,
        overFreeLimit: data.overFreeLimit,
      }
    }

    executed.push(...results.map((r) => ({ name: r.name, ...r.response })))

    thread = [
      ...thread,
      { role: 'assistant', functionCalls: data.functionCalls },
      { role: 'user', functionResponses: results },
    ]
  }

  throw chatError('AI action loop limit reached. Please try again.', { retryable: true })
}
