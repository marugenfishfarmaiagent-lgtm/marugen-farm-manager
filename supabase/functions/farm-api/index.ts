import { fetchTodayUsageByUser, fetchWeekUsageByUser } from "../_shared/aiUsage.ts";
import { corsHeadersFor, jsonResponse, optionsResponse } from "../_shared/cors.ts";
import {
  deleteExpenseReceiptImages,
  expenseReceiptPath,
  normalizeImageUrlForStorage,
  signExpenseReceiptUrl,
  uploadExpenseReceiptImage,
} from "../_shared/expenseStorage.ts";
import {
  deleteDeliveryPhotos,
  deliveryPhotoPath,
  normalizeDeliveryPhotoForStorage,
  signDeliveryPhotoUrl,
  uploadDeliveryPhotoImage,
} from "../_shared/deliveryStorage.ts";
import {
  customerKoiDeathPhotoPath,
  customerKoiPhotoPath,
  deleteCustomerKoiImages,
  deleteKoiDeathPhotosFromRows,
  deleteKoiFishImages,
  koiFishDeathPhotoPath,
  koiFishPhotoPath,
  KOI_PHOTOS_BUCKET,
  resolveCustomerKoiDeathPhoto,
  resolveCustomerKoiPhoto,
  resolveKoiFishDeathPhoto,
  resolveKoiFishPhoto,
  signCustomerKoiRowPhotos,
  signKoiFishRowPhotos,
} from "../_shared/koiImageStorage.ts";
import { signFarmImageUrl } from "../_shared/farmImageStorage.ts";
import { deleteInvoicePdfs } from "../_shared/invoiceStorage.ts";
import { deductStockForInvoiceOnServer, restoreStockForInvoiceOnServer } from "../_shared/invoiceStock.ts";
import { hashPin, verifyPin } from "../_shared/pin.ts";
import { purgeExpiredCloudData } from "../_shared/retention.ts";
import {
  mergeExpenseDbRow,
  mergeInvoiceDbRow,
  mergeKoiDbRow,
  rowsSemanticallyEqual,
} from "../_shared/recordMerge.ts";
import {
  clearSyncTombstones,
  fetchSyncTombstones,
  isBlockedByTombstone,
  loadTombstoneMap,
  purgeExpiredTombstones,
  tableEntityName,
} from "../_shared/tombstones.ts";
import {
  adminClient,
  hasPermission,
  sessionTokenFrom,
  type SessionUser,
  validateSession,
} from "../_shared/supabase.ts";
import { lookupSingaporePostalAddress } from "../_shared/sgPostalLookup.ts";
import {
  getVapidPublicKey,
  isPushConfigured,
  sendPushToAllFarmUsers,
  sendPushToSubscription,
  sendPushToUserIds,
} from "../_shared/webPush.ts";

/** Postgres BIGINT columns reject ""; coerce empty/invalid values to null. */
function nullableBigint(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** expenses.id is BIGINT — reject string ids like EXP-xxx from older clients. */
function resolveExpenseId(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function nullableNumeric(value: unknown, fallback = 0): number {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nullableTimestamptz(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value);
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? s : null;
}

function nullableDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? new Date(s).toISOString().slice(0, 10) : null;
}

function invoiceCustomerId(i: Record<string, unknown>): number | null {
  return nullableBigint(i.customerId ?? i.customer_id);
}

function calcCustomerTier(totalSpent: number): string {
  if (totalSpent >= 10000) return "Platinum";
  if (totalSpent >= 5000) return "Gold";
  if (totalSpent >= 2000) return "Silver";
  return "Bronze";
}

function genStockActivityId(): number {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

async function netStockFromActivity(
  db: ReturnType<typeof adminClient>,
  productId: number,
): Promise<number> {
  const { data: rows, error } = await db.from("stock_activity")
    .select("type, qty")
    .eq("product_id", productId);
  if (error) throw error;
  return (rows || []).reduce((sum, row) => {
    const qty = Number(row.qty) || 0;
    if (row.type === "restock") return sum + qty;
    if (row.type === "use" || row.type === "sell") return sum - qty;
    return sum;
  }, 0);
}

async function reconcileTrackedProductsStock(
  db: ReturnType<typeof adminClient>,
  { repair = false, now = new Date().toISOString() }: { repair?: boolean; now?: string } = {},
): Promise<{
  checked: number;
  mismatches: Array<Record<string, unknown>>;
  repaired: number;
}> {
  const { data: products, error: prodErr } = await db.from("products")
    .select("id, name, stock, unit, track_stock")
    .neq("track_stock", false);
  if (prodErr) throw prodErr;

  const mismatches: Array<Record<string, unknown>> = [];
  let repaired = 0;

  for (const product of products || []) {
    const productId = Number(product.id);
    if (!Number.isFinite(productId)) continue;
    const ledger = await netStockFromActivity(db, productId);
    const actual = Number(product.stock) || 0;
    const drift = ledger - actual;
    if (Math.abs(drift) < 1e-9) continue;

    const mismatch: Record<string, unknown> = {
      productId,
      name: String(product.name || "Product"),
      unit: String(product.unit || "unit"),
      currentStock: actual,
      ledgerStock: ledger,
      drift,
    };
    if (repair) {
      const { error: updErr } = await db.from("products")
        .update({ stock: ledger, updated_at: now })
        .eq("id", productId);
      if (updErr) throw updErr;
      await clearSyncTombstones(db, "products", [String(productId)]);
      mismatch.repaired = true;
      repaired += 1;
    }
    mismatches.push(mismatch);
  }

  return {
    checked: (products || []).length,
    mismatches,
    repaired,
  };
}

function sanitizeInvoiceItems(items: unknown): unknown[] {
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const it = raw as Record<string, unknown>;
    const next: Record<string, unknown> = {
      ...it,
      name: it.name ?? "",
      qty: nullableNumeric(it.qty),
      price: nullableNumeric(it.price),
    };
    if (it.productId == null || it.productId === "") delete next.productId;
    if (it.koiId == null || it.koiId === "") delete next.koiId;
    return next;
  });
}

async function applyInvoiceKoiSalesOnServer(
  db: ReturnType<typeof adminClient>,
  items: unknown[],
  customerId: number | null,
  invoiceDate: string | null,
  now: string,
) {
  if (!customerId) return;
  for (const raw of sanitizeInvoiceItems(items)) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const koiId = String(it.koiId ?? "").trim();
    if (!koiId || it.koiAlreadySold) continue;
    const disposition = String(it.koiDisposition ?? "taken").toLowerCase();
    const soldPrice = nullableNumeric(it.price);
    const { data: existing } = await db.from("koi_fish").select("id, status, pond_name").eq("id", koiId).maybeSingle();
    if (!existing || existing.status === "deceased") continue;
    if (existing.status === "sold" && existing.sold_to) continue;

    if (disposition === "keep") {
      const keepPond = String(it.keepPondName ?? existing.pond_name ?? "").trim();
      const { error } = await db.from("koi_fish").update({
        status: "sold",
        sold_to: customerId,
        sold_date: invoiceDate || nullableDate(now),
        sold_price: soldPrice,
        sell_disposition: "keep",
        keep_pond_name: keepPond || existing.pond_name,
        pond_name: keepPond || existing.pond_name,
        updated_at: now,
      }).eq("id", koiId);
      if (error) throw error;
      continue;
    }

    const { error } = await db.from("koi_fish").update({
      status: "sold",
      sold_to: customerId,
      sold_date: invoiceDate || nullableDate(now),
      sold_price: soldPrice,
      sell_disposition: "taken",
      keep_pond_name: null,
      updated_at: now,
    }).eq("id", koiId);
    if (error) throw error;
  }
}

async function restoreInvoiceKoiSalesOnServer(
  db: ReturnType<typeof adminClient>,
  items: unknown[],
  now: string,
) {
  for (const raw of sanitizeInvoiceItems(items)) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const koiId = String(it.koiId ?? "").trim();
    if (!koiId || it.koiAlreadySold) continue;
    const { data: existing } = await db.from("koi_fish").select("id, status").eq("id", koiId).maybeSingle();
    if (!existing || existing.status === "deceased") continue;
    const { error } = await db.from("koi_fish").update({
      status: "available",
      sold_to: null,
      sold_date: null,
      sold_price: null,
      sell_disposition: null,
      keep_pond_name: null,
      updated_at: now,
    }).eq("id", koiId);
    if (error) throw error;
  }
}

/** Koi-tab sales use koiAlreadySold lines — still restore fish when voiding via refund. */
async function restoreKoiForRefundOnServer(
  db: ReturnType<typeof adminClient>,
  items: unknown[],
  now: string,
) {
  for (const raw of sanitizeInvoiceItems(items)) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const koiId = String(it.koiId ?? "").trim();
    if (!koiId) continue;
    const { data: existing } = await db.from("koi_fish").select("id, status").eq("id", koiId).maybeSingle();
    if (!existing || existing.status === "deceased") continue;
    const { error } = await db.from("koi_fish").update({
      status: "available",
      sold_to: null,
      sold_date: null,
      sold_price: null,
      sell_disposition: null,
      keep_pond_name: null,
      updated_at: now,
    }).eq("id", koiId);
    if (error) throw error;
  }
}

const ENTITY_PERMS: Record<string, string> = {
  users: "users",
  customers: "customers",
  products: "inventory",
  invoices: "invoices",
  expenses: "expenses",
  deliveries: "deliveries",
  events: "calendar",
  stock_activity: "inventory",
  koi_fish: "koifish",
  customer_koi: "customerkoi",
  farm_pond_data: "ponds",
  whatsapp_groups: "deliveries",
};

function permittedRows<T>(user: SessionUser, perm: string, rows: T[]): T[] {
  return hasPermission(user, perm) ? rows : [];
}

function permittedObject<T extends Record<string, unknown>>(user: SessionUser, perm: string, value: T): T {
  return hasPermission(user, perm) ? value : {} as T;
}

function normId(id: unknown): string {
  return String(id);
}

async function revokeUserSessions(db: ReturnType<typeof adminClient>, userIds: (string | number)[]) {
  if (!userIds.length) return;
  await db.from("auth_sessions").delete().in("user_id", userIds);
}

