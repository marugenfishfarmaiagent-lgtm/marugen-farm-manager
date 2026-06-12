/** Client helpers for private Storage paths and signed URL sync. */

import { hasCloudSession } from './auth'
import { isSupabaseConfigured } from './supabase'

export function isInlineImage(src) {
  return typeof src === 'string' && src.startsWith('data:image')
}

/** Private Storage object path (persisted in Postgres — not a displayable URL). */
export function isStoragePath(src) {
  return typeof src === 'string' && src.length > 0
    && !src.startsWith('http://')
    && !src.startsWith('https://')
    && !src.startsWith('data:')
}

/** Upload a base64 photo to cloud storage before save/sync; returns signed URL or original src. */
export async function uploadInlinePhotoIfNeeded(src, uploadFn) {
  if (!src || !isInlineImage(src)) return src ?? null
  if (!isSupabaseConfigured) return src
  if (!hasCloudSession()) {
    throw new Error('Session expired. Log out and log in again, then retry.')
  }
  const result = await uploadFn(src)
  // Persist storage path in app state — signed URLs expire (~4h).
  if (result?.path) return result.path
  const url = result?.url || result?.imageUrl
  if (!url) throw new Error('Cloud photo upload failed. Check connection and try again.')
  return url
}

/** Keep the image reference that survives sync and signed-URL expiry. */
export function pickPersistedImageRef(localRef, remoteRef) {
  if (!localRef && !remoteRef) return null
  if (!localRef) return remoteRef
  if (!remoteRef) return localRef
  if (isStoragePath(localRef)) return localRef
  if (isStoragePath(remoteRef)) return remoteRef
  if (isInlineImage(localRef)) return localRef
  if (isInlineImage(remoteRef)) return remoteRef
  return remoteRef
}

export function normalizeKoiFishForCache(koi) {
  if (!koi?.id) return koi
  return {
    ...koi,
    photo: normalizeImageFieldForSync(koi.photo, storagePaths.koiFishPhoto(koi.id)) ?? koi.photo ?? null,
    deathPhoto: normalizeImageFieldForSync(koi.deathPhoto, storagePaths.koiFishDeathPhoto(koi.id)) ?? koi.deathPhoto ?? null,
  }
}

const KOI_PHOTOS_BUCKET = 'koi-photos'

/** Pull `koi-fish/.../photo.jpg` out of an expiring signed URL. */
export function extractStoragePathFromUrl(url, bucketId = KOI_PHOTOS_BUCKET) {
  if (!isSignedHttpUrl(url)) return null
  const match = url.match(new RegExp(`/${bucketId}/([^?]+)`))
  return match?.[1] ?? null
}

/** Stable storage reference when copying a farm koi photo onto a customer koi record. */
export function resolvePhotoRefFromKoi(photo, koiId) {
  if (!photo) return null
  if (isInlineImage(photo) || isStoragePath(photo)) return photo
  if (isSignedHttpUrl(photo)) {
    const extracted = extractStoragePathFromUrl(photo)
    if (extracted) return extracted
    if (koiId) return storagePaths.koiFishPhoto(koiId)
  }
  return null
}

export function normalizeCustomerKoiPhotoForSync(photo, { koiId, customerKoiId }) {
  if (!photo) return null
  if (isStoragePath(photo) || isInlineImage(photo)) return photo
  if (isSignedHttpUrl(photo)) {
    const extracted = extractStoragePathFromUrl(photo)
    if (extracted) return extracted
    if (koiId) return storagePaths.koiFishPhoto(koiId)
    return storagePaths.customerKoiPhoto(customerKoiId)
  }
  return photo
}

export function normalizeCustomerKoiForCache(record) {
  if (!record?.id) return record
  return {
    ...record,
    photo: normalizeCustomerKoiPhotoForSync(record.photo, {
      koiId: record.koiId,
      customerKoiId: record.id,
    }) ?? record.photo ?? null,
    deathPhoto: normalizeImageFieldForSync(record.deathPhoto, storagePaths.customerKoiDeathPhoto(record.id))
      ?? record.deathPhoto ?? null,
  }
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
  deliveryPhoto: (id) => `deliveries/${String(id)}/photo.jpg`,
  koiFishPhoto: (id) => `koi-fish/${String(id)}/photo.jpg`,
  koiFishDeathPhoto: (id) => `koi-fish/${String(id)}/death.jpg`,
  customerKoiPhoto: (id) => `customer-koi/${String(id)}/photo.jpg`,
  customerKoiDeathPhoto: (id) => `customer-koi/${String(id)}/death.jpg`,
}
