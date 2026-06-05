import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { hashPin } from "../_shared/pin.ts";
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
};

async function upsertSync(
  table: string,
  rows: Record<string, unknown>[],
  idField: string,
) {
  const db = adminClient();
  const textId = idField === "id" && (table === "invoices" || table === "deliveries");
  const incomingIds = rows.map((r) => r[idField]).filter((id) => id != null);

  if (!rows.length) {
    const { error } = await db.from(table).delete().neq(idField, textId ? "___none___" : 0);
    if (error) throw error;
    return;
  }

  const { error } = await db.from(table).upsert(rows, { onConflict: idField });
  if (error) throw error;

  const { data: existing } = await db.from(table).select(idField);
  const toDelete = (existing || [])
    .map((r) => r[idField])
    .filter((id) => !incomingIds.includes(id));
  if (toDelete.length) {
    const { error: delErr } = await db.from(table).delete().in(idField, toDelete);
    if (delErr) throw delErr;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = sessionTokenFrom(req);
    const user = await validateSession(token);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const db = adminClient();

    if (body.action === "fetch") {
      const [users, customers, products, invoices, expenses, deliveries, events, stockActivity] =
        await Promise.all([
          db.from("farm_users").select("id, name, role, active, permissions, is_system").order("id"),
          db.from("customers").select("*").order("id"),
          db.from("products").select("*").order("id"),
          db.from("invoices").select("*").order("date", { ascending: false }),
          db.from("expenses").select("*").order("id"),
          db.from("deliveries").select("*").order("schedule"),
          db.from("events").select("*").order("date"),
          db.from("stock_activity").select("*").order("id", { ascending: false }),
        ]);

      const errors = [users, customers, products, invoices, expenses, deliveries, events, stockActivity]
        .map((r) => r.error).filter(Boolean);
      if (errors.length) return jsonResponse({ error: errors[0]!.message }, 500);

      return jsonResponse({
        users: mapUsers(users.data || []),
        customers: customers.data || [],
        products: products.data || [],
        invoices: invoices.data || [],
        expenses: expenses.data || [],
        deliveries: deliveries.data || [],
        events: events.data || [],
        stockActivity: stockActivity.data || [],
      });
    }

    if (body.action === "sync") {
      const { entity, data } = body;
      const perm = ENTITY_PERMS[entity];
      if (!perm || !hasPermission(user, perm)) {
        return jsonResponse({ error: "Permission denied" }, 403);
      }

      if (entity === "users") {
        const records = (data || []).map((u: Record<string, unknown>) => {
          const row: Record<string, unknown> = {
            id: u.id,
            name: u.name,
            role: u.role,
            active: u.active !== false,
            permissions: u.permissions,
            is_system: u.isSystem || false,
          };
          return row;
        });
        for (const u of data || []) {
          if (u.pin && String(u.pin).length >= 4) {
            const pin_hash = await hashPin(String(u.pin));
            const idx = records.findIndex((r) => r.id === u.id);
            if (idx >= 0) records[idx].pin_hash = pin_hash;
          }
        }
        await upsertSync("farm_users", records, "id");
        return jsonResponse({ ok: true });
      }

      if (entity === "customers") {
        await upsertSync("customers", (data || []).map((c: Record<string, unknown>) => ({
          id: c.id, name: c.name, phone: c.phone, whatsapp: c.whatsapp, area: c.area,
          fish_types: c.fishTypes, tier: c.tier, notes: c.notes, total_spent: c.totalSpent,
        })), "id");
      } else if (entity === "products") {
        await upsertSync("products", (data || []).map((p: Record<string, unknown>) => ({
          id: p.id, name: p.name, category: p.category, sku: p.sku, price: p.price,
          cost: p.cost, unit: p.unit, stock: p.stock, min_stock: p.minStock, description: p.description,
        })), "id");
      } else if (entity === "invoices") {
        await upsertSync("invoices", (data || []).map((i: Record<string, unknown>) => ({
          id: i.id, customer_id: i.customerId, customer_name: i.customerName, items: i.items,
          total: i.total, status: i.status, date: i.date, due_date: i.due, notes: i.notes,
        })), "id");
      } else if (entity === "expenses") {
        await upsertSync("expenses", (data || []).map((e: Record<string, unknown>) => ({
          id: e.id, category: e.category, amount: e.amount, date: e.date, note: e.note, added_by: e.addedBy,
        })), "id");
      } else if (entity === "deliveries") {
        await upsertSync("deliveries", (data || []).map((d: Record<string, unknown>) => ({
          id: d.id, customer_id: d.customerId, customer_name: d.customerName, area: d.area,
          address: d.address, schedule: d.schedule, status: d.status, items: d.items,
          driver: d.driver, notes: d.notes,
        })), "id");
      } else if (entity === "events") {
        await upsertSync("events", (data || []).map((e: Record<string, unknown>) => ({
          id: e.id, title: e.title, date: e.date, time: e.time, type: e.type, note: e.note,
        })), "id");
      } else if (entity === "stock_activity") {
        await upsertSync("stock_activity", (data || []).map((l: Record<string, unknown>) => ({
          id: l.id, product_id: l.productId, product_name: l.productName, type: l.type,
          qty: l.qty, value: l.value ?? l.total ?? null, note: l.note || "", date: l.date, added_by: l.by || "",
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
        })));
      }
      if (seed?.expenses?.length) {
        await db.from("expenses").insert(seed.expenses.map((e: Record<string, unknown>) => ({
          category: e.category, amount: e.amount, date: e.date, note: e.note, added_by: e.addedBy,
        })));
      }
      if (seed?.deliveries?.length) {
        await db.from("deliveries").insert(seed.deliveries.map((d: Record<string, unknown>) => ({
          id: d.id, customer_id: d.customerId, customer_name: d.customerName, area: d.area,
          address: d.address, schedule: d.schedule, status: d.status, items: d.items,
          driver: d.driver, notes: d.notes,
        })));
      }
      if (seed?.events?.length) {
        await db.from("events").insert(seed.events.map((e: Record<string, unknown>) => ({
          title: e.title, date: e.date, time: e.time, type: e.type, note: e.note,
        })));
      }
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
});
