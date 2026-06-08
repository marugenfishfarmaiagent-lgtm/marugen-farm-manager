import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { sessionTokenFromCookie } from "./sessionCookie.ts";

export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type SessionUser = {
  id: number;
  name: string;
  role: string;
  permissions: string[];
  is_system?: boolean;
};

export async function validateSession(token: string | null): Promise<SessionUser | null> {
  if (!token) return null;
  const db = adminClient();
  const { data: session } = await db
    .from("auth_sessions")
    .select("user_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!session || new Date(session.expires_at) < new Date()) return null;

  const { data: user } = await db
    .from("farm_users")
    .select("id, name, role, permissions, is_system, active")
    .eq("id", session.user_id)
    .maybeSingle();
  if (!user || user.active === false) return null;

  return {
    id: user.id,
    name: user.name,
    role: user.role,
    permissions: user.permissions || [],
    is_system: user.is_system,
  };
}

export function sessionTokenFrom(req: Request): string | null {
  const fromCookie = sessionTokenFromCookie(req);
  if (fromCookie) return fromCookie;
  const header = req.headers.get("x-session-token") || req.headers.get("authorization") || "";
  if (header.startsWith("Session ")) return header.slice(8).trim();
  if (header.startsWith("Bearer ") && !header.includes("eyJ")) return header.slice(7).trim();
  return null;
}

export function hasPermission(user: SessionUser, perm: string): boolean {
  return user.role === "owner" || (user.permissions || []).includes(perm);
}
