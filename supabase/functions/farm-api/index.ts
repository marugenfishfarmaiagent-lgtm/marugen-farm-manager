import { fetchTodayUsageByUser, fetchWeekUsageByUser } from "../_shared/aiUsage.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
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
) {
  const db = adminClient();
  const textId = idField === "id" && (
    table === "invoices" || table === "deliveries" || table === "koi_fish"
    || table === "customer_koi" || table === "whatsapp_groups"
  );
  const incomingSet = new Set(
    rows.map((r) => r[idField]).filter((id) => id != null).map(normId),
  );

  if (!rows.length) {
    if (table === "farm_users") {
      const { data: existing } = await db.from(table).select(idField);
      const allIds = (existing || []).map((r) => r[idField]).filter((id) => id != null);
      await deleteFarmUsers(db, allIds);
      return;
    }
    // Empty sync payload must not wipe cloud tables (e.g. before client hydration).
    return;
  }

  const { error } = await db.from(table).upsert(rows, { onConflict: idField });
  if (error) throw error;

  const { data: existing } = await db.from(table).select(idField);
  const toDelete = (existing || [])
    .map((r) => r[idField])
    .filter((id) => id != null && !incomingSet.has(normId(id)));

  if (toDelete.length) {
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = sessionTokenFrom(req);
    const user = await validateSession(token);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

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
        db.from("farm_pond_data").select("data").eq("id", "default").maybeSingle(),
        db.from("whatsapp_groups").select("*").order("name"),
      ]);

      const errors = [
        users, customers, products, invoices, expenses, deliveries, events, stockActivity,
        koiFish, customerKoi, pondRow, whatsappGroups,
      ].map((r) => r.error).filter(Boolean);
      if (errors.length) return jsonResponse({ error: errors[0]!.message }, 500);

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

      return jsonResponse({
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
        whatsappGroups: permittedRows(user, "deliveries", whatsappGroups.data || []),
      });
    }

    if (body.action === "upload_expense_receipt") {
      if (!hasPermission(user, "expenses")) {
        return jsonResponse({ error: "Permission denied (expenses)" }, 403);
      }
      const { expenseId, imageData, imageName } = body;
      if (expenseId == null) return jsonResponse({ error: "expenseId required" }, 400);
      if (!imageData || typeof imageData !== "string" || !imageData.startsWith("data:image/")) {
        return jsonResponse({ error: "Valid image data required" }, 400);
      }
      const path = await uploadExpenseReceiptImage(db, expenseId, imageData);
      const imageUrl = await signExpenseReceiptUrl(db, path, expenseId);
      return jsonResponse({ imageUrl, imagePath: path, imageName: imageName || "" });
    }

    if (body.action === "refresh_expense_receipt" || body.action === "refresh_signed_image") {
      const entity = body.action === "refresh_expense_receipt"
        ? "expense"
        : body.entity;
      const recordId = body.expenseId ?? body.id;
      const field = body.action === "refresh_expense_receipt" ? "image" : body.field;

      if (!entity || recordId == null || !field) {
        return jsonResponse({ error: "entity, id, and field required" }, 400);
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
      if (!target) return jsonResponse({ error: "Unknown image target" }, 400);
      if (!hasPermission(user, target.perm)) {
        return jsonResponse({ error: `Permission denied (${entity})` }, 403);
      }

      const { data: row, error: fetchErr } = await db.from(target.table)
        .select(target.column)
        .eq("id", recordId)
        .maybeSingle();
      const stored = row?.[target.column as keyof typeof row];
      if (fetchErr || !stored) {
        return jsonResponse({ error: "Image not found" }, 404);
      }

      const url = await target.sign(db, String(stored), recordId);
      return jsonResponse({ url, imageUrl: url });
    }

    if (body.action === "sync") {
      const { entity, data } = body;
      const perm = ENTITY_PERMS[entity];
      if (!perm || !hasPermission(user, perm)) {
        return jsonResponse({ error: `Permission denied (${entity})` }, 403);
      }

      if (entity === "users") {
        if (!hasPermission(user, "users")) {
          return jsonResponse({ error: "Permission denied (users)" }, 403);
        }

        for (const u of data || []) {
          if (!u.name?.trim()) return jsonResponse({ error: "Name is required" }, 400);
          if (!["owner", "staff"].includes(String(u.role))) {
            return jsonResponse({ error: "Invalid role" }, 400);
          }
          if (!Array.isArray(u.permissions) || !u.permissions.length) {
            return jsonResponse({ error: "At least one permission required" }, 400);
          }

          const { data: target } = await db.from("farm_users")
            .select("id, role, active, is_system")
            .eq("id", u.id)
            .maybeSingle();

          if (target?.role === "owner" && target.active !== false) {
            const { count } = await db.from("farm_users")
              .select("*", { count: "exact", head: true })
              .eq("role", "owner")
              .eq("active", true);
            if ((count || 0) <= 1) {
              if (String(u.role) !== "owner") {
                return jsonResponse({ error: "At least one active owner is required" }, 400);
              }
              if (!u.permissions?.includes("users")) {
                return jsonResponse({ error: "Last owner must keep Team permission" }, 400);
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
              return jsonResponse({ error: "PIN already in use" }, 400);
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

        return jsonResponse({ ok: true });
      }

      if (entity === "customers") {
        await upsertSync("customers", (data || []).map((c: Record<string, unknown>) => ({
          id: c.id, name: c.name, phone: c.phone, whatsapp: c.whatsapp, area: c.area,
          postal_code: c.postalCode, address: c.address,
          fish_types: c.fishTypes, tier: c.tier, notes: c.notes, total_spent: c.totalSpent,
        })), "id");
      } else if (entity === "products") {
        await upsertSync("products", (data || []).map((p: Record<string, unknown>) => ({
          id: p.id, name: p.name, category: p.category, sku: p.sku, price: p.price,
          cost: p.cost ?? 0, unit: p.unit, stock: p.stock, min_stock: p.minStock, description: p.description,
          track_stock: p.trackStock !== false,
        })), "id");
      } else if (entity === "invoices") {
        const incoming = (data || []) as Record<string, unknown>[];
        const incomingIds = new Set(incoming.map((i) => normId(i.id)));
        const { data: existingInvoices } = await db.from("invoices").select("id");
        const removedIds = (existingInvoices || [])
          .map((r) => r.id)
          .filter((id) => id != null && !incomingIds.has(normId(id)));
        if (removedIds.length) await deleteInvoicePdfs(db, removedIds);

        await upsertSync("invoices", incoming.map((i) => ({
          id: i.id,
          customer_id: i.customerId,
          customer_name: i.customerName,
          items: i.items,
          total: i.total,
          status: i.status,
          date: i.date,
          due_date: i.due,
          notes: i.notes,
          discount_type: i.discountType ?? "none",
          discount_value: i.discountValue ?? 0,
          booked: Boolean(i.booked),
          booked_at: i.bookedAt ?? null,
          booked_by: i.bookedBy ?? "",
        })), "id");
      } else if (entity === "expenses") {
        const incoming = (data || []) as Record<string, unknown>[];
        const incomingIds = new Set(incoming.map((e) => normId(e.id)));

        const { data: existingExpenses } = await db.from("expenses").select("id");
        const removedIds = (existingExpenses || [])
          .map((r) => r.id)
          .filter((id) => id != null && !incomingIds.has(normId(id)));
        if (removedIds.length) await deleteExpenseReceiptImages(db, removedIds);

        const rows = await Promise.all(incoming.map(async (e) => {
          let imagePath = normalizeImageUrlForStorage(String(e.imageUrl ?? ""), e.id);
          let imageData = e.imageData ?? null;
          if (!imagePath && imageData && typeof imageData === "string" && imageData.startsWith("data:image/")) {
            imagePath = await uploadExpenseReceiptImage(db, e.id, imageData);
            imageData = null;
          } else if (imagePath) {
            imageData = null;
          }
          return {
            id: e.id, category: e.category ?? null, amount: e.amount ?? null, date: e.date, note: e.note,
            image_data: imageData, image_name: e.imageName ?? "", image_url: imagePath,
            added_by: e.addedBy,
            booked: Boolean(e.booked), booked_at: e.bookedAt ?? null, booked_by: e.bookedBy ?? "",
          };
        }));
        await upsertSync("expenses", rows, "id");
      } else if (entity === "deliveries") {
        await upsertSync("deliveries", (data || []).map((d: Record<string, unknown>) => ({
          id: d.id, invoice_id: d.invoiceId ?? "",
          customer_id: d.customerId != null && d.customerId !== "" ? d.customerId : null,
          customer_name: d.customerName, area: d.area,
          postal_code: d.postalCode, address: d.address, schedule: d.schedule, status: d.status, items: d.items,
          driver: d.driver, notes: d.notes, created_by: d.createdBy ?? "",
        })), "id");
      } else if (entity === "events") {
        await upsertSync("events", (data || []).map((e: Record<string, unknown>) => ({
          id: e.id, title: e.title, date: e.date, time: e.time, type: e.type, note: e.note,
          created_by: e.createdBy ?? "",
        })), "id");
      } else if (entity === "stock_activity") {
        await upsertSync("stock_activity", (data || []).map((l: Record<string, unknown>) => ({
          id: l.id, product_id: l.productId, product_name: l.productName, type: l.type,
          qty: l.qty, value: l.value ?? l.total ?? null, note: l.note || "", date: l.date, added_by: l.by || "",
        })), "id");
      } else if (entity === "koi_fish") {
        const incoming = (data || []) as Record<string, unknown>[];
        const incomingIds = new Set(incoming.map((k) => normId(k.id)));
        const { data: existingKoi } = await db.from("koi_fish").select("id");
        const removedIds = (existingKoi || [])
          .map((r) => r.id)
          .filter((id) => id != null && !incomingIds.has(normId(id)));
        if (removedIds.length) await deleteKoiFishImages(db, removedIds);

        const rows = await Promise.all(incoming.map(async (k) => ({
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
          sold_to: k.soldTo ?? null,
          sold_date: k.soldDate ?? null,
          sold_price: k.soldPrice ?? null,
          sell_disposition: k.sellDisposition ?? null,
          keep_pond_name: k.keepPondName ?? null,
          death_date: k.deathDate ?? null,
          death_cause: k.deathCause ?? null,
          death_photo: await resolveKoiFishDeathPhoto(db, k.id, k.deathPhoto ?? k.death_photo),
        })));
        await upsertSync("koi_fish", rows, "id");
      } else if (entity === "customer_koi") {
        const incoming = (data || []) as Record<string, unknown>[];
        const incomingIds = new Set(incoming.map((r) => normId(r.id)));
        const { data: existingRows } = await db.from("customer_koi").select("id");
        const removedIds = (existingRows || [])
          .map((r) => r.id)
          .filter((id) => id != null && !incomingIds.has(normId(id)));
        if (removedIds.length) await deleteCustomerKoiImages(db, removedIds);

        const rows = await Promise.all(incoming.map(async (r) => ({
          id: r.id,
          customer_id: r.customerId ?? null,
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
        })));
        await upsertSync("customer_koi", rows, "id");
      } else if (entity === "farm_pond_data") {
        const payload = data && typeof data === "object" ? data : {};
        const { error } = await db.from("farm_pond_data").upsert(
          { id: "default", data: payload },
          { onConflict: "id" },
        );
        if (error) throw error;
      } else if (entity === "whatsapp_groups") {
        await upsertSync("whatsapp_groups", (data || []).map((g: Record<string, unknown>) => ({
          id: g.id, name: g.name ?? "", link: g.link ?? "",
        })), "id");
      } else {
        return jsonResponse({ error: "Unknown entity" }, 400);
      }

      return jsonResponse({ ok: true });
    }

    if (body.action === "seed") {
      if (user.role !== "owner") return jsonResponse({ error: "Permission denied" }, 403);
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
          id: i.id, customer_id: i.customerId, customer_name: i.customerName, items: i.items,
          total: i.total, status: i.status, date: i.date, due_date: i.due, notes: i.notes,
          discount_type: i.discountType ?? "none", discount_value: i.discountValue ?? 0,
          booked: Boolean(i.booked), booked_at: i.bookedAt ?? null, booked_by: i.bookedBy ?? "",
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
      return jsonResponse({ ok: true });
    }

    if (body.action === "add_user") {
      if (!hasPermission(user, "users")) {
        return jsonResponse({ error: "Permission denied" }, 403);
      }
      const { name, role, pin, permissions, active } = body;
      if (!name?.trim()) return jsonResponse({ error: "Name is required" }, 400);
      if (!pin || String(pin).length < 4) return jsonResponse({ error: "4-digit PIN required" }, 400);
      if (!permissions?.length) return jsonResponse({ error: "At least one permission required" }, 400);
      if (!["owner", "staff"].includes(role)) return jsonResponse({ error: "Invalid role" }, 400);

      if (await isPinTaken(db, String(pin))) {
        return jsonResponse({ error: "PIN already in use" }, 400);
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
      if (error) return jsonResponse({ error: error.message }, 500);

      return jsonResponse({ ok: true, user: mapUsers([created])[0] });
    }

    if (body.action === "update_user") {
      if (!hasPermission(user, "users")) {
        return jsonResponse({ error: "Permission denied" }, 403);
      }
      const { userId, name, role, pin, permissions, active } = body;
      if (userId == null) return jsonResponse({ error: "userId required" }, 400);
      if (!name?.trim()) return jsonResponse({ error: "Name is required" }, 400);
      if (!permissions?.length) return jsonResponse({ error: "At least one permission required" }, 400);
      if (!["owner", "staff"].includes(role)) return jsonResponse({ error: "Invalid role" }, 400);

      const { data: target, error: fetchErr } = await db.from("farm_users")
        .select("id, role, active, is_system")
        .eq("id", userId)
        .maybeSingle();
      if (fetchErr || !target) return jsonResponse({ error: "User not found" }, 404);

      if (target.role === "owner" && target.active !== false) {
        const { count } = await db.from("farm_users")
          .select("*", { count: "exact", head: true })
          .eq("role", "owner")
          .eq("active", true);
        if ((count || 0) <= 1) {
          if (role !== "owner") {
            return jsonResponse({ error: "At least one active owner is required" }, 400);
          }
          if (!permissions?.includes("users")) {
            return jsonResponse({ error: "Last owner must keep Team permission" }, 400);
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
          return jsonResponse({ error: "PIN already in use" }, 400);
        }
        row.pin_hash = await hashPin(String(pin));
      }

      const { data: updated, error } = await db.from("farm_users")
        .update(row)
        .eq("id", userId)
        .select("id, name, role, active, permissions, is_system")
        .single();
      if (error) return jsonResponse({ error: error.message }, 500);

      return jsonResponse({ ok: true, user: mapUsers([updated])[0] });
    }

    if (body.action === "delete_user") {
      if (!hasPermission(user, "users")) {
        return jsonResponse({ error: "Permission denied" }, 403);
      }
      const userId = body.userId;
      if (userId == null) return jsonResponse({ error: "userId required" }, 400);
      if (Number(userId) === user.id) {
        return jsonResponse({ error: "Cannot delete your own account" }, 400);
      }

      const { data: target, error: fetchErr } = await db.from("farm_users")
        .select("id, role, active, is_system")
        .eq("id", userId)
        .maybeSingle();
      if (fetchErr || !target) return jsonResponse({ error: "User not found" }, 404);
      if (target.is_system) {
        return jsonResponse({ error: "Cannot delete the system owner account" }, 400);
      }

      if (target.role === "owner" && target.active !== false) {
        const { count } = await db.from("farm_users")
          .select("*", { count: "exact", head: true })
          .eq("role", "owner")
          .eq("active", true);
        if ((count || 0) <= 1) {
          return jsonResponse({ error: "At least one active owner is required" }, 400);
        }
      }

      await deleteFarmUsers(db, [userId]);
      return jsonResponse({ ok: true });
    }

    if (body.action === "ai_usage_stats") {
      if (user.role !== "owner") {
        return jsonResponse({ error: "Owner access only" }, 403);
      }
      const [today, week] = await Promise.all([
        fetchTodayUsageByUser(),
        fetchWeekUsageByUser(),
      ]);
      return jsonResponse({ today, week });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
});
