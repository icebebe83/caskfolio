import { toSupabaseError } from "@/lib/data/shared";
import { assertSupabaseConfigured, supabase } from "@/lib/supabase/client";

function isMissingDisplayNameColumn(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");

  return /display_name/i.test(message) && /schema cache|column/i.test(message);
}

function isDuplicateDisplayName(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");

  return code === "23505" || /profiles_display_name_unique_idx|duplicate key/i.test(message);
}

async function getCurrentUserId(): Promise<string> {
  assertSupabaseConfigured();
  const { data, error } = await supabase!.auth.getUser();
  if (error || !data.user) throw new Error("Sign in to update your profile.");
  return data.user.id;
}

export function normalizeDisplayName(displayName: string): string {
  return displayName.trim().replace(/\s+/g, " ").slice(0, 32);
}

export async function fetchCurrentProfileDisplayName(): Promise<string> {
  assertSupabaseConfigured();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase!
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingDisplayNameColumn(error)) return "";
    throw toSupabaseError(error, "Unable to load profile.");
  }

  return typeof data?.display_name === "string" ? data.display_name : "";
}

export async function updateCurrentProfileDisplayName(displayName: string): Promise<string> {
  assertSupabaseConfigured();
  const userId = await getCurrentUserId();
  const normalizedDisplayName = normalizeDisplayName(displayName);
  if (normalizedDisplayName.length < 2) {
    throw new Error("Nickname must be at least 2 characters.");
  }

  const { error } = await supabase!
    .from("profiles")
    .update({ display_name: normalizedDisplayName })
    .eq("id", userId);

  if (error) {
    if (isMissingDisplayNameColumn(error)) {
      throw new Error("Nickname profile field is not ready yet. Apply supabase/profile_display_name.sql first.");
    }
    if (isDuplicateDisplayName(error)) {
      throw new Error("nickname-taken");
    }
    throw toSupabaseError(error, "Unable to save nickname.");
  }

  return normalizedDisplayName;
}
