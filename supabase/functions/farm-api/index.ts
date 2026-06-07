import { fetchTodayUsageByUser, fetchWeekUsageByUser } from "../_shared/aiUsage.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  deleteExpenseReceiptImages,
  uploadExpenseReceiptImage,
} from "../_shared/expenseStorage.ts";
import { hashPin, verifyPin } from "../_shared/pin.ts";
import { purgeExpiredCloudData } from "../_shared/retention.ts";
import {
  adminClient,
  hasPermission,
  sessionTokenFrom,
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
    const { error } = await db.from(table).delete().neq(idField, textId ? "___none___" : 0);
    if (error) throw error;
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

      return jsonResponse({
        users: mapUsers(usersPayload),
        customers: customers.data || [],
        products: products.data || [],
        invoices: invoices.data || [],
        expenses: (expenses.data || []).map((e: Record<string, unknown>) => (
          e.image_url ? { ...e, image_data: null } : e
        )),
        deliveries: deliveries.data || [],
        events: events.data || [],
        stockActivity: stockActivity.data || [],
        koiFish: koiFish.data || [],
        customerKoi: customerKoi.data || [],
        pondData: pondRow.data?.data || {},
        whatsappGroups: whatsappGroups.data || [],
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
      const imageUrl = await uploadExpenseReceiptImage(db, expenseId, imageData);
      return jsonResponse({ imageUrl, imageName: imageName || "" });
    }

    if (body.action === "sync") {
      const { entity, data } = body;
      const perm = ENTITY_PERMS[entity];
      if (!perm || !hasPermission(user, perm)) {
        return jsonResponse({ error: `Permission denied (${entity})` }, 403);
      }

      if (entity === "users") {
        for (const u of data || []) {
          const row: Record<string, unknown> = {
            name: u.name,
            role: u.role,
            active: u.active !== false,
            permissions: u.permissions,
            is_system: u.isSystem || false,
          };

          let pin_hash: string | undefined;
          if (u.pin && String(u.pin).length >= 4) {
            pin_hash = await hashPin(String(u.pin));
            row.pin_hash = pin_hash;
          }

          const { data: existing } = await db.from("farm_users")
            .select("id")
            .eq("id", u.id)
            .maybeSingle();

          if (existing) {
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
        })), "id");
      } else if (entity === "invoices") {
        await upsertSync("invoices", (data || []).map((i: Record<string, unknown>) => ({
          id: i.id, customer_id: i.customerId, customer_name: i.customerName, items: i.items,
          total: i.total, status: i.status, date: i.date, due_date: i.due, notes: i.notes,
          discount_type: i.discountType ?? "none", discount_value: i.discountValue ?? 0,
          booked: Boolean(i.booked), booked_at: i.bookedAt ?? null, booked_by: i.bookedBy ?? "",
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
          let imageUrl = String(e.imageUrl ?? "");
          let imageData = e.imageData ?? null;
          if (!imageUrl && imageData && typeof imageData === "string" && imageData.startsWith("data:image/")) {
            imageUrl = await uploadExpenseReceiptImage(db, e.id, imageData);
            imageData = null;
          } else if (imageUrl) {
            imageData = null;
          }
          return {
            id: e.id, category: e.category ?? null, amount: e.amount ?? null, date: e.date, note: e.note,
            image_data: imageData, image_name: e.imageName ?? "", image_url: imageUrl,
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
        await upsertSync("koi_fish", (data || []).map((k: Record<string, unknown>) => ({
          id: k.id, photo: k.photo ?? null, name: k.name ?? "", variety: k.variety ?? "",
          size: k.size ?? null, grade: k.grade ?? "", pond_name: k.pondName ?? "", price: k.price ?? 0,
          notes: k.notes ?? "", status: k.status ?? "available", date_added: k.dateAdded ?? null,
          sold_to: k.soldTo ?? null, sold_date: k.soldDate ?? null, sold_price: k.soldPrice ?? null,
          sell_disposition: k.sellDisposition ?? null, keep_pond_name: k.keepPondName ?? null,
          death_date: k.deathDate ?? null, death_cause: k.deathCause ?? null, death_photo: k.deathPhoto ?? null,
        })), "id");
      } else if (entity === "customer_koi") {
        await upsertSync("customer_koi", (data || []).map((r: Record<string, unknown>) => ({
          id: r.id, customer_id: r.customerId ?? null, customer_name: r.customerName ?? "",
          koi_id: r.koiId ?? "", photo: r.photo ?? null, fish_name: r.fishName ?? "",
          variety: r.variety ?? "", size: r.size ?? null, pond_name: r.pondName ?? "",
          purchase_date: r.purchaseDate ?? null, purchase_price: r.purchasePrice ?? 0,
          notes: r.notes ?? "", status: r.status ?? "in_pond", collected_date: r.collectedDate ?? null,
          death_date: r.deathDate ?? null, death_cause: r.deathCause ?? null,
          death_photo: r.deathPhoto ?? null, death_notes: r.deathNotes ?? "",
        })), "id");
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