async function deleteFarmUsers(db: ReturnType<typeof adminClient>, userIds: (string | number)[]) {
  if (!userIds.length) return;
  await revokeUserSessions(db, userIds);
  await db.from("ai_usage_daily").delete().in("user_id", userIds);
  const { error } = await db.from("farm_users").delete().in("id", userIds);
  if (error) throw error;
}

function farmPermissionsEqual(a: unknown, b: unknown): boolean {
  const left = sanitizeFarmPermissions(a) || [];
  const right = sanitizeFarmPermissions(b) || [];
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((perm, index) => perm === sortedRight[index]);
}

async function upsertSync(
  table: string,
  rows: Record<string, unknown>[],
  idField: string,
  options: {
    prune?: boolean;
    deletedIds?: unknown[];
    beforeDelete?: (ids: unknown[]) => Promise<void>;
    force?: boolean;
    mergeWithExisting?: (existing: Record<string, unknown>, incoming: Record<string, unknown>) => Record<string, unknown>;
    mergeCompareKeys?: string[];
    preserveClientTimestamp?: boolean;
  } = {},
) {
  const db = adminClient();
  const now = new Date().toISOString();
  const {
    prune = false,
    deletedIds = [],
    beforeDelete,
    force = false,
    mergeWithExisting,
    mergeCompareKeys,
    preserveClientTimestamp = false,
  } = options;

  const pickUpdatedAt = (clientRaw: unknown) => (
    preserveClientTimestamp && clientRaw ? String(clientRaw) : now
  );

  if (deletedIds.length) {
    if (beforeDelete) await beforeDelete(deletedIds);
    const { error } = await db.from(table).delete().in(idField, deletedIds);
    if (error) throw error;
  }

  if (!rows.length) {
    if (table === "farm_users" && prune) {
      const { data: existing } = await db.from(table).select(idField);
      const allIds = (existing || []).map((r) => r[idField]).filter((id) => id != null);
      await deleteFarmUsers(db, allIds);
    }
    return;
  }

  const ids = rows.map((r) => r[idField]).filter((id) => id != null);
  const selectFields = mergeWithExisting ? "*" : `${idField}, updated_at`;
  const { data: existingRows } = ids.length
    ? await db.from(table).select(selectFields).in(idField, ids)
    : { data: [] as Record<string, unknown>[] };
  const existingMap = new Map(
    (existingRows || []).map((r) => [normId(r[idField]), r as Record<string, unknown>]),
  );
  const entity = tableEntityName(table);
  const tombstoneMap = await loadTombstoneMap(db, entity, ids.map((id) => normId(id)));

  const toUpsert: Record<string, unknown>[] = [];
  for (const row of rows) {
    const id = normId(row[idField]);
    const tombDeletedAt = tombstoneMap.get(id);
    const clientRawForTomb = row.updated_at ?? row.updatedAt;
    if (tombDeletedAt && isBlockedByTombstone(tombDeletedAt, clientRawForTomb)) {
      continue;
    }

    const existing = existingMap.get(id);
    let next = row;
    if (existing && mergeWithExisting) {
      next = mergeWithExisting(existing, row);
    }

    const clientRaw = next.updated_at ?? next.updatedAt;
    const clientTs = clientRaw ? new Date(String(clientRaw)).getTime() : NaN;

    if (force || !existing) {
      const merged = { ...next, updated_at: pickUpdatedAt(clientRaw) };
      delete merged.updatedAt;
      toUpsert.push(merged);
      continue;
    }

    const serverTs = existing.updated_at as string | null;
    const serverTime = serverTs ? new Date(String(serverTs)).getTime() : 0;

    if (mergeWithExisting) {
      const compareKeys = mergeCompareKeys || [];
      const unchanged = compareKeys.length
        ? rowsSemanticallyEqual(existing, next, compareKeys)
        : false;
      if (unchanged) continue;
      if (!Number.isFinite(clientTs) && serverTs) continue;
      const mergedRow = { ...next, updated_at: pickUpdatedAt(clientRaw) };
      delete mergedRow.updatedAt;
      toUpsert.push(mergedRow);
      continue;
    }

    if (!clientRaw) continue;
    if (preserveClientTimestamp && Number.isFinite(clientTs) && clientTs === serverTime) continue;
    if (Number.isFinite(clientTs) && clientTs >= serverTime) {
      const merged = { ...next, updated_at: pickUpdatedAt(clientRaw) };
      delete merged.updatedAt;
      toUpsert.push(merged);
    }
  }

  if (toUpsert.length) {
    const { error } = await db.from(table).upsert(toUpsert, { onConflict: idField });
    if (error) throw error;
    await clearSyncTombstones(db, entity, toUpsert.map((row) => normId(row[idField])));
  }

  if (!prune) return;

  const incomingSet = new Set(
    rows.map((r) => r[idField]).filter((id) => id != null).map(normId),
  );
  const { data: existing } = await db.from(table).select(idField);
  const toDelete = (existing || [])
    .map((r) => r[idField])
    .filter((id) => id != null && !incomingSet.has(normId(id)));

  if (toDelete.length) {
    if (beforeDelete) await beforeDelete(toDelete);
    if (table === "farm_users") {
      await deleteFarmUsers(db, toDelete);
    } else {
      const { error: delErr } = await db.from(table).delete().in(idField, toDelete);
      if (delErr) throw delErr;
    }
  }
}

async function upsertSyncAssignedTeam(
  table: "deliveries" | "events",
  rows: Record<string, unknown>[],
  idField: string,
  options: Parameters<typeof upsertSync>[3],
) {
  try {
    await upsertSync(table, rows, idField, options);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("assigned_user_ids")) throw err;
    const stripped = rows.map((row) => {
      const next = { ...row };
      delete next.assigned_user_ids;
      return next;
    });
    await upsertSync(table, stripped, idField, options);
  }
}

function normalizeAssignedUserIds(value: unknown): number[] {
  if (value == null || value === "") return [];

  let raw: unknown = value;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        return [];
      }
    } else if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const inner = trimmed.slice(1, -1).trim();
      raw = inner ? inner.split(",").map((part) => part.trim()) : [];
    } else {
      const n = Number(trimmed);
      return Number.isFinite(n) && n > 0 ? [n] : [];
    }
  }

  if (!Array.isArray(raw)) return [];
  return [...new Set(
    raw.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0),
  )];
}

function isTeamNotificationForUser(row: Record<string, unknown>, user: SessionUser): boolean {
  if (user.role === "owner") return true;
  const raw = row.target_user_ids ?? row.targetUserIds;
  if (raw == null) return true;
  const targets = normalizeAssignedUserIds(raw);
  if (!targets.length) return false;
  return targets.includes(Number(user.id));
}

async function fetchTeamNotifications(
  db: ReturnType<typeof adminClient>,
  sinceIso: string,
) {
  const withTargets = await db.from("team_notifications")
    .select("id, title, message, actor, actor_role, actor_user_id, notification_type, url, tag, target_user_ids, created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!withTargets.error) return withTargets.data || [];

  const legacy = await db.from("team_notifications")
    .select("id, title, message, actor, actor_role, actor_user_id, notification_type, url, tag, created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(50);
  if (legacy.error) throw legacy.error;
  return legacy.data || [];
}

function mapUsers(users: Record<string, unknown>[]) {
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    active: u.active,
    permissions: u.permissions || [],
    isSystem: u.is_system,
  }));
}

async function isPinTaken(db: ReturnType<typeof adminClient>, pin: string, exceptId?: number) {
  const { data: rows } = await db.from("farm_users").select("id, pin_hash, pin");
  for (const row of rows || []) {
    if (exceptId != null && Number(row.id) === exceptId) continue;
    if (row.pin_hash && await verifyPin(pin, row.pin_hash)) return true;
    if (row.pin && row.pin === pin) return true;
  }
  return false;
}

const FARM_PERMISSION_IDS = new Set([
  "dashboard", "inventory", "koifish", "customerkoi", "ponds", "invoices", "customers",
  "expenses", "accounting", "edit", "delete", "refund", "deliveries", "calendar", "chat", "users",
]);

function sanitizeFarmPermissions(perms: unknown): string[] | null {
  if (!Array.isArray(perms) || !perms.length) return null;
  const clean = [...new Set(perms.map((p) => String(p)).filter((p) => FARM_PERMISSION_IDS.has(p)))];
  return clean.length ? clean : null;
}

function isValidFarmPin(pin: unknown, { required = false } = {}): pin is string {
  const raw = String(pin ?? "").trim();
  if (!raw) return !required;
  return /^\d{4,6}$/.test(raw);
}

