export const EXPENSE_RECEIPTS_BUCKET = "expense-receipts";

export function expenseReceiptPath(expenseId: unknown): string {
  return `receipts/${String(expenseId)}.jpg`;
}

export function decodeBase64Image(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type StorageDb = ReturnType<typeof import("./supabase.ts").adminClient>;

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
  const { data } = db.storage.from(EXPENSE_RECEIPTS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
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
