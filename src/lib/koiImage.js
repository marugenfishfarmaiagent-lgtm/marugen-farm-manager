import { compressImageFile } from './compressImage'

/** Read, auto-resize, and compress a koi / customer-koi photo before save. */
export async function readKoiImageFile(file) {
  const { dataUrl } = await compressImageFile(file, { defaultName: 'koi' })
  return dataUrl
}
