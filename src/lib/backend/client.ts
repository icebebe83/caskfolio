import { assertSupabaseConfigured, isSupabaseConfigured } from "@/lib/supabase/client";

export const isBackendConfigured = isSupabaseConfigured;

export function assertBackendConfigured(): void {
  assertSupabaseConfigured();
}
