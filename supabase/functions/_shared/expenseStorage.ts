export const EXPENSE_RECEIPTS_BUCKET = "expense-receipts";
/** Signed URL lifetime returned to authenticated clients (seconds). */
export const RECEIPT_SIGNED_URL_TTL_SEC = 4 * 60 * 60;

export function expenseReceiptPath(expenseId: unknown): string {
  return `receipts/${String(expenseId)}.jpg`;
}

export function isStoragePath(value: string): boolean {
  return Boolean(value) && !value.startsWith("http://") && !value.startsWith("https://");
}

/** Persist storage object path — never store expiring signed URLs in Postgres. */
export function normalizeImageUrlForStorage(value: string, expenseId: unknown): string {
  if (!value) return "";
  if (isStoragePath(value)) return value;
  const match = value.match(/\/expense-receipts\/([^?]+)/);
  if (match) return match[1];
  return expenseReceiptPath(expenseId);
}

export function decodeBase64Image(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type StorageDb = ReturnType<typeof import("./supabase.ts").adminClient>;

export async function signExpenseReceiptUrl(
  db: StorageDb,
  pathOrUrl: string,
  expenseId?: unknown,
): Promise<string> {
  if (!pathOrUrl) return "";
  if (!isStoragePath(pathOrUrl)) return pathOrUrl;

  const path = pathOrUrl.includes("/") ? pathOrUrl : expenseReceiptPath(expenseId);
  const { data, error } = await db.storage
    .from(EXPENSE_RECEIPTS_BUCKET)
    .createSignedUrl(path, RECEIPT_SIGNED_URL_TTL_SEC);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadExpenseReceiptImage(
  db: StorageDb,
  expenseId: unknown,
  imageBase64: string,
): Promise<string> {
  const path = expenseReceiptPath(expenseId);
  const bytes = decodeBase64Image(imageBase64);
  const { error } = await db.storage.from(EXPENSE_RECEIPTS_BUCKET).upload(path, bytes, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function deleteExpenseReceiptImage(db: StorageDb, expenseId: unknown) {
  const path = expenseReceiptPath(expenseId);
  await db.storage.from(EXPENSE_RECEIPTS_BUCKET).remove([path]);
}

export async function deleteExpenseReceiptImages(db: StorageDb, expenseIds: unknown[]) {
  if (!expenseIds.length) return;
  const paths = expenseIds.map(expenseReceiptPath);
  await db.storage.from(EXPENSE_RECEIPTS_BUCKET).remove(paths);
}
