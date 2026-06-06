import { clearSession, getSessionToken } from './auth'
import { getFunctionsUrl, isSupabaseConfigured } from './supabase'

async function callGeminiChat(body, { method = 'POST' } = {}) {
  const token = getSessionToken()
  if (!token) throw new Error('Please log in to use AI Chat.')

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
  if (!response.ok && !data.requiresConfirm) {
    throw new Error(data.error || `Edge function error: ${response.status}`)
  }
  return data
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
    executed.push(...results.map((r) => ({ name: r.name, ...r.response })))

    thread = [
      ...thread,
      { role: 'assistant', functionCalls: data.functionCalls },
      { role: 'user', functionResponses: results },
    ]
  }

  throw new Error('AI action loop limit reached. Please try again.')
}

