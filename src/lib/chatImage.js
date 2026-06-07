import { compressReceiptImage } from './compressImage'

export const MAX_CHAT_IMAGES = 3
const MAX_CHAT_IMAGE_BYTES = 8 * 1024 * 1024

/** Compress a photo for AI chat (vision) — keeps tokens reasonable. */
export async function readChatImageFile(file) {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('Please choose an image file (JPG, PNG, etc.).')
  }
  if (file.size > MAX_CHAT_IMAGE_BYTES) {
    throw new Error('Image is too large. Please use a photo under 8 MB.')
  }
  const { dataUrl } = await compressReceiptImage(file, { maxWidth: 1200, quality: 0.8 })
  return dataUrl
}
