import { compressImageFile, IMAGE_COMPRESS } from './compressImage'

export const MAX_CHAT_IMAGES = 3

/** Compress a photo for AI chat (vision) — keeps tokens reasonable. */
export async function readChatImageFile(file) {
  const { dataUrl } = await compressImageFile(file, {
    defaultName: 'chat',
    maxWidth: 1200,
    maxHeight: 1200,
    maxOutputBytes: 512 * 1024,
    maxInputBytes: IMAGE_COMPRESS.MAX_INPUT_BYTES,
    initialQuality: 0.8,
  })
  return dataUrl
}
