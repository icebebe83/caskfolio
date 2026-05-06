import { DEFAULT_REGISTER_BOTTLE_IMAGE, uploadBottleMasterImage } from "@/lib/media/images";
import { appendAuditLog } from "@/lib/data/audit";
import {
  getBottleBaseIdentityKey,
  getBottleBatchIdentityPart,
  isSameBottleIdentity,
} from "@/lib/bottle-identity";
import { clearLocalBottles } from "@/lib/local-fallback";
import { assertSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { Bottle, BottleReferencePrice, SpiritCategory } from "@/lib/types";
import {
  mapBottleReferencePriceRow,
  mapBottleRow,
  toSupabaseError,
  withTimeout,
} from "@/lib/data/shared";

export async function createBottle(input: {
  category: SpiritCategory;
  name: string;
  brand: string;
  line: string;
  batch: string;
  ageStatement: string;
  abv: number;
  volumeMl: number;
  aliases: string[];
  masterImageUrl?: string;
  masterPreviewImageUrl?: string;
  imageUrl?: string;
}): Promise<Bottle> {
  assertSupabaseConfigured();
  const payload = {
    category: input.category,
    name: input.name.trim(),
    brand: input.brand.trim(),
    line: input.line.trim(),
    batch: input.batch.trim(),
    age_statement: input.ageStatement.trim(),
    abv: input.abv,
    volume_ml: input.volumeMl,
    aliases: input.aliases,
    hot_bottle: false,
    master_image_url: input.masterImageUrl ?? input.imageUrl ?? DEFAULT_REGISTER_BOTTLE_IMAGE,
    master_preview_image_url:
      input.masterPreviewImageUrl ??
      input.masterImageUrl ??
      input.imageUrl ??
      DEFAULT_REGISTER_BOTTLE_IMAGE,
    image_url: input.imageUrl ?? input.masterImageUrl ?? DEFAULT_REGISTER_BOTTLE_IMAGE,
  };

  const existingBottleLookup = async (): Promise<Bottle | null> => {
    try {
      const { data, error } = await withTimeout<{
        data: Record<string, unknown> | null;
        error: unknown;
      }>(
        Promise.resolve(
          supabase!
            .from("bottles")
            .select("*")
            .eq("category", payload.category)
            .eq("name", payload.name)
            .eq("brand", payload.brand)
            .eq("batch", payload.batch)
            .eq("abv", payload.abv)
            .eq("volume_ml", payload.volume_ml)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle() as never,
        ),
        5000,
        "Checking for an existing bottle took too long.",
      );

      if (!error && data) {
        const row = data as Record<string, unknown>;
        return mapBottleRow(row);
      }

    } catch {
      // Continue to a normalized lookup below.
    }

    try {
      const { data, error } = await withTimeout<{
        data: Record<string, unknown>[] | null;
        error: unknown;
      }>(
        Promise.resolve(
          supabase!
            .from("bottles")
            .select("*")
            .eq("category", payload.category)
            .ilike("name", payload.name)
            .limit(20) as never,
        ),
        5000,
        "Checking for matching bottles took too long.",
      );

      if (error || !Array.isArray(data)) return null;

      const candidates = data.map((row) => mapBottleRow(row as Record<string, unknown>));
      const target = {
        category: payload.category,
        name: payload.name,
        brand: payload.brand,
        batch: payload.batch,
        ageStatement: payload.age_statement,
        abv: payload.abv,
        volumeMl: payload.volume_ml,
      };
      const exactMatch = candidates.find((candidate) => isSameBottleIdentity(candidate, target));
      if (exactMatch) return exactMatch;

      const targetBaseKey = getBottleBaseIdentityKey(target);
      const sameBaseCandidates = candidates.filter(
        (candidate) => getBottleBaseIdentityKey(candidate) === targetBaseKey,
      );
      const nonBlankBatches = new Set(
        [...sameBaseCandidates.map(getBottleBatchIdentityPart), getBottleBatchIdentityPart(target)].filter(Boolean),
      );

      return nonBlankBatches.size <= 1 ? sameBaseCandidates[0] ?? null : null;
    } catch {
      return null;
    }
  };

  const existingBottle = await existingBottleLookup();
  if (existingBottle) {
    return existingBottle;
  }

  let result: { data: Record<string, unknown> | null; error: unknown };
  try {
    result = await withTimeout<{ data: Record<string, unknown> | null; error: unknown }>(
      Promise.resolve(supabase!.from("bottles").insert(payload).select("*").single() as never),
      15000,
      "Creating the bottle took too long. Please try again.",
    );
  } catch (timeoutError) {
    const persistedBottle = await existingBottleLookup();
    if (persistedBottle) {
      return persistedBottle;
    }
    throw timeoutError;
  }
  const { data, error } = result;
  if (error || !data) {
    const persistedBottle = await existingBottleLookup();
    if (persistedBottle) {
      return persistedBottle;
    }
    throw toSupabaseError(error, "We couldn't create the bottle. Please try again.");
  }

  const bottle = mapBottleRow(data);
  return bottle;
}

export async function fetchBottles(): Promise<Bottle[]> {
  assertSupabaseConfigured();
  try {
    const bottles = await fetchBottlesStrict();
    clearLocalBottles();
    return bottles;
  } catch {
    return [];
  }
}

export async function fetchBottlesStrict(): Promise<Bottle[]> {
  assertSupabaseConfigured();
  const result = await withTimeout<{ data: Record<string, unknown>[] | null; error: unknown }>(
    Promise.resolve(
      supabase!
        .from("bottles")
        .select("*")
        .order("created_at", { ascending: false }) as never,
    ),
    20000,
    "Loading the bottle archive took too long.",
  );
  const { data, error } = result;
  if (error) throw error;
  clearLocalBottles();
  return (data ?? []).map(mapBottleRow);
}

export async function fetchBottlesPage(input: {
  offset: number;
  limit: number;
  category?: string;
  query?: string;
}): Promise<{ bottles: Bottle[]; total: number }> {
  assertSupabaseConfigured();

  const normalizedLimit = Math.max(1, input.limit);
  const normalizedOffset = Math.max(0, input.offset);
  const normalizedQuery = input.query?.trim().replace(/,/g, " ") ?? "";

  try {
    let request = supabase!
      .from("bottles")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(normalizedOffset, normalizedOffset + normalizedLimit - 1);

    if (input.category && input.category !== "All") {
      request = request.eq("category", input.category);
    }

    if (normalizedQuery) {
      request = request.or(`name.ilike.%${normalizedQuery}%,brand.ilike.%${normalizedQuery}%`);
    }

    const result = await withTimeout<{
      data: Record<string, unknown>[] | null;
      error: unknown;
      count: number | null;
    }>(
      Promise.resolve(request as never),
      8000,
      "Loading bottles took too long.",
    );
    const { data, error, count } = result;
    if (error) throw error;

    return {
      bottles: (data ?? []).map(mapBottleRow),
      total: count ?? 0,
    };
  } catch {
    return { bottles: [], total: 0 };
  }
}

export async function fetchBottleById(id: string): Promise<Bottle | null> {
  assertSupabaseConfigured();
  try {
    const result = await withTimeout<{ data: Record<string, unknown> | null; error: unknown }>(
      Promise.resolve(
        supabase!
          .from("bottles")
          .select("*")
          .eq("id", id)
          .maybeSingle() as never,
      ),
      8000,
      "Loading bottle details took too long.",
    );
    const { data, error } = result;
    if (error) throw error;
    clearLocalBottles();
    if (!data) return null;
    return mapBottleRow(data);
  } catch {
    return null;
  }
}

export async function fetchBottleReferencePrice(
  bottleId: string,
): Promise<BottleReferencePrice | null> {
  assertSupabaseConfigured();
  try {
    const { data, error } = await supabase!
      .from("bottle_reference_prices")
      .select("*")
      .eq("bottle_id", bottleId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return mapBottleReferencePriceRow(data);
    }
  } catch {
    return null;
  }

  return null;
}

export async function saveBottleReferencePrice(
  bottleId: string,
  input: {
    source: string;
    referencePriceUsd: number;
    sourceUrl?: string;
    updatedAt?: string;
  },
): Promise<void> {
  assertSupabaseConfigured();
  await supabase!.from("bottle_reference_prices").delete().eq("bottle_id", bottleId);

  const payload = {
    bottle_id: bottleId,
    source: input.source.trim(),
    reference_price_usd: input.referencePriceUsd,
    reference_price_6m_ago: input.referencePriceUsd,
    reference_change_percent: 0,
    source_url: input.sourceUrl?.trim() ?? "",
    updated_at: input.updatedAt
      ? new Date(input.updatedAt).toISOString()
      : new Date().toISOString(),
  };

  const { error } = await supabase!.from("bottle_reference_prices").insert(payload);
  if (error) throw toSupabaseError(error, "Unable to save global reference price.");
  await appendAuditLog({
    action: "bottle.reference_price_saved",
    targetType: "bottle",
    targetId: bottleId,
    details: payload,
  });
}

export async function deleteBottleReferencePrice(bottleId: string): Promise<void> {
  assertSupabaseConfigured();
  const { error } = await supabase!.from("bottle_reference_prices").delete().eq("bottle_id", bottleId);
  if (error) throw toSupabaseError(error, "Unable to delete global reference price.");
  await appendAuditLog({
    action: "bottle.reference_price_deleted",
    targetType: "bottle",
    targetId: bottleId,
    details: {},
  });
}

export async function updateBottleAliases(
  bottleId: string,
  aliases: string[],
): Promise<void> {
  assertSupabaseConfigured();
  const { error } = await supabase!
    .from("bottles")
    .update({ aliases, updated_at: new Date().toISOString() })
    .eq("id", bottleId);
  if (error) throw toSupabaseError(error, "Unable to update bottle aliases.");
  await appendAuditLog({
    action: "bottle.aliases_updated",
    targetType: "bottle",
    targetId: bottleId,
    details: { aliases },
  });
}

export async function updateBottleHotFlag(
  bottleId: string,
  hotBottle: boolean,
): Promise<void> {
  assertSupabaseConfigured();
  const { error } = await supabase!
    .from("bottles")
    .update({ hot_bottle: hotBottle, updated_at: new Date().toISOString() })
    .eq("id", bottleId);
  if (error) throw toSupabaseError(error, "Unable to update hot bottle flag.");
  await appendAuditLog({
    action: "bottle.hot_flag_updated",
    targetType: "bottle",
    targetId: bottleId,
    details: { hotBottle },
  });
}

export async function updateBottle(
  bottleId: string,
  input: {
    name: string;
    brand: string;
    category: SpiritCategory;
    batch: string;
    abv: number;
    volumeMl: number;
    aliases: string[];
    hotBottle: boolean;
  },
): Promise<void> {
  assertSupabaseConfigured();
  const { error } = await supabase!
    .from("bottles")
    .update({
      name: input.name.trim(),
      brand: input.brand.trim(),
      category: input.category,
      batch: input.batch.trim(),
      abv: input.abv,
      volume_ml: input.volumeMl,
      aliases: input.aliases,
      hot_bottle: input.hotBottle,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bottleId);
  if (error) throw toSupabaseError(error, "Unable to update bottle.");
  await appendAuditLog({
    action: "bottle.updated",
    targetType: "bottle",
    targetId: bottleId,
    details: {
      name: input.name.trim(),
      brand: input.brand.trim(),
      category: input.category,
      batch: input.batch.trim(),
      abv: input.abv,
      volumeMl: input.volumeMl,
      aliases: input.aliases,
      hotBottle: input.hotBottle,
    },
  });
}

export async function updateBottleMasterImage(
  bottleId: string,
  file: File,
): Promise<void> {
  assertSupabaseConfigured();
  const imageUrls = await uploadBottleMasterImage(bottleId, file);
  const { error } = await supabase!
    .from("bottles")
    .update({
      master_image_url: imageUrls.masterImageUrl,
      master_preview_image_url: imageUrls.masterPreviewImageUrl,
      image_url: imageUrls.masterPreviewImageUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bottleId);
  if (error) throw toSupabaseError(error, "Unable to update bottle master image.");
  await appendAuditLog({
    action: "bottle.master_image_updated",
    targetType: "bottle",
    targetId: bottleId,
    details: {
      masterImageUrl: imageUrls.masterImageUrl,
      masterPreviewImageUrl: imageUrls.masterPreviewImageUrl,
    },
  });
}

export async function deleteBottle(bottleId: string): Promise<void> {
  assertSupabaseConfigured();
  const { error } = await supabase!.from("bottles").delete().eq("id", bottleId);
  if (error) throw toSupabaseError(error, "Unable to delete bottle.");
  await appendAuditLog({
    action: "bottle.deleted",
    targetType: "bottle",
    targetId: bottleId,
    details: {},
  });
}
