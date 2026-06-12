import { MAX_CHAT_IMAGES } from './chatImage'
import { isSupabaseConfigured } from './supabase'

export const CHAT_HISTORY_MAX = 50
export const MAX_CHAT_MESSAGE_CHARS = 4000
export const CHAT_UNAVAILABLE_MESSAGE = 'Supabase and gemini-chat must be configured for AI Chat.'
export const CHAT_NETWORK_MESSAGE = 'Cannot reach the AI server. Check your connection, then tap Retry — your message is saved.'
export const CHAT_BUSY_MESSAGE = 'Gemini is busy right now (high demand). Wait a few seconds and tap Retry — your message is saved.'

/** QA on production: ?chatSimulate=unavailable | ?chatSimulate=retry */
export function getChatSimulateMode() {
  if (typeof window === 'undefined') return null
  const mode = new URLSearchParams(window.location.search).get('chatSimulate')
  return mode === 'unavailable' || mode === 'retry' ? mode : null
}

export function isChatUnavailable() {
  if (getChatSimulateMode() === 'unavailable') return true
  return !isSupabaseConfigured
}

export function chatError(message, { retryable = false } = {}) {
  return Object.assign(new Error(message), { retryable })
}

export function validateChatOutgoingMessage({ text, images = [] }) {
  const imageCount = images?.length || 0
  if (!text?.trim() && imageCount === 0) {
    return { ok: false, message: 'Type a message or attach a photo.' }
  }
  if (imageCount > MAX_CHAT_IMAGES) {
    return { ok: false, message: `You can attach up to ${MAX_CHAT_IMAGES} photos per message.` }
  }
  if (text && text.length > MAX_CHAT_MESSAGE_CHARS) {
    return { ok: false, message: `Message is too long (max ${MAX_CHAT_MESSAGE_CHARS} characters).` }
  }
  return {
    ok: true,
    content: text?.trim() || (imageCount ? 'Please look at this photo.' : ''),
  }
}

/** Strip UI-only fields before sending history to Gemini. */
export function sanitizeThreadMessageForApi(message) {
  if (!message || (message.role !== 'user' && message.role !== 'assistant')) return null
  if (message.retryable) return null

  if (message.functionCalls?.length) {
    return { role: 'assistant', functionCalls: message.functionCalls }
  }
  if (message.functionResponses?.length) {
    return { role: 'user', functionResponses: message.functionResponses }
  }

  const content = String(message.content || '').trim()
  const images = Array.isArray(message.images) ? message.images : undefined
  if (!content && !images?.length) return null

  return {
    role: message.role,
    content,
    ...(images?.length ? { images } : {}),
  }
}

export function buildChatApiThread(messages, userMsg) {
  const prior = (messages || [])
    .map(sanitizeThreadMessageForApi)
    .filter(Boolean)
  const next = sanitizeThreadMessageForApi(userMsg)
  if (!next) return prior.slice(-CHAT_HISTORY_MAX)
  return [...prior, next].slice(-CHAT_HISTORY_MAX)
}

export function formatActionResults(executed = []) {
  if (!executed?.length) return ''
  return executed
    .map((a) => (a.success ? `✓ ${a.message || a.name}` : `✗ ${a.error || a.name}`))
    .join('\n')
}

export function buildAssistantReplyText(result) {
  if (result?.text?.trim()) return result.text.trim()
  if (result?.executed?.length) return formatActionResults(result.executed)
  return 'Done.'
}

export function slimChatMessageForStorage(message) {
  const { images, ...rest } = message
  if (images?.length) {
    return {
      ...rest,
      hadImages: true,
      content: rest.content?.trim() || '📷 Photo',
    }
  }
  return rest
}

export function sanitizeStoredChatMessages(parsed) {
  if (!Array.isArray(parsed)) return null
  const clean = parsed
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant')
      && ((typeof m.content === 'string' && m.content.trim()) || m.hadImages))
    .map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.hadImages ? { hadImages: true } : {}),
      ...(Array.isArray(m.executed) && m.executed.length ? { executed: m.executed } : {}),
    }))
  return clean.length ? clean.slice(-CHAT_HISTORY_MAX) : null
}
