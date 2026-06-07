import {
  deleteFarmImages,
  normalizePathForStorage,
  signFarmImageUrl,
  uploadFarmImage,
} from "./farmImageStorage.ts";

export const INVOICE_DOCUMENTS_BUCKET = "invoice-documents";

export function invoicePdfPath(invoiceId: unknown): string {
  return `pdfs/${String(invoiceId)}.pdf`;
}

export function normalizeInvoicePdfForStorage(value: string, invoiceId: unknown): string {
  return normalizePathForStorage(value, invoicePdfPath(invoiceId), INVOICE_DOCUMENTS_BUCKET);
}

function decodeBase64Pdf(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type StorageDb = ReturnType<typeof import("./supabase.ts").adminClient>;

export async function signInvoicePdfUrl(
  db: StorageDb,
  pathOrUrl: string,
  invoiceId?: unknown,
): Promise<string> {
  return signFarmImageUrl(db, INVOICE_DOCUMENTS_BUCKET, pathOrUrl, invoicePdfPath(invoiceId));
}

export async function uploadInvoicePdf(
  db: StorageDb,
  invoiceId: unknown,
  pdfBase64: string,
): Promise<string> {
  const path = invoicePdfPath(invoiceId);
  const bytes = decodeBase64Pdf(pdfBase64);
  const { error } = await db.storage.from(INVOICE_DOCUMENTS_BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function deleteInvoicePdf(db: StorageDb, invoiceId: unknown) {
  await deleteFarmImages(db, INVOICE_DOCUMENTS_BUCKET, [invoicePdfPath(invoiceId)]);
}

export async function deleteInvoicePdfs(db: StorageDb, invoiceIds: unknown[]) {
  if (!invoiceIds.length) return;
  await deleteFarmImages(db, INVOICE_DOCUMENTS_BUCKET, invoiceIds.map(invoicePdfPath));
}
