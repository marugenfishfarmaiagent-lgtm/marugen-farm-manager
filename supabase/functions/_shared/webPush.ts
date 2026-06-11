import webpush from "npm:web-push@3.6.7";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
};

export type StoredPushSubscription = {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function vapidConfig() {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@marugenfarm.com";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function isPushConfigured(): boolean {
  return vapidConfig() !== null;
}

export function getVapidPublicKey(): string | null {
  return vapidConfig()?.publicKey ?? null;
}

export async function sendPushToSubscription(
  sub: Pick<StoredPushSubscription, "endpoint" | "p256dh" | "auth">,
  payload: PushPayload,
): Promise<{ ok: true } | { ok: false; gone?: boolean; error: string }> {
  const vapid = vapidConfig();
  if (!vapid) return { ok: false, error: "push_not_configured" };

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url || "/",
        tag: payload.tag || "marugen-farm",
        icon: payload.icon || "/logo.png",
      }),
      { TTL: 60 * 60 * 24 },
    );
    return { ok: true };
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    return {
      ok: false,
      gone: status === 404 || status === 410,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function sendPushToUserIds(
  db: ReturnType<typeof import("./supabase.ts").adminClient>,
  userIds: number[],
  payload: PushPayload,
  { excludeUserId }: { excludeUserId?: number } = {},
): Promise<{ sent: number; removed: number }> {
  const ids = [...new Set(userIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))]
    .filter((id) => excludeUserId == null || id !== Number(excludeUserId));
  if (!ids.length || !isPushConfigured()) return { sent: 0, removed: 0 };

  const { data: rows, error } = await db
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", ids);
  if (error) throw error;
  if (!rows?.length) return { sent: 0, removed: 0 };

  let sent = 0;
  let removed = 0;
  const staleIds: number[] = [];

  for (const row of rows as StoredPushSubscription[]) {
    const result = await sendPushToSubscription(row, payload);
    if (result.ok) {
      sent += 1;
    } else if (result.gone) {
      staleIds.push(row.id);
      removed += 1;
    }
  }

  if (staleIds.length) {
    await db.from("push_subscriptions").delete().in("id", staleIds);
  }

  return { sent, removed };
}

export async function sendPushToAllFarmUsers(
  db: ReturnType<typeof import("./supabase.ts").adminClient>,
  payload: PushPayload,
  { excludeUserId }: { excludeUserId?: number } = {},
): Promise<{ sent: number; removed: number }> {
  const { data: users, error } = await db.from("farm_users").select("id").eq("active", true);
  if (error) throw error;
  const ids = (users || []).map((u: { id: number }) => u.id);
  return sendPushToUserIds(db, ids, payload, { excludeUserId });
}
