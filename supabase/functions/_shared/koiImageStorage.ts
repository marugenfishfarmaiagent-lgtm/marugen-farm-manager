import {
  deleteFarmImages,
  isStoragePath,
  resolveImageFieldForStorage,
  signFarmImageUrl,
} from "./farmImageStorage.ts";

export const KOI_PHOTOS_BUCKET = "koi-photos";

export function koiFishPhotoPath(id: unknown): string {
  return `koi-fish/${String(id)}/photo.jpg`;
}

export function koiFishDeathPhotoPath(id: unknown): string {
  return `koi-fish/${String(id)}/death.jpg`;
}

export function customerKoiPhotoPath(id: unknown): string {
  return `customer-koi/${String(id)}/photo.jpg`;
}

export function customerKoiDeathPhotoPath(id: unknown): string {
  return `customer-koi/${String(id)}/death.jpg`;
}

export function koiFishImagePaths(id: unknown): string[] {
  return [koiFishPhotoPath(id), koiFishDeathPhotoPath(id)];
}

export function customerKoiImagePaths(id: unknown): string[] {
  return [customerKoiPhotoPath(id), customerKoiDeathPhotoPath(id)];
}

type StorageDb = ReturnType<typeof import("./supabase.ts").adminClient>;

export async function resolveKoiFishPhoto(db: StorageDb, id: unknown, value: unknown) {
  return resolveImageFieldForStorage(db, KOI_PHOTOS_BUCKET, value, koiFishPhotoPath(id));
}

export async function resolveKoiFishDeathPhoto(db: StorageDb, id: unknown, value: unknown) {
  return resolveImageFieldForStorage(db, KOI_PHOTOS_BUCKET, value, koiFishDeathPhotoPath(id));
}

export async function resolveCustomerKoiPhoto(db: StorageDb, id: unknown, value: unknown) {
  return resolveImageFieldForStorage(db, KOI_PHOTOS_BUCKET, value, customerKoiPhotoPath(id));
}

export async function resolveCustomerKoiDeathPhoto(db: StorageDb, id: unknown, value: unknown) {
  return resolveImageFieldForStorage(db, KOI_PHOTOS_BUCKET, value, customerKoiDeathPhotoPath(id));
}

export async function signKoiFishRowPhotos(db: StorageDb, row: Record<string, unknown>) {
  const photo = row.photo != null
    ? await signFarmImageUrl(db, KOI_PHOTOS_BUCKET, String(row.photo), koiFishPhotoPath(row.id))
    : null;
  const death_photo = row.death_photo != null
    ? await signFarmImageUrl(db, KOI_PHOTOS_BUCKET, String(row.death_photo), koiFishDeathPhotoPath(row.id))
    : null;
  return { ...row, photo, death_photo };
}

async function signCustomerKoiImageField(
  db: StorageDb,
  row: Record<string, unknown>,
  field: "photo" | "death_photo",
): Promise<string | null> {
  const value = row[field];
  const defaultPath = field === "photo"
    ? customerKoiPhotoPath(row.id)
    : customerKoiDeathPhotoPath(row.id);
  if (value != null) {
    const signed = await signFarmImageUrl(db, KOI_PHOTOS_BUCKET, String(value), defaultPath);
    if (signed) return signed;
  }
  if (field === "photo") {
    const koiId = row.koi_id ?? row.koiId;
    if (koiId) {
      const farmPath = koiFishPhotoPath(koiId);
      const signed = await signFarmImageUrl(db, KOI_PHOTOS_BUCKET, farmPath, farmPath);
      if (signed) return signed;
    }
  }
  return null;
}

export async function signCustomerKoiRowPhotos(db: StorageDb, row: Record<string, unknown>) {
  const photo = await signCustomerKoiImageField(db, row, "photo");
  const death_photo = await signCustomerKoiImageField(db, row, "death_photo");
  return { ...row, photo, death_photo };
}

export async function deleteKoiFishImages(db: StorageDb, ids: unknown[]) {
  if (!ids.length) return;
  const paths = ids.flatMap((id) => koiFishImagePaths(id));
  await deleteFarmImages(db, KOI_PHOTOS_BUCKET, paths);
}

export async function deleteCustomerKoiImages(db: StorageDb, ids: unknown[]) {
  if (!ids.length) return;
  const paths = ids.flatMap((id) => customerKoiImagePaths(id));
  await deleteFarmImages(db, KOI_PHOTOS_BUCKET, paths);
}

export async function deleteKoiDeathPhotosFromRows(
  db: StorageDb,
  rows: { death_photo?: string | null }[],
) {
  const paths = rows
    .map((r) => r.death_photo)
    .filter((p): p is string => typeof p === "string" && isStoragePath(p));
  if (paths.length) await deleteFarmImages(db, KOI_PHOTOS_BUCKET, paths);
}
