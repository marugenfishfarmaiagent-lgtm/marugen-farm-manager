/** Idempotent invoice-linked stock deduct / restore (mirrors client genInvoiceStockLogId). */

type Db = ReturnType<typeof import("./supabase.ts").adminClient>;

function genInvoiceStockLogId(invoiceId: string, productId: string | number, kind: "sell" | "restock"): number {
  const raw = `${invoiceId}|${productId}|${kind}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = Math.imul(31, hash) + raw.charCodeAt(i) | 0;
  }
  const base = Math.abs(hash >>> 0);
  const suffix = Math.abs(Number(productId) || 0) % 99999;
  return base * 100000 + suffix + 1;
}

function normalizeItem(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

function aggregateQtyByProduct(items: unknown[]): Map<string, number> {
  const qtyByProduct = new Map<string, number>();
  for (const raw of items || []) {
    const it = normalizeItem(raw);
    if (!it) continue;
    const productId = it.productId ?? it.product_id;
    if (productId == null || productId === "") continue;
    const key = String(productId);
    qtyByProduct.set(key, (qtyByProduct.get(key) || 0) + (Number(it.qty) || 0));
  }
  return qtyByProduct;
}

function lineForProduct(items: unknown[], productId: string): Record<string, unknown> | null {
  for (const raw of items || []) {
    const it = normalizeItem(raw);
    if (!it) continue;
    if (String(it.productId ?? it.product_id) === productId) return it;
  }
  return null;
}

export async function deductStockForInvoiceOnServer(
  db: Db,
  invoiceId: string,
  items: unknown[],
  {
    by,
    now,
    invoiceDate,
  }: { by: string; now: string; invoiceDate: string | null },
): Promise<void> {
  const qtyByProduct = aggregateQtyByProduct(items);
  if (!qtyByProduct.size) return;

  for (const [productId, qty] of qtyByProduct) {
    if (qty <= 0) throw new Error("Invalid stock quantity on invoice line.");

    const logId = genInvoiceStockLogId(invoiceId, productId, "sell");
    const { data: existingLog, error: logErr } = await db
      .from("stock_activity")
      .select("id")
      .eq("id", logId)
      .maybeSingle();
    if (logErr) throw logErr;
    if (existingLog) continue;

    const { data: product, error: prodErr } = await db
      .from("products")
      .select("id, name, stock, unit, price, track_stock")
      .eq("id", productId)
      .maybeSingle();
    if (prodErr) throw prodErr;
    if (!product) throw new Error("One or more invoice products are no longer in inventory.");
    if (product.track_stock === false) continue;

    const stock = Number(product.stock) || 0;
    if (qty > stock) {
      const unit = product.unit || "unit";
      throw new Error(`Not enough ${product.name} in stock (${stock} ${unit} available, need ${qty}).`);
    }

    const line = lineForProduct(items, productId);
    const price = Number(line?.price) || Number(product.price) || 0;
    const nextStock = stock - qty;

    const { error: updErr } = await db
      .from("products")
      .update({ stock: nextStock, updated_at: now })
      .eq("id", productId);
    if (updErr) throw updErr;

    const { error: insErr } = await db.from("stock_activity").upsert({
      id: logId,
      product_id: Number(productId),
      product_name: String(line?.name || product.name || "Product"),
      type: "sell",
      qty,
      value: qty * price,
      note: `Invoice ${invoiceId}`,
      date: invoiceDate || now.slice(0, 10),
      added_by: by || "Staff",
      updated_at: now,
    }, { onConflict: "id" });
    if (insErr) throw insErr;
  }
}

export async function restoreStockForInvoiceOnServer(
  db: Db,
  invoiceId: string,
  items: unknown[],
  {
    by,
    now,
    invoiceDate,
  }: { by: string; now: string; invoiceDate: string | null },
): Promise<void> {
  const qtyByProduct = aggregateQtyByProduct(items);
  if (!qtyByProduct.size) return;

  for (const [productId, qty] of qtyByProduct) {
    if (qty <= 0) continue;

    const logId = genInvoiceStockLogId(invoiceId, productId, "restock");
    const { data: existingLog, error: logErr } = await db
      .from("stock_activity")
      .select("id")
      .eq("id", logId)
      .maybeSingle();
    if (logErr) throw logErr;
    if (existingLog) continue;

    const sellLogId = genInvoiceStockLogId(invoiceId, productId, "sell");
    const { data: sellLog, error: sellLogErr } = await db
      .from("stock_activity")
      .select("id")
      .eq("id", sellLogId)
      .maybeSingle();
    if (sellLogErr) throw sellLogErr;
    if (!sellLog) continue;

    const { data: product, error: prodErr } = await db
      .from("products")
      .select("id, name, stock, unit, track_stock")
      .eq("id", productId)
      .maybeSingle();
    if (prodErr) throw prodErr;
    if (!product || product.track_stock === false) continue;

    const stock = Number(product.stock) || 0;
    const line = lineForProduct(items, productId);

    const { error: updErr } = await db
      .from("products")
      .update({ stock: stock + qty, updated_at: now })
      .eq("id", productId);
    if (updErr) throw updErr;

    const { error: insErr } = await db.from("stock_activity").upsert({
      id: logId,
      product_id: Number(productId),
      product_name: String(line?.name || product.name || "Product"),
      type: "restock",
      qty,
      value: null,
      note: `Invoice cancelled ${invoiceId}`,
      date: invoiceDate || now.slice(0, 10),
      added_by: by || "Staff",
      updated_at: now,
    }, { onConflict: "id" });
    if (insErr) throw insErr;
  }
}
