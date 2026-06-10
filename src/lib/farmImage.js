/** Client helpers for private Storage paths and signed URL sync. */

import { hasCloudSession } from './auth'
import { isSupabaseConfigured } from './supabase'

export function isInlineImage(src) {
  return typeof src === 'string' && src.startsWith('data:image')
}

/** Upload a base64 photo to cloud storage before save/sync; returns signed URL or original src. */
export async function uploadInlinePhotoIfNeeded(src, uploadFn) {
  if (!src || !isInlineImage(src)) return src ?? null
  if (!isSupabaseConfigured) return src
  if (!hasCloudSession()) {
    throw new Error('Session expired. Log out and log in again, then retry.')
  }
  const result = await uploadFn(src)
  const url = result?.url || result?.imageUrl
  if (!url) throw new Error('Cloud photo upload failed. Check connection and try again.')
  return url
}

export function isSignedHttpUrl(src) {
  return typeof src === 'string' && (src.startsWith('http://') || src.startsWith('https://'))
}

/** Send storage path to API — never persist expiring signed URLs. */
export function normalizeImageFieldForSync(value, storagePath) {
  if (!value) return null
  if (isSignedHttpUrl(value)) return storagePath
  return value
}

export const storagePaths = {
  expenseReceipt: (id) => `receipts/${String(id)}.jpg`,
  koiFishPhoto: (id) => `koi-fish/${String(id)}/photo.jpg`,
  koiFishDeathPhoto: (id) => `koi-fish/${String(id)}/death.jpg`,
  customerKoiPhoto: (id) => `customer-koi/${String(id)}/photo.jpg`,
  customerKoiDeathPhoto: (id) => `customer-koi/${String(id)}/death.jpg`,
}
