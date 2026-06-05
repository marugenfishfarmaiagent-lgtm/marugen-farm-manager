import { getSessionToken } from './auth'
import { getFunctionsUrl, isSupabaseConfigured } from './supabase'

export async function sendChatMessage({ systemPrompt, messages }) {
  if (!isSupabaseConfigured) {
    throw new Error('AI Chat requires Supabase. Configure VITE_SUPABASE_URL and deploy the gemini-chat edge function.')
  }

  const token = getSessionToken()
  if (!token) throw new Error('Please log in to use AI Chat.')

  const response = await fetch(`${getFunctionsUrl()}/gemini-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'X-Session-Token': token,
    },
    body: JSON.stringify({ systemPrompt, messages }),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || `Edge function error: ${response.status}`)
  }
  return data.text
}
