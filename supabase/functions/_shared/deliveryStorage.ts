import {
  deleteFarmImages,
  normalizePathForStorage,
  signFarmImageUrl,
  uploadFarmImage,
} from "./farmImageStorage.ts";

export const DELIVERY_PHOTOS_BUCKET = "delivery-photos";

export function deliveryPhotoPath(deliveryId: unknown): string {
  return `deliveries/${String(deliveryId)}/photo.jpg`;
}

export function normalizeDeliveryPhotoForStorage(value: string, deliveryId: unknown): string {
  return normalizePathForStorage(value, deliveryPhotoPath(deliveryId), DELIVERY_PHOTOS_BUCKET);
}

type StorageDb = ReturnType<typeof import("./supabase.ts").adminClient>;

export async function signDeliveryPhotoUrl(
  db: StorageDb,
  pathOrUrl: string,
  deliveryId?: unknown,
): Promise<string> {
  return signFarmImageUrl(db, DELIVERY_PHOTOS_BUCKET, pathOrUrl, deliveryPhotoPath(deliveryId));
}

export async function uploadDeliveryPhotoImage(
  db: StorageDb,
  deliveryId: unknown,
  imageBase64: string,
): Promise<string> {
  return uploadFarmImage(db, DELIVERY_PHOTOS_BUCKET, deliveryPhotoPath(deliveryId), imageBase64);
}

export async function deleteDeliveryPhoto(db: StorageDb, deliveryId: unknown) {
  await deleteFarmImages(db, DELIVERY_PHOTOS_BUCKET, [deliveryPhotoPath(deliveryId)]);
}

export async function deleteDeliveryPhotos(db: StorageDb, deliveryIds: unknown[]) {
  if (!deliveryIds.length) return;
  await deleteFarmImages(db, DELIVERY_PHOTOS_BUCKET, deliveryIds.map(deliveryPhotoPath));
}
