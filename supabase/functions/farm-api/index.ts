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
import { hashPin, verifyPin } from "../_shared/pin.ts";
import { purgeExpiredCloudData } from "../_shared/retention.ts";
import {
  adminClient,
  hasPermission,
  sessionTokenFrom,
  type SessionUser,
  validateSession,
} from "../_shared/supabase.ts";
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

async function deleteFarmUsers(db: ReturnType<typeof adminClient>, userIds: (string | number)[]) {
  if (!userIds.length) return;
  await db.from("auth_sessions").delete().in("user_id", userIds);
  await db.from("ai_usage_daily").delete().in("user_id", userIds);
  const { error } = await db.from("farm_users").delete().in("id", userIds);
  if (error) throw error;
}

async function upsertSync(
  table: string,
  rows: Record<string, unknown>[],
  idField: string,
  options: {
    prune?: boolean;
    deletedIds?: unknown[];
    beforeDelete?: (ids: unknown[]) => Promise<void>;
  } = {},
) {
  const db = adminClient();
  const now = new Date().toISOString();
  const { prune = false, deletedIds = [], beforeDelete } = options;

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
  const { data: existingRows } = ids.length
    ? await db.from(table).select(`${idField}, updated_at`).in(idField, ids)
    : { data: [] as Record<string, unknown>[] };
  const existingMap = new Map(
    (existingRows || []).map((r) => [normId(r[idField]), r.updated_at as string | null]),
  );

  const toUpsert = rows.filter((row) => {
    const serverTs = existingMap.get(normId(row[idField]));
    if (!serverTs) return true;
    const clientRaw = row.updated_at ?? row.updatedAt;
    if (!clientRaw) return false;
    const clientTs = new Date(String(clientRaw)).getTime();
    const serverTime = new Date(String(serverTs)).getTime();
    return Number.isFinite(clientTs) && clientTs >= serverTime;
  }).map((row) => {
    const next = { ...row, updated_at: now };
    delete next.updatedAt;
    return next;
  });

  if (toUpsert.length) {
    const { error } = await db.from(table).upsert(toUpsert, { onConflict: idField });
    if (error) throw error;
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

      const teamNotifSince = new Date();
      teamNotifSince.setDate(teamNotifSince.getDate() - 30);

      const [
        users, customers, products, invoices, expenses, deliveries, events, stockActivity,
        koiFish, customerKoi, pondRow, whatsappGroups, teamNotifications,
      ] = await Promise.all([
        db.from("farm_users").select("id, name, role, active, permissions, is_system").order("id"),
        db.from("customers").select("*").order("id"),
        db.from("products").select("*").order("id"),
        db.from("invoices").select("*").order("date", { ascending: false }),
        db.from("expenses").select("*").order("id"),
        db.from("deliveries").select("*").order("schedule"),
        db.from("events").select("*").order("date"),
        db.from("stock_activity").select("*").order("id", { ascending: false }),
        db.from("koi_fish").select("*").order("date_added", { ascending: false }),
        db.from("customer_koi").select("*").order("purchase_date", { ascending: false }),
        db.from("farm_pond_data").select("data, updated_at").eq("id", "default").maybeSingle(),
        db.from("whatsapp_groups").select("*").order("name"),
        db.from("team_notifications")
          .select("id, title, message, actor, actor_role, actor_user_id, notification_type, url, tag, target_user_ids, created_at")
          .gte("created_at", teamNotifSince.toISOString())
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const errors = [
        users, customers, products, invoices, expenses, deliveries, events, stockActivity,
        koiFish, customerKoi, pondRow, whatsappGroups, teamNotifications,
      ].map((r) => r.error).filter(Boolean);
      if (errors.length) return J({ error: errors[0]!.message }, 500);

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
        deliveries: permittedRows(user, "deliveries", deliveries.data || []),
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
        teamNotifications: (teamNotifications.data || []).filter((row: Record<string, unknown>) => {
          if (user.role === "owner") return true;
          const targets = row.target_user_ids as number[] | null | undefined;
          if (!targets?.length) return true;
          return targets.some((id) => Number(id) === Number(user.id));
        }),
      });
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

    if (body.action === "mark_invoice_paid") {
      if (!hasPermission(user, "invoices")) {
        return J({ error: "Permission denied (invoices)" }, 403);
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
      const { data, error } = await db.from("invoices")
        .update({ status: "paid", updated_at: now })
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
      if (!hasPermission(user, "invoices")) {
        return J({ error: "Permission denied (invoices)" }, 403);
      }
      if (!hasPermission(user, "delete")) {
        return J({ error: "Permission denied (delete)" }, 403);
      }
      const id = String(body.id || "").trim();
      if (!id) return J({ error: "Invoice id required" }, 400);

      const { data: existing, error: fetchErr } = await db.from("invoices").select("*").eq("id", id).maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!existing) return J({ error: "Invoice not found" }, 404);
      if (existing.status === "cancelled") return J({ ok: true, invoice: existing });
      if (existing.status === "paid") {
        return J({ error: "Paid invoices cannot be cancelled" }, 400);
      }

      const now = new Date().toISOString();
      const { data, error } = await db.from("invoices")
        .update({ status: "cancelled", updated_at: now })
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
        booked: Boolean(incoming.booked),
        booked_at: nullableTimestamptz(incoming.bookedAt ?? incoming.booked_at),
        booked_by: incoming.bookedBy ?? incoming.booked_by ?? "",
        created_by: incoming.createdBy ?? incoming.created_by ?? "",
        updated_at: now,
      };

      const { data, error } = await db.from("invoices").upsert(row, { onConflict: "id" }).select("*").single();
      if (error) throw error;
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
        }, c)), "id", syncOpts);
      } else if (entity === "products") {
        const incoming = (data || []) as Record<string, unknown>[];
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
        }, p)), "id", syncOpts);
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
          booked: Boolean(i.booked),
          booked_at: nullableTimestamptz(i.bookedAt),
          booked_by: i.bookedBy ?? "",
          created_by: i.createdBy ?? "",
        }, i)), "id", {
          ...syncOpts,
          beforeDelete: async (ids) => { await deleteInvoicePdfs(db, ids); },
        });
      } else if (entity === "expenses") {
        const incoming = (data || []) as Record<string, unknown>[];
        const EXPENSE_CATEGORIES = new Set([
          "Feed", "Transport", "Utilities", "Rent", "Equipment", "Labor",
          "Medicine", "Packaging", "Marketing", "Other",
        ]);
        for (const e of incoming) {
          const expenseId = resolveExpenseId(e.id);
          if (expenseId == null) {
            return J({ error: `Invalid expense id: ${e.id}` }, 400);
          }
          if (!String(e.date ?? "").trim()) return J({ error: "Expense date is required" }, 400);
          if (e.amount != null && e.amount !== "") {
            const amt = nullableNumeric(e.amount, -1);
            if (amt < 0) return J({ error: "Expense amount cannot be negative" }, 400);
          }
          if (e.category && !EXPENSE_CATEGORIES.has(String(e.category))) {
            return J({ error: `Invalid expense category: ${e.category}` }, 400);
          }
        }
        const rows = await Promise.all(incoming.map(async (e) => {
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
          beforeDelete: async (ids) => { await deleteExpenseReceiptImages(db, ids); },
        });
      } else if (entity === "deliveries") {
        const incoming = (data || []) as Record<string, unknown>[];
        const DELIVERY_STATUSES = new Set(["scheduled", "transit", "delivered", "cancelled"]);
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
        await upsertSync("deliveries", incoming.map((d: Record<string, unknown>) => withTs({
          id: d.id, invoice_id: d.invoiceId ?? "",
          customer_id: nullableBigint(d.customerId),
          customer_name: d.customerName, area: d.area ?? "",
          postal_code: d.postalCode ?? "", address: d.address, schedule: d.schedule, status: d.status ?? "scheduled",
          items: d.items ?? "", driver: d.driver ?? "", notes: d.notes ?? "", created_by: d.createdBy ?? "",
          assigned_user_ids: Array.isArray(d.assignedUserIds) ? d.assignedUserIds : (d.assigned_user_ids ?? []),
        }, d)), "id", syncOpts);
      } else if (entity === "events") {
        const incoming = (data || []) as Record<string, unknown>[];
        const EVENT_TYPES = new Set(["maintenance", "feeding", "purchase", "customer", "other"]);
        for (const e of incoming) {
          if (e.id == null || String(e.id).trim() === "") {
            return J({ error: "Event id is required" }, 400);
          }
          if (!String(e.title ?? "").trim()) return J({ error: "Event title is required" }, 400);
          if (!String(e.date ?? "").trim()) return J({ error: "Event date is required" }, 400);
          const type = String(e.type ?? "other");
          if (!EVENT_TYPES.has(type)) return J({ error: `Invalid event type: ${e.type}` }, 400);
        }
        await upsertSync("events", incoming.map((e: Record<string, unknown>) => withTs({
          id: e.id, title: e.title, date: e.date, time: e.time ?? "09:00", type: e.type ?? "other",
          note: e.note ?? "", created_by: e.createdBy ?? "",
          pond_reminder_id: e.pondReminderId ?? e.pond_reminder_id ?? "",
          assigned_user_ids: Array.isArray(e.assignedUserIds) ? e.assignedUserIds : (e.assigned_user_ids ?? []),
        }, e)), "id", syncOpts);
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
        }, l)), "id", syncOpts);
      } else if (entity === "koi_fish") {
        const incoming = (data || []) as Record<string, unknown>[];
        const KOI_STATUSES = new Set(["available", "sold", "sick", "deceased"]);
        for (const k of incoming) {
          if (!String(k.id ?? "").trim()) return J({ error: "Koi id is required" }, 400);
          if (!String(k.variety ?? "").trim() && !String(k.name ?? "").trim()) {
            return J({ error: "Koi variety or name is required" }, 400);
          }
          const price = nullableNumeric(k.price, -1);
          if (price < 0) return J({ error: "Koi price cannot be negative" }, 400);
          const status = String(k.status ?? "available").toLowerCase();
          if (!KOI_STATUSES.has(status)) return J({ error: `Invalid koi status: ${status}` }, 400);
          if (status === "sold" && k.soldTo == null && k.sold_to == null) {
            return J({ error: "Sold koi must include soldTo (customer id)" }, 400);
          }
        }
        const rows = await Promise.all(incoming.map(async (k) => withTs({
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
          beforeDelete: async (ids) => { await deleteKoiFishImages(db, ids); },
        });
      } else if (entity === "customer_koi") {
        const incoming = (data || []) as Record<string, unknown>[];
        const CKOI_STATUSES = new Set(["in_pond", "collected", "deceased"]);
        for (const r of incoming) {
          if (!String(r.id ?? "").trim()) return J({ error: "Customer koi id is required" }, 400);
          if (r.customerId == null && r.customer_id == null) {
            return J({ error: "Customer id is required" }, 400);
          }
          if (!String(r.variety ?? "").trim()) return J({ error: "Koi variety is required" }, 400);
          const price = nullableNumeric(r.purchasePrice ?? r.purchase_price, -1);
          if (price < 0) return J({ error: "Purchase price cannot be negative" }, 400);
          const status = String(r.status ?? "in_pond").toLowerCase();
          if (!CKOI_STATUSES.has(status)) return J({ error: `Invalid customer koi status: ${status}` }, 400);
          if (status === "in_pond" && !String(r.pondName ?? r.pond_name ?? "").trim()) {
            return J({ error: "Pond name is required when status is in_pond" }, 400);
          }
        }
        const rows = await Promise.all(incoming.map(async (r) => withTs({
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
        await upsertSync("whatsapp_groups", (data || []).map((g: Record<string, unknown>) => withTs({
          id: g.id, name: g.name ?? "", link: g.link ?? "",
        }, g)), "id", syncOpts);
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

      const { data: target, error: fetchErr } = await db.from("farm_users")
        .select("id, role, active, is_system")
        .eq("id", userId)
        .maybeSingle();
      if (fetchErr || !target) return J({ error: "User not found" }, 404);

      const ownerErr = await assertOwnerGuardrails(db, target, {
        role,
        active: active !== false,
        permissions: cleanPermissions,
      });
      if (ownerErr) return J({ error: ownerErr }, 400);

      const row: Record<string, unknown> = {
        name: String(name).trim(),
        role,
        active: active !== false,
        permissions: cleanPermissions,
      };
      if (pin && isValidFarmPin(pin)) {
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

      const rawTargets = body.targetUserIds ?? body.target_user_ids;
      const targetUserIds = Array.isArray(rawTargets)
        ? [...new Set(rawTargets.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0))]
        : [];

      const { error: feedError } = await db.from("team_notifications").insert({
        title,
        message: pushBody || title,
        actor,
        actor_role: actorRole,
        actor_user_id: user.id,
        notification_type: notificationType,
        url,
        tag,
        target_user_ids: targetUserIds.length ? targetUserIds : null,
      });
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
