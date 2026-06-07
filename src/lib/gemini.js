import { clearSession, getSessionToken } from './auth'
import { getFunctionsUrl, isSupabaseConfigured } from './supabase'

const RETRYABLE_CHAT = /high demand|overloaded|resource.?exhausted|unavailable|try again|rate limit|too many requests/i

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function friendlyGeminiError(data, status) {
  const raw = data?.error || `Edge function error: ${status}`
  if (RETRYABLE_CHAT.test(raw)) {
    return {
      message: 'Gemini is busy right now (high demand). Wait a few seconds and tap Retry — your message is saved.',
      retryable: data?.retryable !== false,
    }
  }
  return { message: raw, retryable: Boolean(data?.retryable) }
}

async function callGeminiChat(body, { method = 'POST' } = {}) {
  const token = getSessionToken()
  if (!token) throw new Error('Please log in to use AI Chat.')

  const maxAttempts = method === 'POST' ? 2 : 1
  let lastErr = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`${getFunctionsUrl()}/gemini-chat`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Session ${token}`,
      },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    })

    const data = await response.json()
    if (response.status === 401) {
      clearSession()
      throw new Error('Session expired. Please log in again.')
    }
    if (response.ok || data.requiresConfirm) return data

    const { message, retryable } = friendlyGeminiError(data, response.status)
    lastErr = Object.assign(new Error(message), { retryable })
    if (!retryable || attempt === maxAttempts - 1) throw lastErr
    await sleep(1200 * (attempt + 1))
  }

  throw lastErr || new Error('AI request failed.')
}

export async function fetchAiUsage() {
  if (!isSupabaseConfigured) return null
  const data = await callGeminiChat({}, { method: 'GET' })
  return data.usage
}

export async function fetchAiUsageStats() {
  if (!isSupabaseConfigured) return null
  const token = getSessionToken()
  if (!token) throw new Error('Not authenticated')

  const res = await fetch(`${getFunctionsUrl()}/farm-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Session ${token}`,
    },
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
  if (!isSupabaseConfigured) {
    throw new Error('AI Chat requires Supabase. Configure VITE_SUPABASE_URL and deploy the gemini-chat edge function.')
  }

  let thread = [...messages]
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
      throw new Error('AI requested actions but no executor is configured.')
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

  throw new Error('AI action loop limit reached. Please try again.')
}

