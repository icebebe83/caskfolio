import { assertSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { mapBottleRow, toSupabaseError } from "@/lib/data/shared";
import type { WishlistBottle } from "@/lib/types";

type WishlistRow = Record<string, unknown> & {
  bottle?: Record<string, unknown> | Record<string, unknown>[] | null;
};

function isMissingWishlistTable(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");

  return /bottle_wishlists/i.test(message) && (/schema cache/i.test(message) || /does not exist/i.test(message));
}

async function getCurrentUserId(): Promise<string | null> {
  assertSupabaseConfigured();
  const { data, error } = await supabase!.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

function mapWishlistRow(row: WishlistRow): WishlistBottle | null {
  const bottleRow = Array.isArray(row.bottle) ? row.bottle[0] : row.bottle;
  if (!bottleRow) return null;

  return {
    id: String(row.id ?? ""),
    bottleId: String(row.bottle_id ?? ""),
    createdBy: String(row.user_id ?? ""),
    createdAt: row.created_at as WishlistBottle["createdAt"],
    bottle: mapBottleRow(bottleRow),
  };
}

export async function fetchWishlistBottleIds(): Promise<Set<string>> {
  assertSupabaseConfigured();

  try {
    const { data, error } = await supabase!
      .from("bottle_wishlists")
      .select("bottle_id")
      .order("created_at", { ascending: false });

    if (error) {
      if (isMissingWishlistTable(error)) return new Set();
      throw error;
    }

    return new Set((data ?? []).map((row) => String(row.bottle_id ?? "")).filter(Boolean));
  } catch (error) {
    if (isMissingWishlistTable(error)) return new Set();
    throw toSupabaseError(error, "Unable to load wishlist.");
  }
}

export async function fetchWishlistBottles(): Promise<WishlistBottle[]> {
  assertSupabaseConfigured();

  try {
    const { data, error } = await supabase!
      .from("bottle_wishlists")
      .select("id,user_id,bottle_id,created_at,bottle:bottles(*)")
      .order("created_at", { ascending: false });

    if (error) {
      if (isMissingWishlistTable(error)) return [];
      throw error;
    }

    return (data ?? [])
      .map((row) => mapWishlistRow(row as unknown as WishlistRow))
      .filter((item): item is WishlistBottle => Boolean(item));
  } catch (error) {
    if (isMissingWishlistTable(error)) return [];
    throw toSupabaseError(error, "Unable to load wishlist.");
  }
}

export async function setBottleWishlist(bottleId: string, wishlisted: boolean): Promise<void> {
  assertSupabaseConfigured();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Sign in to use wishlist.");
  }

  try {
    if (wishlisted) {
      const { error } = await supabase!.from("bottle_wishlists").upsert(
        {
          user_id: userId,
          bottle_id: bottleId,
        },
        { onConflict: "user_id,bottle_id" },
      );
      if (error) throw error;
      return;
    }

    const { error } = await supabase!
      .from("bottle_wishlists")
      .delete()
      .eq("user_id", userId)
      .eq("bottle_id", bottleId);
    if (error) throw error;
  } catch (error) {
    if (isMissingWishlistTable(error)) {
      throw new Error("Wishlist is not ready yet. Apply supabase/bottle_wishlists.sql first.");
    }
    throw toSupabaseError(error, "Unable to update wishlist.");
  }
}
