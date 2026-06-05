import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { hashPin, verifyPin } from "../_shared/pin.ts";
import { adminClient } from "../_shared/supabase.ts";

const SESSION_DAYS = 7;

function publicUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    permissions: row.permissions || [],
    isSystem: row.is_system || false,
    active: row.active !== false,
  };
}

async function createSession(userId: number) {
  const db = adminClient();
  const token = crypto.randomUUID();
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_DAYS);
  await db.from("auth_sessions").insert({
    user_id: userId,
    token,
    expires_at: expires.toISOString(),
  });
  return token;
}

async function verifyUserPin(user: Record<string, unknown>, pin: string): Promise<boolean> {
  if (user.pin_hash && typeof user.pin_hash === "string") {
    return verifyPin(pin, user.pin_hash);
  }
  if (user.pin && user.pin === pin) {
    const db = adminClient();
    const pin_hash = await hashPin(pin);
    await db.from("farm_users").update({ pin_hash, pin: null }).eq("id", user.id);
    return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const db = adminClient();

    if (req.method === "GET") {
      const { count } = await db.from("farm_users").select("*", { count: "exact", head: true });
      return jsonResponse({ needsSetup: count === 0, hasUsers: (count || 0) > 0 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "login") {
      const { pin } = body;
      if (!pin || String(pin).length < 4) {
        return jsonResponse({ error: "Invalid PIN" }, 400);
      }
      const { data: users } = await db.from("farm_users").select("*").eq("active", true);
      for (const user of users || []) {
        if (await verifyUserPin(user, String(pin))) {
          const token = await createSession(user.id);
          return jsonResponse({ token, user: publicUser(user) });
        }
      }
      return jsonResponse({ error: "Incorrect PIN or account inactive" }, 401);
    }

    if (action === "setup") {
      const { count } = await db.from("farm_users").select("*", { count: "exact", head: true });
      if ((count || 0) > 0) return jsonResponse({ error: "Setup already completed" }, 400);

      const { name, pin } = body;
      if (!name?.trim() || !pin || String(pin).length < 4) {
        return jsonResponse({ error: "Name and 4-digit PIN required" }, 400);
      }

      const permissions = [
        "dashboard", "inventory", "invoices", "customers", "expenses",
        "deliveries", "calendar", "chat", "users",
      ];
      const pin_hash = await hashPin(String(pin));
      const { data: created, error } = await db.from("farm_users").insert({
        name: name.trim(),
        role: "owner",
        pin_hash,
        active: true,
        permissions,
        is_system: true,
      }).select().single();
      if (error) return jsonResponse({ error: error.message }, 500);

      const token = await createSession(created.id);
      return jsonResponse({ token, user: publicUser(created) });
    }

    if (action === "logout") {
      const token = body.token;
      if (token) await db.from("auth_sessions").delete().eq("token", token);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
});