async function assertOwnerGuardrails(
  db: ReturnType<typeof adminClient>,
  target: { role?: string; active?: boolean; is_system?: boolean },
  next: { role: string; active: boolean; permissions: string[] },
) {
  if (target.is_system && next.role !== "owner") {
    return "System owner account must remain an owner";
  }
  if (target.role === "owner" && target.active !== false) {
    const { count } = await db.from("farm_users")
      .select("*", { count: "exact", head: true })
      .eq("role", "owner")
      .eq("active", true);
    if ((count || 0) <= 1) {
      if (next.role !== "owner") return "At least one active owner is required";
      if (!next.permissions.includes("users")) return "Last owner must keep Team permission";
      if (!next.active) return "Cannot deactivate the only active owner";
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  try {
    const J = (payload: unknown, status = 200) => jsonResponse(payload, status, req);
    const token = sessionTokenFrom(req);
    let user: SessionUser | null = null;
    try {
      user = await validateSession(token);
    } catch (sessionErr) {
      console.error("[farm-api] session validation failed:", sessionErr);
      return J({ error: "Unauthorized" }, 401);
    }
    if (!user) return J({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const db = adminClient();

    if (body.action === "fetch") {
      await purgeExpiredCloudData(db);
      await purgeExpiredTombstones(db);

      const teamNotifSince = new Date();
      teamNotifSince.setDate(teamNotifSince.getDate() - 30);

      const [
        users, customers, products, invoices, expenses, deliveries, events, stockActivity,
        koiFish, customerKoi, pondRow, whatsappGroups,
      ] = await Promise.all([
        db.from("farm_users").select("id, name, role, active, permissions, is_system").order("id"),
        db.from("customers").select("*").order("id"),
        db.from("products").select("*").order("id"),
        db.from("invoices").select("*").order("date", { ascending: false }),
        db.from("expenses").select("*").order("id"),
        db.from("deliveries").select("*").order("schedule"),
        db.from("events").select("*").order("date"),
        db.from("stock_activity").select("*").order("updated_at", { ascending: false }).order("id", { ascending: false }),
        db.from("koi_fish").select("*").order("date_added", { ascending: false }),
        db.from("customer_koi").select("*").order("purchase_date", { ascending: false }),
        db.from("farm_pond_data").select("data, updated_at").eq("id", "default").maybeSingle(),
        db.from("whatsapp_groups").select("*").order("name"),
      ]);

      const errors = [
        users, customers, products, invoices, expenses, deliveries, events, stockActivity,
        koiFish, customerKoi, pondRow, whatsappGroups,
      ].map((r) => r.error).filter(Boolean);
      if (errors.length) return J({ error: errors[0]!.message }, 500);

      let teamNotificationsRows: Record<string, unknown>[] = [];
      try {
        teamNotificationsRows = await fetchTeamNotifications(db, teamNotifSince.toISOString());
      } catch (teamNotifErr) {
        console.error("team_notifications fetch failed:", teamNotifErr);
      }

      const canManageUsers = hasPermission(user, "users");
      const allFarmUsers = users.data || [];
      const usersPayload = canManageUsers
        ? allFarmUsers
        : allFarmUsers.filter((u) => u.active !== false);

      const canExpenses = hasPermission(user, "expenses");
      const canKoiFish = hasPermission(user, "koifish");
      const canCustomerKoi = hasPermission(user, "customerkoi");
      const expenseRows = permittedRows(user, "expenses", expenses.data || []);
      const koiFishRows = permittedRows(user, "koifish", koiFish.data || []);
      const customerKoiRows = permittedRows(user, "customerkoi", customerKoi.data || []);
      const syncTombstones = await fetchSyncTombstones(db);

      return J({
        users: mapUsers(usersPayload),
        customers: permittedRows(user, "customers", customers.data || []),
        products: permittedRows(user, "inventory", products.data || []),
        invoices: permittedRows(user, "invoices", invoices.data || []),
        expenses: canExpenses
          ? await Promise.all(expenseRows.map(async (e: Record<string, unknown>) => {
            const base = e.image_url ? { ...e, image_data: null } : e;
            if (!base.image_url) return base;
            const signed = await signExpenseReceiptUrl(db, String(base.image_url), e.id);
            return { ...base, image_url: signed };
          }))
          : [],
        deliveries: hasPermission(user, "deliveries")
          ? await Promise.all(
            permittedRows(user, "deliveries", deliveries.data || []).map(async (d: Record<string, unknown>) => {
              if (!d.photo) return d;
              const signed = await signDeliveryPhotoUrl(db, String(d.photo), d.id);
              return { ...d, photo: signed };
            }),
          )
          : [],
        events: permittedRows(user, "calendar", events.data || []),
        stockActivity: permittedRows(user, "inventory", stockActivity.data || []),
        koiFish: canKoiFish
          ? await Promise.all(koiFishRows.map((k) => signKoiFishRowPhotos(db, k)))
          : [],
        customerKoi: canCustomerKoi
          ? await Promise.all(customerKoiRows.map((k) => signCustomerKoiRowPhotos(db, k)))
          : [],
        pondData: permittedObject(user, "ponds", pondRow.data?.data || {}),
        pondUpdatedAt: hasPermission(user, "ponds") ? (pondRow.data as { updated_at?: string } | null)?.updated_at ?? null : null,
        whatsappGroups: permittedRows(user, "deliveries", whatsappGroups.data || []),
        teamNotifications: teamNotificationsRows.filter((row) => isTeamNotificationForUser(row, user)),
        syncTombstones,
      });
    }

    if (body.action === "lookup_postal") {
      const code = String(body.postalCode ?? "").replace(/\D/g, "").slice(0, 6);
      if (code.length !== 6) {
        return J({ error: "Singapore postal code must be 6 digits" }, 400);
      }
      try {
        const result = await lookupSingaporePostalAddress(code);
        if (!result) return J({ ok: false, address: null, postalCode: code });
        return J({ ok: true, address: result.address, postalCode: result.postalCode });
      } catch (lookupErr) {
        console.error("[farm-api] lookup_postal failed:", lookupErr);
        return J({ ok: false, address: null, postalCode: code });
      }
    }

    if (body.action === "upload_expense_receipt") {
      if (!hasPermission(user, "expenses")) {
        return J({ error: "Permission denied (expenses)" }, 403);
      }
      const { expenseId, imageData, imageName } = body;
      const id = resolveExpenseId(expenseId);
      if (id == null) return J({ error: "Valid numeric expenseId required" }, 400);
      if (!imageData || typeof imageData !== "string" || !imageData.startsWith("data:image/")) {
        return J({ error: "Valid image data required" }, 400);
      }
      const path = await uploadExpenseReceiptImage(db, id, imageData);
      const imageUrl = await signExpenseReceiptUrl(db, path, id);
      return J({ imageUrl, imagePath: path, imageName: imageName || "" });
    }

    if (body.action === "upload_delivery_photo") {
      if (!hasPermission(user, "deliveries")) {
        return J({ error: "Permission denied (deliveries)" }, 403);
      }
      const { deliveryId, imageData, photoName } = body;
      const id = String(deliveryId ?? "").trim();
      if (!id) return J({ error: "deliveryId required" }, 400);
      if (!imageData || typeof imageData !== "string" || !imageData.startsWith("data:image/")) {
        return J({ error: "Valid image data required" }, 400);
      }
      const path = await uploadDeliveryPhotoImage(db, id, imageData);
      const photo = await signDeliveryPhotoUrl(db, path, id);
      return J({ photo, photoPath: path, photoName: photoName || "" });
    }

    if (body.action === "upload_koi_image") {
      const entity = String(body.entity || "");
      const recordId = body.id;
      const field = String(body.field || "photo");
      const imageData = body.imageData;

      if (!recordId || !imageData || typeof imageData !== "string" || !imageData.startsWith("data:image/")) {
        return J({ error: "Valid id and image data required" }, 400);
      }

      type KoiUploadTarget = {
        perm: string;
        resolve: (db: ReturnType<typeof adminClient>, id: unknown, value: unknown) => Promise<string | null>;
        defaultPath: (id: unknown) => string;
      };

      const targets: Record<string, Record<string, KoiUploadTarget>> = {
        koi_fish: {
          photo: { perm: "koifish", resolve: resolveKoiFishPhoto, defaultPath: koiFishPhotoPath },
          death_photo: { perm: "koifish", resolve: resolveKoiFishDeathPhoto, defaultPath: koiFishDeathPhotoPath },
        },
        customer_koi: {
          photo: { perm: "customerkoi", resolve: resolveCustomerKoiPhoto, defaultPath: customerKoiPhotoPath },
          death_photo: { perm: "customerkoi", resolve: resolveCustomerKoiDeathPhoto, defaultPath: customerKoiDeathPhotoPath },
        },
      };

      const target = targets[entity]?.[field];
      if (!target) return J({ error: "Unknown image upload target" }, 400);
      if (!hasPermission(user, target.perm)) {
        return J({ error: `Permission denied (${entity})` }, 403);
      }

      const path = await target.resolve(db, recordId, imageData);
      if (!path) return J({ error: "Image upload failed" }, 500);

      const table = entity === "koi_fish" ? "koi_fish" : "customer_koi";
      const { data: existingRow } = await db.from(table).select("id").eq("id", recordId).maybeSingle();
      if (existingRow) {
        await db.from(table).update({
          [field]: path,
          updated_at: new Date().toISOString(),
        }).eq("id", recordId);
      }

      const url = await signFarmImageUrl(db, KOI_PHOTOS_BUCKET, path, target.defaultPath(recordId));
      return J({ url, path });
    }

    if (body.action === "refresh_expense_receipt" || body.action === "refresh_signed_image") {
      const entity = body.action === "refresh_expense_receipt"
        ? "expense"
        : body.entity;
      const recordId = body.expenseId ?? body.id;
      const field = body.action === "refresh_expense_receipt" ? "image" : body.field;

      if (!entity || recordId == null || !field) {
        return J({ error: "entity, id, and field required" }, 400);
      }

      type ImageTarget = {
        perm: string;
        table: string;
        column: string;
        bucket: string;
        pathFor: (id: unknown) => string;
        sign: (db: ReturnType<typeof adminClient>, path: string, id: unknown) => Promise<string>;
      };

      const targets: Record<string, Record<string, ImageTarget>> = {
        expense: {
          image: {
            perm: "expenses",
            table: "expenses",
            column: "image_url",
            bucket: "expense-receipts",
            pathFor: expenseReceiptPath,
            sign: signExpenseReceiptUrl,
          },
        },
        koi_fish: {
          photo: {
            perm: "koifish",
            table: "koi_fish",
            column: "photo",
            bucket: KOI_PHOTOS_BUCKET,
            pathFor: koiFishPhotoPath,
            sign: (d, path, id) => signFarmImageUrl(d, KOI_PHOTOS_BUCKET, path, koiFishPhotoPath(id)),
          },
          death_photo: {
            perm: "koifish",
            table: "koi_fish",
            column: "death_photo",
            bucket: KOI_PHOTOS_BUCKET,
            pathFor: koiFishDeathPhotoPath,
            sign: (d, path, id) => signFarmImageUrl(d, KOI_PHOTOS_BUCKET, path, koiFishDeathPhotoPath(id)),
          },
        },
        customer_koi: {
          photo: {
            perm: "customerkoi",
            table: "customer_koi",
            column: "photo",
            bucket: KOI_PHOTOS_BUCKET,
            pathFor: customerKoiPhotoPath,
            sign: (d, path, id) => signFarmImageUrl(d, KOI_PHOTOS_BUCKET, path, customerKoiPhotoPath(id)),
          },
          death_photo: {
            perm: "customerkoi",
            table: "customer_koi",
            column: "death_photo",
            bucket: KOI_PHOTOS_BUCKET,
            pathFor: customerKoiDeathPhotoPath,
            sign: (d, path, id) => signFarmImageUrl(d, KOI_PHOTOS_BUCKET, path, customerKoiDeathPhotoPath(id)),
          },
        },
        delivery: {
          photo: {
            perm: "deliveries",
            table: "deliveries",
            column: "photo",
            bucket: "delivery-photos",
            pathFor: deliveryPhotoPath,
            sign: signDeliveryPhotoUrl,
          },
        },
      };

      const target = targets[entity]?.[field];
      if (!target) return J({ error: "Unknown image target" }, 400);
      if (!hasPermission(user, target.perm)) {
        return J({ error: `Permission denied (${entity})` }, 403);
      }

      const selectCols = entity === "customer_koi" && field === "photo"
        ? `${target.column}, koi_id`
        : target.column;
      const { data: row, error: fetchErr } = await db.from(target.table)
        .select(selectCols)
        .eq("id", recordId)
        .maybeSingle();
      if (fetchErr || !row) {
        return J({ error: "Image not found" }, 404);
      }
      const stored = row[target.column as keyof typeof row];
      let url = stored
        ? await target.sign(db, String(stored), recordId)
        : "";
      if (!url && entity === "customer_koi" && field === "photo") {
        const koiId = (row as { koi_id?: string }).koi_id;
        if (koiId) {
          url = await signFarmImageUrl(db, KOI_PHOTOS_BUCKET, koiFishPhotoPath(koiId), koiFishPhotoPath(koiId));
        }
      }
      if (!url) {
        return J({ error: "Image not found" }, 404);
      }
      return J({ url, imageUrl: url });
    }

    if (body.action === "adjust_stock") {
      if (!hasPermission(user, "inventory")) {
        return J({ error: "Permission denied (inventory)" }, 403);
      }
      if (!hasPermission(user, "edit")) {
        return J({ error: "Permission denied (edit)" }, 403);
      }

      const productId = nullableBigint(body.productId ?? body.product_id);
      if (productId == null) return J({ error: "Product id required" }, 400);

      const delta = Number(body.delta);
      if (!Number.isFinite(delta) || delta === 0) {
        return J({ error: "Adjustment delta must be a non-zero number" }, 400);
      }

      const qty = Math.abs(delta);
      const type = delta > 0 ? "restock" : "use";
      const now = new Date().toISOString();
      const note = String(body.note ?? "").trim() || (type === "restock" ? "Manual restock" : "Manual use");

      let ledgerBefore = await netStockFromActivity(db, productId);

      // Auto-reconcile stock drift before adjusting so the operation is never blocked.
      // Drift happens when products were seeded or imported without matching stock_activity rows.
      {
        const { data: checkProduct } = await db.from("products")
          .select("id, name, stock, unit, track_stock")
          .eq("id", productId)
          .maybeSingle();
        if (checkProduct) {
          const actualStock = Number(checkProduct.stock) || 0;
          const drift = actualStock - ledgerBefore;
          if (Math.abs(drift) >= 1e-9) {
            if (drift > 0) {
              // products.stock is higher than ledger → insert a reconciliation restock entry
              const { error: recErr } = await db.from("stock_activity").insert({
                id: Date.now() + Math.floor(Math.random() * 9999),
                product_id: productId,
                product_name: String(checkProduct.name || ""),
                type: "restock",
                qty: drift,
                note: "Stock reconciliation (auto-repair)",
                date: now.split("T")[0],
                added_by: "system",
                updated_at: now,
              });
              if (recErr) throw recErr;
            } else {
              // ledger is higher than products.stock → trust ledger, update products.stock
              const { error: updErr } = await db.from("products")
                .update({ stock: ledgerBefore, updated_at: now })
                .eq("id", productId);
              if (updErr) throw updErr;
            }
            ledgerBefore = await netStockFromActivity(db, productId);
          }
        }
      }

      let productRow: Record<string, unknown> | null = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data: current, error: curErr } = await db.from("products")
          .select("id, name, stock, unit, price, track_stock")
          .eq("id", productId)
          .maybeSingle();
        if (curErr) throw curErr;
        if (!current) return J({ error: "Product not found" }, 404);
        if (current.track_stock === false) return J({ error: "This item is invoice price-list only (not tracked in stock)." }, 400);

        const currentStock = Number(current.stock) || 0;
        if (delta < 0 && qty > currentStock) {
          return J({ error: `Not enough ${current.name} in stock (${currentStock} ${current.unit || "unit"} available, need ${qty}).` }, 400);
        }
        const nextStock = currentStock + delta;

        const { data: updated, error: updErr } = await db.from("products")
          .update({ stock: nextStock, updated_at: now })
          .eq("id", productId)
          .eq("stock", current.stock)
          .select("*")
          .maybeSingle();
        if (updErr) throw updErr;
        if (updated) {
          productRow = updated;
          break;
        }
      }

      if (!productRow) {
        return J({ error: "Stock changed by another device. Please retry." }, 409);
      }

      const price = Number(productRow.price ?? 0) || 0;
      const stockEntry = {
        id: genStockActivityId(),
        product_id: productId,
        product_name: String(productRow.name || "Product"),
        type,
        qty,
        value: type === "use" ? qty * price : null,
        note,
        date: nullableDate(now) || now.slice(0, 10),
        added_by: user.name || "Staff",
        updated_at: now,
      };
      const { data: insertedLog, error: insErr } = await db.from("stock_activity")
        .insert(stockEntry)
        .select("*")
        .single();
      if (insErr) throw insErr;

      await clearSyncTombstones(db, "products", [String(productId)]);
      await clearSyncTombstones(db, "stock_activity", [String(stockEntry.id)]);
      return J({ ok: true, product: productRow, stockEntry: insertedLog });
    }

    if (body.action === "reconcile_inventory_stock") {
      if (user.role !== "owner") {
        return J({ error: "Permission denied" }, 403);
      }
      const repair = Boolean(body.repair);
      const now = new Date().toISOString();
      const summary = await reconcileTrackedProductsStock(db, { repair, now });
      return J({
        ok: true,
        repair,
        checked: summary.checked,
        mismatchCount: summary.mismatches.length,
        repaired: summary.repaired,
        mismatches: summary.mismatches,
      });
    }

    if (body.action === "mark_invoice_paid") {
      if (!hasPermission(user, "invoices")) {
        return J({ error: "Permission denied (invoices)" }, 403);
      }
      if (!hasPermission(user, "edit")) {
        return J({ error: "Permission denied (edit)" }, 403);
      }
      const id = String(body.id || "").trim();
      if (!id) return J({ error: "Invoice id required" }, 400);

      const { data: existing, error: fetchErr } = await db.from("invoices").select("*").eq("id", id).maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!existing) return J({ error: "Invoice not found" }, 404);
      if (existing.status === "paid") return J({ ok: true, invoice: existing, customer: null });
      if (existing.status === "cancelled") {
        return J({ error: "Cancelled invoices cannot be marked paid" }, 400);
      }

      const now = new Date().toISOString();
      const paidBy = String(body.paidBy ?? body.paid_by ?? user.name ?? "Staff").trim();
      const { data, error } = await db.from("invoices")
        .update({ status: "paid", paid_by: paidBy, paid_at: now, updated_at: now })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;

      let customerRow: Record<string, unknown> | null = null;
      if (existing.customer_id != null) {
        const { data: cust, error: custErr } = await db.from("customers")
          .select("*")
          .eq("id", existing.customer_id)
          .maybeSingle();
        if (custErr) throw custErr;
        if (cust) {
          const paidTotal = Number(existing.total) || 0;
          const totalSpent = (Number(cust.total_spent) || 0) + paidTotal;
          const { data: updatedCust, error: updErr } = await db.from("customers")
            .update({
              total_spent: totalSpent,
              tier: calcCustomerTier(totalSpent),
              updated_at: now,
            })
            .eq("id", existing.customer_id)
            .select("*")
            .single();
          if (updErr) throw updErr;
          customerRow = updatedCust;
        }
      }

      return J({ ok: true, invoice: data, customer: customerRow });
    }

    if (body.action === "cancel_invoice") {
      const refundCancel = Boolean(body.refund);
      const skipKoiRestore = Boolean(body.skipKoiRestore);
      const refundReason = String(body.refundReason ?? body.refund_reason ?? "").trim();
      if (!hasPermission(user, "invoices")) {
        return J({ error: "Permission denied (invoices)" }, 403);
      }
      if (refundCancel) {
        if (!hasPermission(user, "refund")) {
          return J({ error: "Permission denied (refund)" }, 403);
        }
      } else if (!hasPermission(user, "delete")) {
        return J({ error: "Permission denied (delete)" }, 403);
      }
      const id = String(body.id || "").trim();
      if (!id) return J({ error: "Invoice id required" }, 400);

      const { data: existing, error: fetchErr } = await db.from("invoices").select("*").eq("id", id).maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!existing) return J({ error: "Invoice not found" }, 404);
      if (existing.status === "cancelled") return J({ ok: true, invoice: existing, customer: null });
      if (existing.status === "paid" && !refundCancel) {
        return J({ error: "Paid invoices cannot be cancelled" }, 400);
      }

      const now = new Date().toISOString();
      const creditNote = refundCancel
        ? `\nCredit note / koi refund (${nullableDate(now) || now.slice(0, 10)}): ${refundReason || "Koi sale refunded"}`
        : "";
      const nextNotes = `${String(existing.notes || "").trim()}${creditNote}`.trim();
      const { data, error } = await db.from("invoices")
        .update({
          status: "cancelled",
          notes: nextNotes,
          booked: false,
          booked_at: null,
          booked_by: "",
          updated_at: now,
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;

      let customerRow: Record<string, unknown> | null = null;
      if (existing.status === "paid" && existing.customer_id != null) {
        const { data: cust, error: custErr } = await db.from("customers")
          .select("*")
          .eq("id", existing.customer_id)
          .maybeSingle();
        if (custErr) throw custErr;
        if (cust) {
          const paidTotal = Number(existing.total) || 0;
          const totalSpent = Math.max(0, (Number(cust.total_spent) || 0) - paidTotal);
          const { data: updatedCust, error: updErr } = await db.from("customers")
            .update({
              total_spent: totalSpent,
              tier: calcCustomerTier(totalSpent),
              updated_at: now,
            })
            .eq("id", existing.customer_id)
            .select("*")
            .single();
          if (updErr) throw updErr;
          customerRow = updatedCust;
        }
      }

      if (refundCancel) {
        await restoreKoiForRefundOnServer(db, existing.items || [], now);
      } else if (!skipKoiRestore) {
        await restoreInvoiceKoiSalesOnServer(db, existing.items || [], now);
      }
      await restoreStockForInvoiceOnServer(db, id, existing.items || [], {
        by: user.name || "Staff",
        now,
        invoiceDate: nullableDate(existing.date),
      });
      return J({ ok: true, invoice: data, customer: customerRow });
    }

    if (body.action === "mark_invoice_booked") {
      if (!hasPermission(user, "accounting")) {
        return J({ error: "Permission denied (accounting)" }, 403);
      }
      const id = String(body.id || "").trim();
      if (!id) return J({ error: "Invoice id required" }, 400);
      const booked = Boolean(body.booked);
      const bookedBy = String(body.bookedBy ?? body.booked_by ?? user.name ?? "").trim();

      const { data: existing, error: fetchErr } = await db.from("invoices").select("*").eq("id", id).maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!existing) return J({ error: "Invoice not found" }, 404);
      if (existing.status === "cancelled") {
        return J({ error: "Cancelled invoices cannot be marked in accounts" }, 400);
      }

      const now = new Date().toISOString();
      const patch = booked
        ? { booked: true, booked_at: now, booked_by: bookedBy, updated_at: now }
        : { booked: false, booked_at: null, booked_by: "", updated_at: now };

      const { data, error } = await db.from("invoices")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return J({ ok: true, invoice: data });
    }

    if (body.action === "upsert_invoice") {
      if (!hasPermission(user, "invoices")) {
        return J({ error: "Permission denied (invoices)" }, 403);
      }
      const incoming = (body.invoice || {}) as Record<string, unknown>;
      const id = String(incoming.id || "").trim();
      if (!id) return J({ error: "Invoice id required" }, 400);

      const items = sanitizeInvoiceItems(incoming.items);
      if (!items.length) return J({ error: "At least one invoice item is required" }, 400);
      const customerName = String(incoming.customerName ?? incoming.customer_name ?? "").trim();
      if (!customerName) return J({ error: "Customer name is required" }, 400);
      const incomingStatus = String(incoming.status ?? "pending");
      if (incomingStatus === "paid") {
        return J({ error: "Create invoices as pending; use mark_invoice_paid to record payment" }, 400);
      }
      if (incomingStatus === "cancelled") {
        return J({ error: "Use cancel_invoice to void an invoice" }, 400);
      }

      const createOnly = Boolean(body.createOnly);
      if (!createOnly) {
        const { data: existingRow, error: existingErr } = await db.from("invoices").select("id").eq("id", id).maybeSingle();
        if (existingErr) throw existingErr;
        if (existingRow && !hasPermission(user, "edit")) {
          return J({ error: "Permission denied (edit)" }, 403);
        }
      }

      const now = new Date().toISOString();
      const row = {
        id,
        customer_id: invoiceCustomerId(incoming),
        customer_name: incoming.customerName ?? incoming.customer_name ?? "",
        customer_phone: incoming.customerPhone ?? incoming.customer_phone ?? "",
        customer_whatsapp: incoming.customerWhatsapp ?? incoming.customer_whatsapp ?? "",
        customer_address: incoming.customerAddress ?? incoming.customer_address ?? "",
        items,
        total: nullableNumeric(incoming.total),
        status: incomingStatus,
        date: nullableDate(incoming.date),
        due_date: nullableDate(incoming.due ?? incoming.due_date),
        notes: incoming.notes ?? "",
        discount_type: incoming.discountType ?? incoming.discount_type ?? "none",
        discount_value: nullableNumeric(incoming.discountValue ?? incoming.discount_value),
        shipping: nullableNumeric(incoming.shipping),
        tax: nullableNumeric(incoming.tax),
        booked: Boolean(incoming.booked),
        booked_at: nullableTimestamptz(incoming.bookedAt ?? incoming.booked_at),
        booked_by: incoming.bookedBy ?? incoming.booked_by ?? "",
        created_by: incoming.createdBy ?? incoming.created_by ?? "",
        updated_at: now,
      };

      const invoiceIdConflict = () => J({
        error: `Invoice number ${id} is already in use. Refresh the page and try again.`,
      }, 409);

      if (createOnly) {
        const { data: existing, error: fetchErr } = await db.from("invoices").select("id").eq("id", id).maybeSingle();
        if (fetchErr) throw fetchErr;
        if (existing) return invoiceIdConflict();

        const { data, error } = await db.from("invoices").insert(row).select("*").single();
        if (error) {
          if (error.code === "23505") return invoiceIdConflict();
          throw error;
        }
        const createdBy = String(incoming.createdBy ?? incoming.created_by ?? user.name ?? "Staff");
        try {
          await clearSyncTombstones(db, "invoices", [id]);
          await applyInvoiceKoiSalesOnServer(db, items, invoiceCustomerId(incoming), nullableDate(row.date), now);
          await deductStockForInvoiceOnServer(db, id, items, {
            by: createdBy,
            now,
            invoiceDate: nullableDate(row.date),
          });
        } catch (sideErr) {
          await db.from("invoices").delete().eq("id", id);
          throw sideErr;
        }
        return J({ ok: true, invoice: data });
      }

      const { data, error } = await db.from("invoices").upsert(row, { onConflict: "id" }).select("*").single();
      if (error) throw error;
      await clearSyncTombstones(db, "invoices", [id]);
      await applyInvoiceKoiSalesOnServer(db, items, invoiceCustomerId(incoming), nullableDate(row.date), now);
      return J({ ok: true, invoice: data });
    }

    if (body.action === "sync") {
      const { entity, data, prune, deletedIds, force } = body;
      const perm = ENTITY_PERMS[entity];
      if (!perm || !hasPermission(user, perm)) {
        return J({ error: `Permission denied (${entity})` }, 403);
      }
      const syncOpts = {
        prune: Boolean(prune),
        deletedIds: Array.isArray(deletedIds) ? deletedIds : [],
        force: Boolean(force),
      };
      const withTs = (fields: Record<string, unknown>, client: Record<string, unknown>) => ({
        ...fields,
        updated_at: client.updatedAt ?? client.updated_at ?? undefined,
      });

      if (entity === "users") {
        if (!hasPermission(user, "users")) {
          return J({ error: "Permission denied (users)" }, 403);
        }

        for (const u of data || []) {
          if (!u.name?.trim()) return J({ error: "Name is required" }, 400);
          if (!["owner", "staff"].includes(String(u.role))) {
            return J({ error: "Invalid role" }, 400);
          }
          const permissions = sanitizeFarmPermissions(u.permissions);
          if (!permissions) return J({ error: "At least one valid permission required" }, 400);

          const { data: target } = await db.from("farm_users")
            .select("id, role, active, is_system")
            .eq("id", u.id)
            .maybeSingle();

          const ownerErr = await assertOwnerGuardrails(db, target || {}, {
            role: String(u.role),
            active: u.active !== false,
            permissions,
          });
          if (ownerErr) return J({ error: ownerErr }, 400);

          const row: Record<string, unknown> = {
            name: String(u.name).trim(),
            role: u.role,
            active: u.active !== false,
            permissions,
            is_system: u.isSystem || false,
          };

          let pin_hash: string | undefined;
          if (u.pin && isValidFarmPin(u.pin)) {
            if (await isPinTaken(db, String(u.pin), Number(u.id))) {
              return J({ error: "PIN already in use" }, 400);
            }
            pin_hash = await hashPin(String(u.pin));
            row.pin_hash = pin_hash;
          }

          if (target) {
            const { error } = await db.from("farm_users").update(row).eq("id", u.id);
            if (error) throw error;
          } else if (pin_hash) {
            const { error } = await db.from("farm_users").insert({ id: u.id, ...row });
            if (error) throw error;
          }
        }

        return J({ ok: true });
      }

      if (entity === "customers") {
        const incoming = (data || []) as Record<string, unknown>[];
        const CUSTOMER_TIERS = new Set(["Bronze", "Silver", "Gold", "Platinum"]);
        const customerDeletedIds = (syncOpts.deletedIds || [])
          .map((id) => String(id ?? "").trim())
          .filter(Boolean);
        if (customerDeletedIds.length) {
          const { error: delErr } = await db.from("customers").delete().in("id", customerDeletedIds);
          if (delErr) throw delErr;
        }
        for (const c of incoming) {
          if (!String(c.name ?? "").trim()) return J({ error: "Customer name is required" }, 400);
          const whatsapp = String(c.whatsapp ?? c.phone ?? "").trim();
          if (!whatsapp) return J({ error: "Customer WhatsApp or phone is required" }, 400);
          const totalSpent = nullableNumeric(c.totalSpent ?? c.total_spent, -1);
          if (totalSpent < 0) return J({ error: "Customer total_spent cannot be negative" }, 400);
          const tier = String(c.tier ?? "Bronze");
          if (!CUSTOMER_TIERS.has(tier)) return J({ error: `Invalid customer tier: ${tier}` }, 400);
          const postal = String(c.postalCode ?? c.postal_code ?? "").replace(/\D/g, "");
          if (postal && postal.length !== 6) {
            return J({ error: "Singapore postal code must be 6 digits" }, 400);
          }
        }
        await upsertSync("customers", incoming.map((c) => withTs({
          id: c.id, name: String(c.name ?? "").trim(), phone: c.phone, whatsapp: c.whatsapp, area: c.area,
          postal_code: c.postalCode, address: c.address,
          fish_types: c.fishTypes, tier: c.tier, notes: c.notes, total_spent: c.totalSpent,
        }, c)), "id", { ...syncOpts, deletedIds: [] });
      } else if (entity === "products") {
        const incoming = (data || []) as Record<string, unknown>[];
        const productDeletedIds = (syncOpts.deletedIds || [])
          .map((id) => String(id ?? "").trim())
          .filter(Boolean);
        if (productDeletedIds.length) {
          const { error: delErr } = await db.from("products").delete().in("id", productDeletedIds);
          if (delErr) throw delErr;
        }
        for (const p of incoming) {
          if (!String(p.name ?? "").trim()) return J({ error: "Product name is required" }, 400);
          const price = nullableNumeric(p.price, -1);
          if (price < 0) return J({ error: "Product price cannot be negative" }, 400);
          const trackStock = p.trackStock !== false;
          if (trackStock) {
            const stock = nullableNumeric(p.stock, -1);
            if (stock < 0) return J({ error: "Product stock cannot be negative" }, 400);
            const minStock = nullableNumeric(p.minStock ?? p.min_stock, -1);
            if (minStock < 0) return J({ error: "Min stock cannot be negative" }, 400);
          }
        }
        await upsertSync("products", incoming.map((p) => withTs({
          id: p.id, name: String(p.name ?? "").trim(), category: p.category, sku: p.sku, price: nullableNumeric(p.price),
          cost: nullableNumeric(p.cost ?? 0), unit: p.unit, stock: nullableNumeric(p.stock),
          min_stock: nullableNumeric(p.minStock ?? p.min_stock), description: p.description,
          track_stock: p.trackStock !== false,
        }, p)), "id", { ...syncOpts, deletedIds: [] });
      } else if (entity === "invoices") {
        const incoming = (data || []) as Record<string, unknown>[];
        await upsertSync("invoices", incoming.map((i) => withTs({
          id: i.id,
          customer_id: invoiceCustomerId(i),
          customer_name: i.customerName ?? i.customer_name ?? "",
          customer_phone: i.customerPhone ?? i.customer_phone ?? "",
          customer_whatsapp: i.customerWhatsapp ?? i.customer_whatsapp ?? "",
          customer_address: i.customerAddress ?? i.customer_address ?? "",
          items: sanitizeInvoiceItems(i.items),
          total: nullableNumeric(i.total),
          status: i.status ?? "pending",
          date: nullableDate(i.date),
          due_date: nullableDate(i.due ?? i.due_date),
          notes: i.notes ?? "",
          discount_type: i.discountType ?? "none",
          discount_value: nullableNumeric(i.discountValue),
          shipping: nullableNumeric(i.shipping),
          tax: nullableNumeric(i.tax),
          booked: Boolean(i.booked),
          booked_at: nullableTimestamptz(i.bookedAt),
          booked_by: i.bookedBy ?? "",
          created_by: i.createdBy ?? "",
        }, i)), "id", {
          ...syncOpts,
          mergeWithExisting: mergeInvoiceDbRow,
          mergeCompareKeys: [
            "status", "booked", "booked_at", "booked_by", "total", "customer_id",
            "customer_name", "notes", "discount_type", "discount_value", "shipping",
          ],
          beforeDelete: async (ids) => { await deleteInvoicePdfs(db, ids); },
        });
      } else if (entity === "expenses") {
        const incoming = (data || []) as Record<string, unknown>[];
        const EXPENSE_CATEGORIES = new Set([
          "Feed", "Transport", "Utilities", "Rent", "Equipment", "Labor",
          "Medicine", "Packaging", "Marketing", "Other",
        ]);
        const expenseDeletedIds = (syncOpts.deletedIds || [])
          .map((id) => resolveExpenseId(id))
          .filter((id): id is number => id != null);
        if (expenseDeletedIds.length) {
          await deleteExpenseReceiptImages(db, expenseDeletedIds);
          const { error: delErr } = await db.from("expenses").delete().in("id", expenseDeletedIds);
          if (delErr) throw delErr;
        }

        const upsertIncoming: Record<string, unknown>[] = [];
        for (const e of incoming) {
          const expenseId = resolveExpenseId(e.id);
          if (expenseId == null) continue;
          if (!String(e.date ?? "").trim()) {
            e.date = new Date().toISOString().slice(0, 10);
          }
          if (e.amount != null && e.amount !== "") {
            const amt = nullableNumeric(e.amount, -1);
            if (amt < 0) return J({ error: "Expense amount cannot be negative" }, 400);
          }
          if (e.category && !EXPENSE_CATEGORIES.has(String(e.category))) {
            e.category = null;
          }
          upsertIncoming.push(e);
        }
        const rows = await Promise.all(upsertIncoming.map(async (e) => {
          const expenseId = resolveExpenseId(e.id)!;
          let imagePath = normalizeImageUrlForStorage(String(e.imageUrl ?? ""), expenseId);
          let imageData = e.imageData ?? null;
          if (imageData && typeof imageData === "string" && imageData.startsWith("data:image/")) {
            imagePath = await uploadExpenseReceiptImage(db, expenseId, imageData);
            imageData = null;
          } else if (imagePath) {
            imageData = null;
          }
          return withTs({
            id: expenseId, category: e.category ?? null, amount: e.amount ?? null, date: e.date, note: e.note,
            image_data: imageData, image_name: e.imageName ?? "", image_url: imagePath,
            added_by: e.addedBy,
            booked: Boolean(e.booked), booked_at: e.bookedAt ?? null, booked_by: e.bookedBy ?? "",
          }, e);
        }));
        await upsertSync("expenses", rows, "id", {
          ...syncOpts,
          deletedIds: [],
          mergeWithExisting: mergeExpenseDbRow,
          mergeCompareKeys: ["booked", "booked_at", "booked_by", "amount", "category", "date", "note"],
          beforeDelete: async (ids) => { await deleteExpenseReceiptImages(db, ids); },
        });
      } else if (entity === "deliveries") {
        const incoming = (data || []) as Record<string, unknown>[];
        const DELIVERY_STATUSES = new Set(["scheduled", "transit", "delivered", "cancelled"]);
        const deliveryDeletedIds = (syncOpts.deletedIds || [])
          .map((id) => String(id ?? "").trim())
          .filter(Boolean);
        if (deliveryDeletedIds.length) {
          await deleteDeliveryPhotos(db, deliveryDeletedIds);
          const { error: delErr } = await db.from("deliveries").delete().in("id", deliveryDeletedIds);
          if (delErr) throw delErr;
        }
        for (const d of incoming) {
          if (d.id == null || String(d.id).trim() === "") {
            return J({ error: "Delivery id is required" }, 400);
          }
          if (!String(d.customerName ?? d.customer_name ?? "").trim()) {
            return J({ error: "Delivery customer name is required" }, 400);
          }
          if (!String(d.address ?? "").trim()) return J({ error: "Delivery address is required" }, 400);
          if (!String(d.schedule ?? "").trim()) return J({ error: "Delivery schedule is required" }, 400);
          const status = String(d.status ?? "scheduled");
          if (!DELIVERY_STATUSES.has(status)) {
            return J({ error: `Invalid delivery status: ${d.status}` }, 400);
          }
        }
        const deliveryRows = await Promise.all(incoming.map(async (d: Record<string, unknown>) => {
          const deliveryId = String(d.id ?? "").trim();
          let photoPath = normalizeDeliveryPhotoForStorage(String(d.photo ?? ""), deliveryId);
          let photoData = d.photoData ?? null;
          if (photoData && typeof photoData === "string" && photoData.startsWith("data:image/")) {
            photoPath = await uploadDeliveryPhotoImage(db, deliveryId, photoData);
            photoData = null;
          } else if (photoPath) {
            photoData = null;
          }
          return withTs({
            id: deliveryId, invoice_id: d.invoiceId ?? "",
            customer_id: nullableBigint(d.customerId),
            customer_name: d.customerName, area: d.area ?? "",
            postal_code: d.postalCode ?? "", address: d.address, schedule: d.schedule, status: d.status ?? "scheduled",
            items: d.items ?? "", driver: d.driver ?? "", notes: d.notes ?? "", created_by: d.createdBy ?? "",
            assigned_user_ids: normalizeAssignedUserIds(d.assignedUserIds ?? d.assigned_user_ids),
            photo: photoPath, photo_name: d.photoName ?? "",
          }, d);
        }));
        await upsertSyncAssignedTeam("deliveries", deliveryRows, "id", {
          ...syncOpts,
          deletedIds: [],
          beforeDelete: async (ids) => { await deleteDeliveryPhotos(db, ids); },
        });
      } else if (entity === "events") {
        const incoming = (data || []) as Record<string, unknown>[];
        const EVENT_TYPES = new Set(["maintenance", "feeding", "purchase", "customer", "other"]);
        const eventDeletedIds = (syncOpts.deletedIds || [])
          .map((id) => String(id ?? "").trim())
          .filter(Boolean);
        if (eventDeletedIds.length) {
          const { error: delErr } = await db.from("events").delete().in("id", eventDeletedIds);
          if (delErr) throw delErr;
        }
        const upsertIncoming: Record<string, unknown>[] = [];
        for (const e of incoming) {
          if (e.id == null || String(e.id).trim() === "") continue;
          if (!String(e.title ?? "").trim()) continue;
          if (!String(e.date ?? "").trim()) continue;
          const type = String(e.type ?? "other");
          e.type = EVENT_TYPES.has(type) ? type : "other";
          upsertIncoming.push(e);
        }
        await upsertSyncAssignedTeam("events", upsertIncoming.map((e: Record<string, unknown>) => withTs({
          id: e.id, title: e.title, date: e.date, time: e.time ?? "09:00", type: e.type ?? "other",
          note: e.note ?? "", created_by: e.createdBy ?? "",
          pond_reminder_id: e.pondReminderId ?? e.pond_reminder_id ?? "",
          assigned_user_ids: normalizeAssignedUserIds(e.assignedUserIds ?? e.assigned_user_ids),
        }, e)), "id", { ...syncOpts, deletedIds: [] });
      } else if (entity === "stock_activity") {
        const incoming = (data || []) as Record<string, unknown>[];
        const allowedTypes = new Set(["sell", "use", "restock"]);
        for (const l of incoming) {
          const type = String(l.type ?? "").toLowerCase();
          if (!allowedTypes.has(type)) return J({ error: `Invalid stock activity type: ${l.type}` }, 400);
          const qty = nullableNumeric(l.qty, 0);
          if (qty <= 0) return J({ error: "Stock activity quantity must be greater than zero" }, 400);
          if (!String(l.productName ?? l.product_name ?? "").trim() && !nullableBigint(l.productId ?? l.product_id)) {
            return J({ error: "Stock activity requires product id or name" }, 400);
          }
        }
        await upsertSync("stock_activity", incoming.map((l) => withTs({
          id: l.id, product_id: nullableBigint(l.productId ?? l.product_id), product_name: l.productName ?? l.product_name ?? "",
          type: String(l.type ?? "").toLowerCase(),
          qty: nullableNumeric(l.qty), value: l.value ?? l.total ?? null, note: l.note || "",
          date: nullableDate(l.date), added_by: l.by ?? l.added_by ?? "",
        }, l)), "id", { ...syncOpts, preserveClientTimestamp: true });
      } else if (entity === "koi_fish") {
        const incoming = (data || []) as Record<string, unknown>[];
        const KOI_STATUSES = new Set(["available", "sold", "sick", "deceased"]);
        const koiDeletedIds = (syncOpts.deletedIds || [])
          .map((id) => String(id ?? "").trim())
          .filter(Boolean);
        if (koiDeletedIds.length) {
          await deleteKoiFishImages(db, koiDeletedIds);
          const { error: delErr } = await db.from("koi_fish").delete().in("id", koiDeletedIds);
          if (delErr) throw delErr;
        }
        const upsertIncoming: Record<string, unknown>[] = [];
        for (const k of incoming) {
          if (!String(k.id ?? "").trim()) continue;
          if (!String(k.variety ?? "").trim() && !String(k.name ?? "").trim()) continue;
          const price = nullableNumeric(k.price, -1);
          if (price < 0) return J({ error: "Koi price cannot be negative" }, 400);
          const status = String(k.status ?? "available").toLowerCase();
          k.status = KOI_STATUSES.has(status) ? status : "available";
          if (k.status === "sold" && k.soldTo == null && k.sold_to == null) continue;
          upsertIncoming.push(k);
        }
        const rows = await Promise.all(upsertIncoming.map(async (k) => withTs({
          id: k.id,
          photo: await resolveKoiFishPhoto(db, k.id, k.photo),
          name: k.name ?? "",
          variety: k.variety ?? "",
          size: k.size ?? null,
          grade: k.grade ?? "",
          pond_name: k.pondName ?? "",
          price: k.price ?? 0,
          notes: k.notes ?? "",
          status: k.status ?? "available",
          date_added: k.dateAdded ?? null,
          sold_to: nullableBigint(k.soldTo),
          sold_date: k.soldDate ?? null,
          sold_price: k.soldPrice ?? null,
          sell_disposition: k.sellDisposition ?? null,
          keep_pond_name: k.keepPondName ?? null,
          death_date: k.deathDate ?? null,
          death_cause: k.deathCause ?? null,
          death_photo: await resolveKoiFishDeathPhoto(db, k.id, k.deathPhoto ?? k.death_photo),
        }, k)));
        await upsertSync("koi_fish", rows, "id", {
          ...syncOpts,
          deletedIds: [],
          mergeWithExisting: mergeKoiDbRow,
          mergeCompareKeys: [
            "status", "sold_to", "sold_date", "sold_price", "sell_disposition", "keep_pond_name",
            "pond_name", "price", "name", "variety",
          ],
          beforeDelete: async (ids) => { await deleteKoiFishImages(db, ids); },
        });
      } else if (entity === "customer_koi") {
        const incoming = (data || []) as Record<string, unknown>[];
        const CKOI_STATUSES = new Set(["in_pond", "collected", "deceased"]);
        const ckoiDeletedIds = (syncOpts.deletedIds || [])
          .map((id) => String(id ?? "").trim())
          .filter(Boolean);
        if (ckoiDeletedIds.length) {
          await deleteCustomerKoiImages(db, ckoiDeletedIds);
          const { error: delErr } = await db.from("customer_koi").delete().in("id", ckoiDeletedIds);
          if (delErr) throw delErr;
        }
        const upsertIncoming: Record<string, unknown>[] = [];
        for (const r of incoming) {
          if (!String(r.id ?? "").trim()) continue;
          if (r.customerId == null && r.customer_id == null) continue;
          if (!String(r.variety ?? "").trim()) continue;
          const price = nullableNumeric(r.purchasePrice ?? r.purchase_price, -1);
          if (price < 0) return J({ error: "Purchase price cannot be negative" }, 400);
          const status = String(r.status ?? "in_pond").toLowerCase();
          r.status = CKOI_STATUSES.has(status) ? status : "in_pond";
          if (r.status === "in_pond" && !String(r.pondName ?? r.pond_name ?? "").trim()) continue;
          upsertIncoming.push(r);
        }
        const rows = await Promise.all(upsertIncoming.map(async (r) => withTs({
          id: r.id,
          customer_id: nullableBigint(r.customerId),
          customer_name: r.customerName ?? "",
          koi_id: r.koiId ?? "",
          photo: await resolveCustomerKoiPhoto(db, r.id, r.photo),
          fish_name: r.fishName ?? "",
          variety: r.variety ?? "",
          size: r.size ?? null,
          pond_name: r.pondName ?? "",
          purchase_date: r.purchaseDate ?? null,
          purchase_price: r.purchasePrice ?? 0,
          notes: r.notes ?? "",
          status: r.status ?? "in_pond",
          collected_date: r.collectedDate ?? null,
          death_date: r.deathDate ?? null,
          death_cause: r.deathCause ?? null,
          death_photo: await resolveCustomerKoiDeathPhoto(db, r.id, r.deathPhoto ?? r.death_photo),
          death_notes: r.deathNotes ?? "",
        }, r)));
        await upsertSync("customer_koi", rows, "id", {
          ...syncOpts,
          deletedIds: [],
          beforeDelete: async (ids) => { await deleteCustomerKoiImages(db, ids); },
        });
      } else if (entity === "farm_pond_data") {
        const raw = data && typeof data === "object" ? { ...(data as Record<string, unknown>) } : {};
        const ponds = Array.isArray(raw.ponds) ? raw.ponds as Record<string, unknown>[] : [];
        const POND_TYPES = new Set(["koi", "arowana", "quarantine", "display"]);
        for (const p of ponds) {
          if (!String(p.id ?? "").trim()) return J({ error: "Pond id is required" }, 400);
          if (!String(p.name ?? "").trim()) return J({ error: "Pond name is required" }, 400);
          const vol = nullableNumeric(p.volume, -1);
          if (vol < 0) return J({ error: "Pond volume cannot be negative" }, 400);
          if (p.type && !POND_TYPES.has(String(p.type))) {
            return J({ error: `Invalid pond type: ${p.type}` }, 400);
          }
        }
        const clientTs = raw.updatedAt ?? raw.updated_at;
        delete raw.updatedAt;
        delete raw.updated_at;
        const { data: existing } = await db.from("farm_pond_data").select("updated_at").eq("id", "default").maybeSingle();
        if (!force && existing?.updated_at && clientTs) {
          const clientTime = new Date(String(clientTs)).getTime();
          const serverTime = new Date(String(existing.updated_at)).getTime();
          if (Number.isFinite(clientTime) && clientTime < serverTime) {
            return J({ ok: true, skipped: true });
          }
        }
        const { error } = await db.from("farm_pond_data").upsert(
          { id: "default", data: raw, updated_at: new Date().toISOString() },
          { onConflict: "id" },
        );
        if (error) throw error;
      } else if (entity === "whatsapp_groups") {
        const groupDeletedIds = (syncOpts.deletedIds || [])
          .map((id) => String(id ?? "").trim())
          .filter(Boolean);
        if (groupDeletedIds.length) {
          const { error: delErr } = await db.from("whatsapp_groups").delete().in("id", groupDeletedIds);
          if (delErr) throw delErr;
        }
        await upsertSync("whatsapp_groups", (data || []).map((g: Record<string, unknown>) => withTs({
          id: g.id, name: g.name ?? "", link: g.link ?? "",
        }, g)), "id", { ...syncOpts, deletedIds: [] });
      } else {
        return J({ error: "Unknown entity" }, 400);
      }

      return J({ ok: true });
    }

    if (body.action === "seed") {
      if (user.role !== "owner") return J({ error: "Permission denied" }, 403);
      const { seed } = body;
      if (seed?.customers?.length) {
        await db.from("customers").insert(seed.customers.map((c: Record<string, unknown>) => ({
          name: c.name, phone: c.phone, whatsapp: c.whatsapp, area: c.area,
          postal_code: c.postalCode, address: c.address,
          fish_types: c.fishTypes, tier: c.tier, notes: c.notes, total_spent: c.totalSpent,
        })));
      }
      if (seed?.products?.length) {
        await db.from("products").insert(seed.products.map((p: Record<string, unknown>) => ({
          name: p.name, category: p.category, sku: p.sku, price: p.price, cost: p.cost,
          unit: p.unit, stock: p.stock, min_stock: p.minStock, description: p.description,
        })));
      }
      if (seed?.invoices?.length) {
        await db.from("invoices").insert(seed.invoices.map((i: Record<string, unknown>) => ({
          id: i.id,
          customer_id: nullableBigint(i.customerId),
          customer_name: i.customerName,
          items: sanitizeInvoiceItems(i.items),
          total: nullableNumeric(i.total),
          status: i.status,
          date: i.date,
          due_date: i.due,
          notes: i.notes,
          discount_type: i.discountType ?? "none",
          discount_value: nullableNumeric(i.discountValue),
          shipping: nullableNumeric(i.shipping),
          tax: nullableNumeric(i.tax),
          booked: Boolean(i.booked),
          booked_at: nullableTimestamptz(i.bookedAt),
          booked_by: i.bookedBy ?? "",
        })));
      }
      if (seed?.expenses?.length) {
        await db.from("expenses").insert(seed.expenses.map((e: Record<string, unknown>) => ({
          category: e.category ?? null, amount: e.amount ?? null, date: e.date, note: e.note,
          image_data: e.imageData ?? null, image_name: e.imageName ?? "", image_url: e.imageUrl ?? "",
          added_by: e.addedBy,
          booked: Boolean(e.booked), booked_at: e.bookedAt ?? null, booked_by: e.bookedBy ?? "",
        })));
      }
      if (seed?.deliveries?.length) {
        await db.from("deliveries").insert(seed.deliveries.map((d: Record<string, unknown>) => ({
          id: d.id, customer_id: d.customerId, customer_name: d.customerName, area: d.area,
          postal_code: d.postalCode, address: d.address, schedule: d.schedule, status: d.status, items: d.items,
          driver: d.driver, notes: d.notes, created_by: d.createdBy ?? "",
        })));
      }
      if (seed?.events?.length) {
        await db.from("events").insert(seed.events.map((e: Record<string, unknown>) => ({
          title: e.title, date: e.date, time: e.time, type: e.type, note: e.note, created_by: e.createdBy ?? "",
        })));
      }
      return J({ ok: true });
    }

    if (body.action === "add_user") {
      if (!hasPermission(user, "users")) {
        return J({ error: "Permission denied" }, 403);
      }
      const { name, role, pin, permissions, active } = body;
      if (!name?.trim()) return J({ error: "Name is required" }, 400);
      if (!isValidFarmPin(pin, { required: true })) {
        return J({ error: "PIN must be 4–6 digits" }, 400);
      }
      const cleanPermissions = sanitizeFarmPermissions(permissions);
      if (!cleanPermissions) return J({ error: "At least one valid permission required" }, 400);
      if (!["owner", "staff"].includes(role)) return J({ error: "Invalid role" }, 400);

      if (await isPinTaken(db, String(pin))) {
        return J({ error: "PIN already in use" }, 400);
      }

      const pin_hash = await hashPin(String(pin));
      const { data: created, error } = await db.from("farm_users").insert({
        name: String(name).trim(),
        role,
        pin_hash,
        active: active !== false,
        permissions: cleanPermissions,
        is_system: false,
      }).select("id, name, role, active, permissions, is_system").single();
      if (error) return J({ error: error.message }, 500);

      return J({ ok: true, user: mapUsers([created])[0] });
    }

    if (body.action === "update_user") {
      if (!hasPermission(user, "users")) {
        return J({ error: "Permission denied" }, 403);
      }
      const { userId, name, role, pin, permissions, active } = body;
      if (userId == null) return J({ error: "userId required" }, 400);
      if (!name?.trim()) return J({ error: "Name is required" }, 400);
      const cleanPermissions = sanitizeFarmPermissions(permissions);
      if (!cleanPermissions) return J({ error: "At least one valid permission required" }, 400);
      if (!["owner", "staff"].includes(role)) return J({ error: "Invalid role" }, 400);

      const nextActive = active !== false;
      if (Number(userId) === user.id && !nextActive) {
        return J({ error: "You cannot deactivate your own account" }, 400);
      }

      const { data: target, error: fetchErr } = await db.from("farm_users")
        .select("id, role, active, is_system, permissions")
        .eq("id", userId)
        .maybeSingle();
      if (fetchErr || !target) return J({ error: "User not found" }, 404);

      const ownerErr = await assertOwnerGuardrails(db, target, {
        role,
        active: nextActive,
        permissions: cleanPermissions,
      });
      if (ownerErr) return J({ error: ownerErr }, 400);

      const pinChanging = Boolean(pin && isValidFarmPin(pin));
      const profileChanged = String(name).trim() !== String(target.name ?? "").trim()
        || role !== target.role
        || nextActive !== (target.active !== false)
        || !farmPermissionsEqual(target.permissions, cleanPermissions)
        || pinChanging;

      const row: Record<string, unknown> = {
        name: String(name).trim(),
        role,
        active: nextActive,
        permissions: cleanPermissions,
      };
      if (pinChanging) {
        if (await isPinTaken(db, String(pin), Number(userId))) {
          return J({ error: "PIN already in use" }, 400);
        }
        row.pin_hash = await hashPin(String(pin));
      }

      const { data: updated, error } = await db.from("farm_users")
        .update(row)
        .eq("id", userId)
        .select("id, name, role, active, permissions, is_system")
        .single();
      if (error) return J({ error: error.message }, 500);

      if (profileChanged) {
        await revokeUserSessions(db, [userId]);
      }

      return J({ ok: true, user: mapUsers([updated])[0] });
    }

    if (body.action === "delete_user") {
      if (!hasPermission(user, "users")) {
        return J({ error: "Permission denied" }, 403);
      }
      const userId = body.userId;
      if (userId == null) return J({ error: "userId required" }, 400);
      if (Number(userId) === user.id) {
        return J({ error: "Cannot delete your own account" }, 400);
      }

      const { data: target, error: fetchErr } = await db.from("farm_users")
        .select("id, role, active, is_system")
        .eq("id", userId)
        .maybeSingle();
      if (fetchErr || !target) return J({ error: "User not found" }, 404);
      if (target.is_system) {
        return J({ error: "Cannot delete the system owner account" }, 400);
      }

      if (target.role === "owner" && target.active !== false) {
        const { count } = await db.from("farm_users")
          .select("*", { count: "exact", head: true })
          .eq("role", "owner")
          .eq("active", true);
        if ((count || 0) <= 1) {
          return J({ error: "At least one active owner is required" }, 400);
        }
      }

      await deleteFarmUsers(db, [userId]);
      return J({ ok: true });
    }

    if (body.action === "ai_usage_stats") {
      if (user.role !== "owner") {
        return J({ error: "Owner access only" }, 403);
      }
      const [today, week] = await Promise.all([
        fetchTodayUsageByUser(),
        fetchWeekUsageByUser(),
      ]);
      return J({ today, week });
    }

    if (body.action === "get_push_config") {
      return J({
        enabled: isPushConfigured(),
        publicKey: getVapidPublicKey(),
      });
    }

    if (body.action === "register_push_subscription") {
      const sub = body.subscription as Record<string, unknown> | undefined;
      const endpoint = String(sub?.endpoint || "").trim();
      const keys = sub?.keys as Record<string, unknown> | undefined;
      const p256dh = String(keys?.p256dh || "").trim();
      const authKey = String(keys?.auth || "").trim();
      if (!endpoint || !p256dh || !authKey) {
        return J({ error: "Valid push subscription required" }, 400);
      }
      if (!isPushConfigured()) {
        return J({ error: "Push notifications are not configured on the server" }, 503);
      }
      const now = new Date().toISOString();
      const { error } = await db.from("push_subscriptions").upsert({
        user_id: user.id,
        endpoint,
        p256dh,
        auth: authKey,
        user_agent: String(req.headers.get("user-agent") || "").slice(0, 500),
        updated_at: now,
      }, { onConflict: "user_id,endpoint" });
      if (error) throw error;
      return J({ ok: true });
    }

    if (body.action === "unregister_push_subscription") {
      const endpoint = String(body.endpoint || "").trim();
      if (!endpoint) return J({ error: "endpoint required" }, 400);
      await db.from("push_subscriptions").delete()
        .eq("user_id", user.id)
        .eq("endpoint", endpoint);
      return J({ ok: true });
    }

    if (body.action === "send_push_test") {
      if (!isPushConfigured()) {
        return J({ error: "Push notifications are not configured on the server" }, 503);
      }
      const { data: rows, error } = await db.from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", user.id)
        .limit(1);
      if (error) throw error;
      const row = rows?.[0];
      if (!row) return J({ error: "No push subscription for this device. Enable notifications first." }, 400);
      const result = await sendPushToSubscription(row, {
        title: "Marugen Farm",
        body: "Phone notifications are working.",
        url: "/?tab=dashboard",
        tag: "push-test",
      });
      if (!result.ok) return J({ error: result.error }, 500);
      return J({ ok: true });
    }

    if (body.action === "notify_team_push") {
      const title = String(body.title || "").trim().slice(0, 120);
      const pushBody = String(body.body || body.message || "").trim().slice(0, 500);
      const url = String(body.url || "/?tab=dashboard").slice(0, 500);
      const tag = String(body.tag || "team-activity").slice(0, 64);
      const actor = String(body.actor || user.name || "Unknown").trim().slice(0, 80);
      const actorRole = String(body.actorRole || user.role || "staff").trim().slice(0, 40);
      const notificationType = String(body.type || "info").trim().slice(0, 20);
      if (!title) return J({ error: "title required" }, 400);

      const targetUserIds = normalizeAssignedUserIds(body.targetUserIds ?? body.target_user_ids);

      const feedRow: Record<string, unknown> = {
        title,
        message: pushBody || title,
        actor,
        actor_role: actorRole,
        actor_user_id: user.id,
        notification_type: notificationType,
        url,
        tag,
      };
      if (targetUserIds.length) feedRow.target_user_ids = targetUserIds;

      let { error: feedError } = await db.from("team_notifications").insert(feedRow);
      if (feedError && targetUserIds.length && String(feedError.message || "").includes("target_user_ids")) {
        delete feedRow.target_user_ids;
        ({ error: feedError } = await db.from("team_notifications").insert(feedRow));
      }
      if (feedError) throw feedError;

      if (!isPushConfigured()) return J({ ok: true, skipped: true, sent: 0, removed: 0 });
      const payload = { title, body: pushBody || title, url, tag };
      const stats = targetUserIds.length
        ? await sendPushToUserIds(db, targetUserIds, payload, { excludeUserId: user.id })
        : await sendPushToAllFarmUsers(db, payload, { excludeUserId: user.id });
      return J({ ok: true, ...stats });
    }

    if (body.action === "notify_self_push") {
      const title = String(body.title || "").trim().slice(0, 120);
      const pushBody = String(body.body || body.message || "").trim().slice(0, 500);
      const url = String(body.url || "/?tab=dashboard").slice(0, 500);
      const tag = String(body.tag || "self-alert").slice(0, 64);
      if (!title) return J({ error: "title required" }, 400);
      if (!isPushConfigured()) return J({ ok: true, skipped: true });
      const stats = await sendPushToUserIds(db, [user.id], {
        title,
        body: pushBody || title,
        url,
        tag,
      });
      return J({ ok: true, ...stats });
    }

    return J({ error: "Unknown action" }, 400);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, req);
  }
});
