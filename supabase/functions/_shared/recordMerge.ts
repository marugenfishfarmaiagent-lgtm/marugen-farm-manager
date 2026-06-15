/** Server-side merge rules — mirror src/lib/cloudMerge.js for multi-device sync safety. */

function ts(record: Record<string, unknown> | null | undefined): number {
  const raw = record?.updated_at ?? record?.updatedAt;
  if (!raw) return 0;
  const t = new Date(String(raw)).getTime();
  return Number.isFinite(t) ? t : 0;
}

function bookedTs(record: Record<string, unknown> | null | undefined): number {
  const raw = record?.booked_at ?? record?.bookedAt;
  if (!raw) return 0;
  const t = new Date(String(raw)).getTime();
  return Number.isFinite(t) ? t : 0;
}

function isTerminalInvoiceStatus(status: unknown): boolean {
  const s = String(status ?? "pending").toLowerCase();
  return s === "paid" || s === "cancelled";
}

const TERMINAL_KOI_STATUSES = new Set(["sold", "deceased"]);

function terminalInvoiceRank(status: unknown): number {
  const s = String(status ?? "pending").toLowerCase();
  if (s === "cancelled") return 2;
  if (s === "paid") return 1;
  return 0;
}

/** Merge incoming client invoice row with existing server row (snake_case). */
export function mergeInvoiceDbRow(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const lt = ts(incoming);
  const rt = ts(existing);
  const ls = String(incoming.status ?? "pending").toLowerCase();
  const rs = String(existing.status ?? "pending").toLowerCase();

  let base: Record<string, unknown>;
  if (isTerminalInvoiceStatus(ls) && !isTerminalInvoiceStatus(rs)) {
    base = { ...existing, ...incoming };
  } else if (isTerminalInvoiceStatus(rs) && !isTerminalInvoiceStatus(ls)) {
    base = { ...incoming, ...existing };
  } else if (isTerminalInvoiceStatus(ls) && isTerminalInvoiceStatus(rs)) {
    const lr = terminalInvoiceRank(ls);
    const rr = terminalInvoiceRank(rs);
    if (lr !== rr) {
      base = lr > rr ? { ...existing, ...incoming } : { ...incoming, ...existing };
    } else {
      base = lt !== rt ? (lt > rt ? { ...existing, ...incoming } : { ...incoming, ...existing }) : { ...existing, ...incoming };
    }
  } else {
    base = lt !== rt ? (lt > rt ? { ...existing, ...incoming } : { ...incoming, ...existing }) : { ...existing, ...incoming };
  }

  const localBooked = Boolean(incoming.booked);
  const remoteBooked = Boolean(existing.booked);
  if (localBooked === remoteBooked) return base;

  const lbt = bookedTs(incoming);
  const rbt = bookedTs(existing);
  if (lbt !== rbt) {
    const bookedSource = lbt > rbt ? incoming : existing;
    return {
      ...base,
      booked: Boolean(bookedSource.booked),
      booked_at: bookedSource.booked_at ?? bookedSource.bookedAt ?? null,
      booked_by: bookedSource.booked_by ?? bookedSource.bookedBy ?? "",
    };
  }
  if (remoteBooked) {
    return {
      ...base,
      booked: true,
      booked_at: existing.booked_at ?? existing.bookedAt ?? null,
      booked_by: existing.booked_by ?? existing.bookedBy ?? "",
    };
  }
  if (localBooked) {
    return {
      ...base,
      booked: true,
      booked_at: incoming.booked_at ?? incoming.bookedAt ?? null,
      booked_by: incoming.booked_by ?? incoming.bookedBy ?? "",
    };
  }
  if (rt >= lt) {
    return { ...base, booked: false, booked_at: null, booked_by: "" };
  }
  return base;
}

/** Merge incoming client koi row with existing server row (snake_case). */
export function mergeKoiDbRow(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const lt = ts(incoming);
  const rt = ts(existing);
  const ls = String(incoming.status ?? "available").toLowerCase();
  const rs = String(existing.status ?? "available").toLowerCase();

  let picked: Record<string, unknown>;
  if (TERMINAL_KOI_STATUSES.has(ls) && !TERMINAL_KOI_STATUSES.has(rs)) {
    picked = { ...existing, ...incoming };
  } else if (TERMINAL_KOI_STATUSES.has(rs) && !TERMINAL_KOI_STATUSES.has(ls)) {
    // Refund/restock with a newer client row beats stale sold on server.
    picked = lt >= rt ? { ...existing, ...incoming } : { ...incoming, ...existing };
  } else if (lt !== rt) {
    picked = lt > rt ? { ...existing, ...incoming } : { ...incoming, ...existing };
  } else {
    picked = { ...existing, ...incoming };
  }

  const status = String(picked.status ?? "available").toLowerCase();
  const soldTo = picked.sold_to ?? picked.soldTo;
  const isSold = status === "sold";
  return {
    ...picked,
    status,
    sold_to: isSold ? soldTo : null,
    sold_date: isSold ? (picked.sold_date ?? picked.soldDate ?? null) : null,
    sold_price: isSold ? (picked.sold_price ?? picked.soldPrice ?? null) : null,
    sell_disposition: isSold ? (picked.sell_disposition ?? picked.sellDisposition ?? null) : null,
    keep_pond_name: isSold ? (picked.keep_pond_name ?? picked.keepPondName ?? null) : null,
  };
}

/** Merge incoming client expense row with existing server row (snake_case). */
export function mergeExpenseDbRow(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const lt = ts(incoming);
  const rt = ts(existing);
  const localBooked = Boolean(incoming.booked);
  const remoteBooked = Boolean(existing.booked);

  if (localBooked && !remoteBooked) return { ...existing, ...incoming };
  if (remoteBooked && !localBooked) return { ...incoming, ...existing };
  if (lt !== rt) return lt > rt ? { ...existing, ...incoming } : { ...incoming, ...existing };
  return { ...existing, ...incoming };
}

export function rowsSemanticallyEqual(a: Record<string, unknown>, b: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => String(a[key] ?? "") === String(b[key] ?? ""));
}
