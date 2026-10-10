-- Supabase advisor: function_search_path_mutable. Pin the schema so the trigger
-- function can't be hijacked by a role-level search_path.
ALTER FUNCTION public.record_sync_tombstone() SET search_path = public;
