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

/** Postgres BIGINT columns reject ""; coerce empty/invalid values to null. */
function nullableBigint(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  try {
    const J = (payload: unknown, status = 200) => jsonResponse(payload, status, req);
    const token = sessionTokenFrom(req);
    const user = await validateSession(token);
    if (!user) return J({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const db = adminClient();

    if (body.action === "fetch") {
      await purgeExpiredCloudData(db);

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
        db.from("stock_activity").select("*").order("id", { ascending: false }),
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

      const canManageUsers = hasPermission(user, "users");
      const usersPayload = canManageUsers
        ? (users.data || [])
        : (users.data || []).filter((u) => Number(u.id) === Number(user.id));

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
      });
    }

    if (body.action === "upload_expense_receipt") {
      if (!hasPermission(user, "expenses")) {
        return J({ error: "Permission denied (expenses)" }, 403);
      }
      const { expenseId, imageData, imageName } = body;
      if (expenseId == null) return J({ error: "expenseId required" }, 400);
      if (!imageData || typeof imageData !== "string" || !imageData.startsWith("data:image/")) {
        return J({ error: "Valid image data required" }, 400);
      }
      const path = await uploadExpenseReceiptImage(db, expenseId, imageData);
      const imageUrl = await signExpenseReceiptUrl(db, path, expenseId);
      return J({ imageUrl, imagePath: path, imageName: imageName || "" });
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

      const { data: row, error: fetchErr } = await db.from(target.table)
        .select(target.column)
        .eq("id", recordId)
        .maybeSingle();
      const stored = row?.[target.column as keyof typeof row];
      if (fetchErr || !stored) {
        return J({ error: "Image not found" }, 404);
      }

      const url = await target.sign(db, String(stored), recordId);
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
      if (existing.status === "paid") return J({ ok: true, invoice: existing });
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
      return J({ ok: true, invoice: data });
    }

    if (body.action === "sync") {
      const { entity, data, prune, deletedIds } = body;
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
          if (!Array.isArray(u.permissions) || !u.permissions.length) {
            return J({ error: "At least one permission required" }, 400);
          }

          const { data: target } = await db.from("farm_users")
            .select("id, role, active, is_system")
            .eq("id", u.id)
            .maybeSingle();

          if (target?.is_system && String(u.role) !== "owner") {
            return J({ error: "System owner account must remain an owner" }, 400);
          }

          if (target?.role === "owner" && target.active !== false) {
            const { count } = await db.from("farm_users")
              .select("*", { count: "exact", head: true })
              .eq("role", "owner")
              .eq("active", true);
            if ((count || 0) <= 1) {
              if (String(u.role) !== "owner") {
                return J({ error: "At least one active owner is required" }, 400);
              }
              if (!u.permissions?.includes("users")) {
                return J({ error: "Last owner must keep Team permission" }, 400);
              }
            }
          }

          const row: Record<string, unknown> = {
            name: String(u.name).trim(),
            role: u.role,
            active: u.active !== false,
            permissions: u.permissions,
            is_system: u.isSystem || false,
          };

          let pin_hash: string | undefined;
          if (u.pin && String(u.pin).length >= 4) {
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
        await upsertSync("customers", (data || []).map((c: Record<string, unknown>) => withTs({
          id: c.id, name: c.name, phone: c.phone, whatsapp: c.whatsapp, area: c.area,
          postal_code: c.postalCode, address: c.address,
          fish_types: c.fishTypes, tier: c.tier, notes: c.notes, total_spent: c.totalSpent,
        }, c)), "id", syncOpts);
      } else if (entity === "products") {
        await upsertSync("products", (data || []).map((p: Record<string, unknown>) => withTs({
          id: p.id, name: p.name, category: p.category, sku: p.sku, price: p.price,
          cost: p.cost ?? 0, unit: p.unit, stock: p.stock, min_stock: p.minStock, description: p.description,
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
        const rows = await Promise.all(incoming.map(async (e) => {
          let imagePath = normalizeImageUrlForStorage(String(e.imageUrl ?? ""), e.id);
          let imageData = e.imageData ?? null;
          if (!imagePath && imageData && typeof imageData === "string" && imageData.startsWith("data:image/")) {
            imagePath = await uploadExpenseReceiptImage(db, e.id, imageData);
            imageData = null;
          } else if (imagePath) {
            imageData = null;
          }
          return withTs({
            id: e.id, category: e.category ?? null, amount: e.amount ?? null, date: e.date, note: e.note,
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
        await upsertSync("deliveries", (data || []).map((d: Record<string, unknown>) => withTs({
          id: d.id, invoice_id: d.invoiceId ?? "",
          customer_id: nullableBigint(d.customerId),
          customer_name: d.customerName, area: d.area,
          postal_code: d.postalCode, address: d.address, schedule: d.schedule, status: d.status, items: d.items,
          driver: d.driver, notes: d.notes, created_by: d.createdBy ?? "",
        }, d)), "id", syncOpts);
      } else if (entity === "events") {
        await upsertSync("events", (data || []).map((e: Record<string, unknown>) => withTs({
          id: e.id, title: e.title, date: e.date, time: e.time, type: e.type, note: e.note,
          created_by: e.createdBy ?? "",
        }, e)), "id", syncOpts);
      } else if (entity === "stock_activity") {
        await upsertSync("stock_activity", (data || []).map((l: Record<string, unknown>) => withTs({
          id: l.id, product_id: nullableBigint(l.productId), product_name: l.productName, type: l.type,
          qty: l.qty, value: l.value ?? l.total ?? null, note: l.note || "", date: l.date, added_by: l.by || "",
        }, l)), "id", syncOpts);
      } else if (entity === "koi_fish") {
        const incoming = (data || []) as Record<string, unknown>[];
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
        const clientTs = raw.updatedAt ?? raw.updated_at;
        delete raw.updatedAt;
        delete raw.updated_at;
        const { data: existing } = await db.from("farm_pond_data").select("updated_at").eq("id", "default").maybeSingle();
        if (existing?.updated_at && clientTs) {
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
      if (!pin || String(pin).length < 4) return J({ error: "4-digit PIN required" }, 400);
      if (!permissions?.length) return J({ error: "At least one permission required" }, 400);
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
        permissions,
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
      if (!permissions?.length) return J({ error: "At least one permission required" }, 400);
      if (!["owner", "staff"].includes(role)) return J({ error: "Invalid role" }, 400);

      const { data: target, error: fetchErr } = await db.from("farm_users")
        .select("id, role, active, is_system")
        .eq("id", userId)
        .maybeSingle();
      if (fetchErr || !target) return J({ error: "User not found" }, 404);

      if (target.is_system && role !== "owner") {
        return J({ error: "System owner account must remain an owner" }, 400);
      }

      if (target.role === "owner" && target.active !== false) {
        const { count } = await db.from("farm_users")
          .select("*", { count: "exact", head: true })
          .eq("role", "owner")
          .eq("active", true);
        if ((count || 0) <= 1) {
          if (role !== "owner") {
            return J({ error: "At least one active owner is required" }, 400);
          }
          if (!permissions?.includes("users")) {
            return J({ error: "Last owner must keep Team permission" }, 400);
          }
        }
      }

      const row: Record<string, unknown> = {
        name: String(name).trim(),
        role,
        active: active !== false,
        permissions,
      };
      if (pin && String(pin).length >= 4) {
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

    return J({ error: "Unknown action" }, 400);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, req);
  }
});
