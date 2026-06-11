import * as db from './database'
import { isSupabaseConfigured } from './supabase'

const DISMISS_KEY = 'marugen_push_prompt_dismissed'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function isPushSupported() {
  return isSupabaseConfigured
    && typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

export function getPushPermission() {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

export function isPushPromptDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissPushPrompt() {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // ignore
  }
}

export async function getPushConfig() {
  if (!isPushSupported()) return { enabled: false, publicKey: null }
  try {
    return await db.getPushConfig()
  } catch {
    return { enabled: false, publicKey: null }
  }
}

async function waitForServiceWorker() {
  const reg = await navigator.serviceWorker.ready
  return reg
}

export async function subscribeToPush(publicKey) {
  const registration = await waitForServiceWorker()
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }
  return subscription
}

export async function enablePhoneNotifications() {
  if (!isPushSupported()) {
    return { ok: false, message: 'This browser does not support phone notifications.' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, message: 'Notification permission was denied.' }
  }

  const config = await getPushConfig()
  const publicKey = config.publicKey || import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!config.enabled || !publicKey) {
    return { ok: false, message: 'Push is not configured on the server yet. Ask the farm owner to set VAPID keys.' }
  }

  const subscription = await subscribeToPush(publicKey)
  await db.registerPushSubscription(subscription.toJSON())
  return { ok: true }
}

export async function disablePhoneNotifications() {
  if (!isPushSupported()) return { ok: true }
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (subscription) {
    const endpoint = subscription.endpoint
    await subscription.unsubscribe()
    try {
      await db.unregisterPushSubscription(endpoint)
    } catch {
      // local unsubscribe still counts
    }
  }
  return { ok: true }
}

export async function sendPushTest() {
  await db.sendPushTest()
}
