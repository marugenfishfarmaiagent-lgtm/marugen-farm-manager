/** Block stale devices from resurrecting rows deleted via SQL or app sync. */

export type SyncTombstone = {
  entity: string;
  recordId: string;
  deletedAt: string;
};

const TABLE_ENTITY: Record<string, string> = {
  invoices: "invoices",
  koi_fish: "koi_fish",
  customer_koi: "customer_koi",
  customers: "customers",
  products: "products",
  expenses: "expenses",
  deliveries: "deliveries",
  events: "events",
  stock_activity: "stock_activity",
  whatsapp_groups: "whatsapp_groups",
};

export function tableEntityName(table: string): string {
  return TABLE_ENTITY[table] || table;
}

export async function fetchSyncTombstones(
  db: ReturnType<typeof import("./supabase.ts").adminClient>,
  { since }: { since?: string } = {},
): Promise<SyncTombstone[]> {
  let query = db.from("sync_tombstones").select("entity, record_id, deleted_at").order("deleted_at", { ascending: false });
  if (since) query = query.gte("deleted_at", since);
  const { data, error } = await query.limit(5000);
  if (error) throw error;
  return (data || []).map((row) => ({
    entity: String(row.entity),
    recordId: String(row.record_id),
    deletedAt: String(row.deleted_at),
  }));
}

export async function loadTombstoneMap(
  db: ReturnType<typeof import("./supabase.ts").adminClient>,
  entity: string,
  recordIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(recordIds.map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await db.from("sync_tombstones")
    .select("record_id, deleted_at")
    .eq("entity", entity)
    .in("record_id", ids);
  if (error) throw error;
  return new Map((data || []).map((row) => [String(row.record_id), String(row.deleted_at)]));
}

/** True when a client row must not be upserted (deleted on server after client's version). */
export function isBlockedByTombstone(deletedAt: string, clientUpdatedAt: unknown): boolean {
  const delTs = new Date(deletedAt).getTime();
  if (!Number.isFinite(delTs)) return true;
  if (clientUpdatedAt == null || clientUpdatedAt === "") return true;
  const clientTs = new Date(String(clientUpdatedAt)).getTime();
  if (!Number.isFinite(clientTs)) return true;
  return delTs >= clientTs - 2000;
}

export async function purgeExpiredTombstones(
  db: ReturnType<typeof import("./supabase.ts").adminClient>,
  retentionDays = 365,
) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  await db.from("sync_tombstones").delete().lt("deleted_at", cutoff.toISOString());
}

/** Allow intentional re-create of a record id after upsert (e.g. new invoice reusing INV… sequence). */
export async function clearSyncTombstones(
  db: ReturnType<typeof import("./supabase.ts").adminClient>,
  entity: string,
  recordIds: string[],
) {
  const ids = [...new Set(recordIds.map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return;
  await db.from("sync_tombstones").delete().eq("entity", entity).in("record_id", ids);
}
