/** Shared client-side image compression (Canvas → JPEG) before cloud/local save. */

export const IMAGE_COMPRESS = {
  /** Reject raw camera rolls above this; compressed output is much smaller. */
  MAX_INPUT_BYTES: 25 * 1024 * 1024,
  /** Target max size for the JPEG sent to API / storage. */
  MAX_OUTPUT_BYTES: 1024 * 1024,
  MAX_WIDTH: 1280,
  MAX_HEIGHT: 1280,
  INITIAL_QUALITY: 0.82,
  MIN_QUALITY: 0.5,
  QUALITY_STEP: 0.08,
  MIN_DIMENSION: 640,
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i

export function isLikelyImageFile(file) {
  if (!file) return false
  if (file.type?.startsWith('image/')) return true
  return IMAGE_EXT.test(file.name || '')
}

function validateImageFile(file, maxInputBytes) {
  if (!isLikelyImageFile(file)) {
    throw new Error('Please choose an image file (JPG, PNG, etc.).')
  }
  if (file.size > maxInputBytes) {
    const mb = Math.round(maxInputBytes / (1024 * 1024))
    throw new Error(`Image is too large. Please use a photo under ${mb} MB.`)
  }
}

function loadHtmlImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read this image format. Try JPG or PNG.'))
    img.src = url
  })
}

/** createImageBitmap first; fall back to <img> for HEIC / odd mobile formats. */
async function loadImageBitmap(file) {
  try {
    return await createImageBitmap(file)
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = await loadHtmlImage(url)
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth || img.width
      canvas.height = img.naturalHeight || img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not process image.')
      ctx.drawImage(img, 0, 0)
      return await createImageBitmap(canvas)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

function scaledDimensions(bitmap, maxWidth, maxHeight) {
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height)
  return {
    width: Math.max(1, Math.round(bitmap.width * scale)),
    height: Math.max(1, Math.round(bitmap.height * scale)),
  }
}

function drawScaledBitmap(bitmap, maxWidth, maxHeight) {
  const { width, height } = scaledDimensions(bitmap, maxWidth, maxHeight)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process image.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not compress image.'))),
      'image/jpeg',
      quality,
    )
  })
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read compressed image.'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Resize + compress an image file to JPEG under maxOutputBytes.
 * @returns {Promise<{ dataUrl: string, blob: Blob, name: string, bytes: number }>}
 */
export async function compressImageFile(file, {
  maxWidth = IMAGE_COMPRESS.MAX_WIDTH,
  maxHeight = IMAGE_COMPRESS.MAX_HEIGHT,
  maxOutputBytes = IMAGE_COMPRESS.MAX_OUTPUT_BYTES,
  maxInputBytes = IMAGE_COMPRESS.MAX_INPUT_BYTES,
  initialQuality = IMAGE_COMPRESS.INITIAL_QUALITY,
  minQuality = IMAGE_COMPRESS.MIN_QUALITY,
  defaultName = 'image',
} = {}) {
  validateImageFile(file, maxInputBytes)

  const bitmap = await loadImageBitmap(file)
  let limitW = maxWidth
  let limitH = maxHeight
  let bestBlob = null

  try {
    while (true) {
      const canvas = drawScaledBitmap(bitmap, limitW, limitH)
      let quality = initialQuality

      while (quality >= minQuality) {
        const blob = await canvasToJpegBlob(canvas, quality)
        bestBlob = blob
        if (blob.size <= maxOutputBytes) {
          const base = (file.name || defaultName).replace(/\.[^.]+$/, '')
          const dataUrl = await blobToDataUrl(blob)
          return { dataUrl, blob, name: `${base}.jpg`, bytes: blob.size }
        }
        quality -= IMAGE_COMPRESS.QUALITY_STEP
      }

      if (limitW <= IMAGE_COMPRESS.MIN_DIMENSION && limitH <= IMAGE_COMPRESS.MIN_DIMENSION) {
        break
      }
      limitW = Math.max(IMAGE_COMPRESS.MIN_DIMENSION, Math.round(limitW * 0.85))
      limitH = Math.max(IMAGE_COMPRESS.MIN_DIMENSION, Math.round(limitH * 0.85))
    }

    if (!bestBlob) throw new Error('Could not compress image.')
    const base = (file.name || defaultName).replace(/\.[^.]+$/, '')
    const dataUrl = await blobToDataUrl(bestBlob)
    return { dataUrl, blob: bestBlob, name: `${base}.jpg`, bytes: bestBlob.size }
  } finally {
    bitmap.close?.()
  }
}

/** Expense receipt photos — same limits as farm/koi uploads. */
export async function compressReceiptImage(file, options = {}) {
  return compressImageFile(file, { defaultName: 'receipt', ...options })
}

export function expenseImageSrc(expense) {
  return expense?.imageUrl || expense?.imageData || ''
}

/** Delivery photos — same compression limits as receipts. */
export async function compressDeliveryPhoto(file, options = {}) {
  return compressImageFile(file, { defaultName: 'delivery', ...options })
}

export function deliveryPhotoSrc(delivery) {
  return delivery?.photo || delivery?.photoData || ''
}

export function formatCompressedSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(0)} KB`
}
