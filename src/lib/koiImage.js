import { compressReceiptImage } from './compressImage'

export async function readKoiImageFile(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Please choose an image file.')
  if (file.size > 2 * 1024 * 1024) throw new Error('Image too large. Max 2MB.')
  const { dataUrl } = await compressReceiptImage(file, { maxWidth: 900, quality: 0.82 })
  return dataUrl
}
