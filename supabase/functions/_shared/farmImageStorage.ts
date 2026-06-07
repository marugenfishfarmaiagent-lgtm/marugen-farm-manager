/** Shared private Storage helpers for farm images (signed URLs, path persistence). */

export const SIGNED_URL_TTL_SEC = 4 * 60 * 60;

export function isStoragePath(value: string): boolean {
  return Boolean(value) && !value.startsWith("http://") && !value.startsWith("https://");
}

export function isInlineImage(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:image/");
}

/** Persist object path — never store expiring signed URLs in Postgres. */
export function normalizePathForStorage(
  value: string,
  defaultPath: string,
  bucketId: string,
): string {
  if (!value) return "";
  if (isStoragePath(value)) return value;
  const match = value.match(new RegExp(`/${bucketId}/([^?]+)`));
  if (match) return match[1];
  return defaultPath;
}

export function decodeBase64Image(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type StorageDb = ReturnType<typeof import("./supabase.ts").adminClient>;

export async function signFarmImageUrl(
  db: StorageDb,
  bucket: string,
  pathOrUrl: string,
  defaultPath?: string,
): Promise<string> {
  if (!pathOrUrl) return "";
  if (isInlineImage(pathOrUrl)) return pathOrUrl;
  if (!isStoragePath(pathOrUrl)) return pathOrUrl;

  const path = pathOrUrl.includes("/") ? pathOrUrl : (defaultPath || pathOrUrl);
  const { data, error } = await db.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadFarmImage(
  db: StorageDb,
  bucket: string,
  path: string,
  imageBase64: string,
): Promise<string> {
  const bytes = decodeBase64Image(imageBase64);
  const { error } = await db.storage.from(bucket).upload(path, bytes, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function deleteFarmImages(db: StorageDb, bucket: string, paths: string[]) {
  if (!paths.length) return;
  await db.storage.from(bucket).remove(paths);
}

export async function resolveImageFieldForStorage(
  db: StorageDb,
  bucket: string,
  value: unknown,
  defaultPath: string,
): Promise<string | null> {
  if (value == null || value === "") return null;
  const s = String(value);
  if (isInlineImage(s)) {
    return uploadFarmImage(db, bucket, defaultPath, s);
  }
  const normalized = normalizePathForStorage(s, defaultPath, bucket);
  return normalized || null;
}
