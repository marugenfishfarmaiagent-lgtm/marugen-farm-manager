const MAX_RECEIPT_BYTES = 10 * 1024 * 1024

/** Resize and compress receipt photos for local / cloud storage. */
export async function compressReceiptImage(file, { maxWidth = 1400, quality = 0.82 } = {}) {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('Please choose an image file (JPG, PNG, etc.).')
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new Error('Image is too large. Please use a photo under 10 MB.')
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process image.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not compress image.'))),
      'image/jpeg',
      quality,
    )
  })

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read image.'))
    reader.readAsDataURL(blob)
  })

  const name = (file.name || 'receipt').replace(/\.[^.]+$/, '') + '.jpg'
  return { dataUrl, blob, name }
}

export function expenseImageSrc(expense) {
  return expense?.imageUrl || expense?.imageData || ''
}
