import {
  deleteFarmImages,
  normalizePathForStorage,
  signFarmImageUrl,
  uploadFarmImage,
} from "./farmImageStorage.ts";

export const EXPENSE_RECEIPTS_BUCKET = "expense-receipts";
export const RECEIPT_SIGNED_URL_TTL_SEC = 4 * 60 * 60;

export function expenseReceiptPath(expenseId: unknown): string {
  return `receipts/${String(expenseId)}.jpg`;
}

export function isStoragePath(value: string): boolean {
  return Boolean(value) && !value.startsWith("http://") && !value.startsWith("https://");
}

export function normalizeImageUrlForStorage(value: string, expenseId: unknown): string {
  return normalizePathForStorage(value, expenseReceiptPath(expenseId), EXPENSE_RECEIPTS_BUCKET);
}

type StorageDb = ReturnType<typeof import("./supabase.ts").adminClient>;

export async function signExpenseReceiptUrl(
  db: StorageDb,
  pathOrUrl: string,
  expenseId?: unknown,
): Promise<string> {
  return signFarmImageUrl(db, EXPENSE_RECEIPTS_BUCKET, pathOrUrl, expenseReceiptPath(expenseId));
}

export async function uploadExpenseReceiptImage(
  db: StorageDb,
  expenseId: unknown,
  imageBase64: string,
): Promise<string> {
  return uploadFarmImage(db, EXPENSE_RECEIPTS_BUCKET, expenseReceiptPath(expenseId), imageBase64);
}

export async function deleteExpenseReceiptImage(db: StorageDb, expenseId: unknown) {
  await deleteFarmImages(db, EXPENSE_RECEIPTS_BUCKET, [expenseReceiptPath(expenseId)]);
}

export async function deleteExpenseReceiptImages(db: StorageDb, expenseIds: unknown[]) {
  if (!expenseIds.length) return;
  await deleteFarmImages(db, EXPENSE_RECEIPTS_BUCKET, expenseIds.map(expenseReceiptPath));
}
