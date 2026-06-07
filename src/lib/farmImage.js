/** Client helpers for private Storage paths and signed URL sync. */

export function isInlineImage(src) {
  return typeof src === 'string' && src.startsWith('data:image')
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
