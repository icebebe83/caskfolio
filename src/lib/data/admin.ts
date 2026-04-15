import { DEFAULT_FX_PAIR } from "@/lib/constants";
import { resolveNewsImageUrl } from "@/lib/news-utils";
import {
  DEFAULT_REGISTER_BOTTLE_IMAGE,
  uploadHomepageHeroImage,
} from "@/lib/media/images";
import { seedBottles, seedFxRates, seedListings } from "@/lib/seed";
import { assertSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type {
  AdminDashboardMetrics,
  AdminNewsItem,
  AdminProfileSummary,
  AppUser,
  Listing,
} from "@/lib/types";
import { fetchAllListings } from "@/lib/data/listings";
import { appendAuditLog } from "@/lib/data/audit";
import {
  ensureProfile,
  isMissingProfileColumnError,
  mapAdminNewsRow,
  mapFxRateRow,
  startOfTodayInSeoulIso,
  toDbStatus,
  toSupabaseError,
} from "@/lib/data/shared";

export async function fetchFxRate(pair = DEFAULT_FX_PAIR) {
  assertSupabaseConfigured();
  try {
    const { data, error } = await supabase!
      .from("fx_rates")
      .select("*")
      .eq("pair", pair)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return mapFxRateRow(data, pair);
  } catch {
    return null;
  }
}

export async function saveFxRateEntry(input: {
  pair?: string;
  rate: number;
  source: string;
}): Promise<void> {
  assertSupabaseConfigured();
  const { error } = await supabase!.from("fx_rates").insert({
    pair: input.pair ?? DEFAULT_FX_PAIR,
    rate: input.rate,
    source: input.source.trim(),
  });
  if (error) throw toSupabaseError(error, "Unable to save FX rate.");
  await appendAuditLog({
    action: "fx_rate.saved",
    targetType: "fx_rate",
    targetId: input.pair ?? DEFAULT_FX_PAIR,
    details: {
      pair: input.pair ?? DEFAULT_FX_PAIR,
      rate: input.rate,
      source: input.source.trim(),
    },
  });
}

export async function fetchAdminMetrics(): Promise<AdminDashboardMetrics> {
  assertSupabaseConfigured();
  const todayIso = startOfTodayInSeoulIso();

  const [
    todayVisitorsResult,
    totalVisitorsResult,
    todayListingsResult,
    totalListingsResult,
    activeListingsResult,
    openReportsResult,
  ] = await Promise.all([
    supabase!.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
    supabase!.from("profiles").select("id", { count: "exact", head: true }),
    supabase!.from("listings").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
    supabase!.from("listings").select("id", { count: "exact", head: true }),
    supabase!.from("listings").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase!.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);

  return {
    todayVisitors: todayVisitorsResult.count ?? 0,
    totalVisitors: totalVisitorsResult.count ?? 0,
    todayListings: todayListingsResult.count ?? 0,
    totalListings: totalListingsResult.count ?? 0,
    activeListings: activeListingsResult.count ?? 0,
    openReports: openReportsResult.count ?? 0,
  };
}

export async function fetchAdminNews(): Promise<AdminNewsItem[]> {
  assertSupabaseConfigured();
  const { data, error } = await supabase!
    .from("news")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(50);
  if (error) throw toSupabaseError(error, "Unable to load news.");
  return (data ?? []).map(mapAdminNewsRow);
}

export async function createManualNews(input: {
  title: string;
  summary: string;
  source: string;
  url: string;
  imageUrl?: string;
  publishedAt?: string;
  priority: "high" | "medium" | "low";
}): Promise<void> {
  assertSupabaseConfigured();
  const payload: Record<string, unknown> = {
    id: `manual-${Date.now()}`,
    title: input.title.trim(),
    summary: input.summary.trim(),
    source: input.source.trim(),
    url: input.url.trim(),
    image_url: resolveNewsImageUrl(input.url.trim(), input.imageUrl),
    published_at: input.publishedAt || new Date().toISOString(),
    created_at: new Date().toISOString(),
    priority: input.priority,
    category: "whisky",
    external: true,
    type: "article",
  };

  const optionalColumns = new Set(["priority", "type", "category", "external"]);
  let nextPayload = { ...payload };
  let { error } = await supabase!.from("news").upsert(nextPayload, { onConflict: "url" });

  while (error && isMissingProfileColumnError(error)) {
    const message = error.message ?? "";
    const match = message.match(/'([^']+)' column of 'news'/i);
    const missingColumn = match?.[1];
    if (!missingColumn || !optionalColumns.has(missingColumn) || !(missingColumn in nextPayload)) {
      break;
    }

    delete nextPayload[missingColumn];
    const retryResult = await supabase!.from("news").upsert(nextPayload, { onConflict: "url" });
    error = retryResult.error;
  }

  if (error) throw toSupabaseError(error, "Unable to save manual news.");
  await appendAuditLog({
    action: "news.created",
    targetType: "news",
    targetId: String(nextPayload.id ?? payload.id),
    details: {
      title: String(nextPayload.title ?? payload.title),
      source: String(nextPayload.source ?? payload.source),
      priority: String(nextPayload.priority ?? payload.priority ?? ""),
      type: String(nextPayload.type ?? payload.type ?? ""),
    },
  });
}

export async function updateNewsPriority(
  newsId: string,
  priority: "high" | "medium" | "low",
): Promise<void> {
  assertSupabaseConfigured();
  const { error } = await supabase!
    .from("news")
    .update({ priority })
    .eq("id", newsId);
  if (error) {
    if (isMissingProfileColumnError(error)) {
      throw new Error("News priority is not available in the current database schema.");
    }
    throw toSupabaseError(error, "Unable to update news priority.");
  }
  await appendAuditLog({
    action: "news.priority_updated",
    targetType: "news",
    targetId: newsId,
    details: { priority },
  });
}

export async function deleteNewsItem(newsId: string): Promise<void> {
  assertSupabaseConfigured();
  const { error } = await supabase!.from("news").delete().eq("id", newsId);
  if (error) throw toSupabaseError(error, "Unable to delete news item.");
  await appendAuditLog({
    action: "news.deleted",
    targetType: "news",
    targetId: newsId,
  });
}

export async function fetchAdminUsers(): Promise<AdminProfileSummary[]> {
  assertSupabaseConfigured();
  const [{ data: profiles, error: profilesError }, { data: admins, error: adminsError }] =
    await Promise.all([
      supabase!.from("profiles").select("id,email,created_at").order("created_at", { ascending: false }),
      supabase!.from("admins").select("user_id,role"),
    ]);

  if (profilesError) throw toSupabaseError(profilesError, "Unable to load users.");
  if (adminsError) throw toSupabaseError(adminsError, "Unable to load admin roles.");

  const adminIds = new Set((admins ?? []).map((row) => String(row.user_id ?? "")));
  return (profiles ?? []).map((row) => ({
    id: String(row.id ?? ""),
    email: String(row.email ?? ""),
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    role: adminIds.has(String(row.id ?? "")) ? "admin" : "user",
  }));
}

export async function updateUserAdminRole(userId: string, makeAdmin: boolean): Promise<void> {
  assertSupabaseConfigured();
  if (makeAdmin) {
    const { error } = await supabase!
      .from("admins")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id" });
    if (error) throw toSupabaseError(error, "Unable to grant admin role.");
    await appendAuditLog({
      action: "admin.role_granted",
      targetType: "user",
      targetId: userId,
      details: { role: "admin" },
    });
    return;
  }

  const { error } = await supabase!.from("admins").delete().eq("user_id", userId);
  if (error) throw toSupabaseError(error, "Unable to remove admin role.");
  await appendAuditLog({
    action: "admin.role_removed",
    targetType: "user",
    targetId: userId,
    details: { role: "admin" },
  });
}

export async function fetchAdminListings(): Promise<Listing[]> {
  return fetchAllListings(200);
}

export async function checkAdmin(uid: string): Promise<boolean> {
  assertSupabaseConfigured();
  const { data, error } = await supabase!
    .from("admins")
    .select("user_id")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function seedSampleData(adminUser: AppUser): Promise<void> {
  assertSupabaseConfigured();

  await ensureProfile({ id: adminUser.uid, email: adminUser.email });

  const { error: adminError } = await supabase!.from("admins").upsert(
    {
      user_id: adminUser.uid,
      role: "admin",
    },
    { onConflict: "user_id" },
  );
  if (adminError) throw toSupabaseError(adminError, "Unable to seed admin.");

  const bottleRows = seedBottles.map((bottle) => ({
    id: bottle.id,
    name: bottle.name,
    brand: bottle.brand,
    category: bottle.category,
    line: bottle.line,
    batch: bottle.batch,
    age_statement: bottle.ageStatement,
    abv: bottle.abv,
    volume_ml: bottle.volumeMl,
    aliases: bottle.aliases,
    hot_bottle: bottle.hotBottle ?? false,
    master_image_url: bottle.masterImageUrl ?? bottle.imageUrl,
    master_preview_image_url: bottle.masterPreviewImageUrl ?? bottle.masterImageUrl ?? bottle.imageUrl,
    image_url: bottle.imageUrl,
    created_at: new Date(String(bottle.createdAt)).toISOString(),
    updated_at: new Date(String(bottle.updatedAt)).toISOString(),
  }));

  const listingRows = seedListings.map((listing) => ({
    id: listing.id,
    bottle_id: listing.bottleId,
    bottle_name: listing.bottleName,
    category: listing.category,
    user_id: adminUser.uid,
    price: listing.inputPriceValue,
    currency: listing.inputCurrency,
    fx_rate_at_entry: listing.fxRateAtEntry,
    normalized_price_usd: listing.normalizedPriceUsd,
    approx_price_krw: listing.approxPriceKrw,
    quantity: listing.quantity,
    condition: listing.condition,
    region: listing.region,
    messenger_type: listing.messengerType ?? "telegram",
    messenger_handle: listing.messengerHandle ?? listing.telegramId ?? "",
    telegram_id: listing.telegramId ?? "",
    note: listing.note,
    original_images: listing.originalImages ?? [],
    thumbnail_images: listing.thumbnailImages ?? [],
    image_url: listing.imageUrl || DEFAULT_REGISTER_BOTTLE_IMAGE,
    status: toDbStatus(listing.status),
    created_at: new Date(String(listing.createdAt)).toISOString(),
    updated_at: new Date(String(listing.updatedAt)).toISOString(),
  }));

  const fxRows = seedFxRates.map((rate) => ({
    id: rate.id ?? undefined,
    pair: rate.pair,
    rate: rate.rate,
    source: rate.source,
    updated_at: new Date(String(rate.updatedAt)).toISOString(),
  }));

  const { error: bottleError } = await supabase!.from("bottles").upsert(bottleRows);
  if (bottleError) throw toSupabaseError(bottleError, "Unable to seed bottles.");
  const { error: listingError } = await supabase!.from("listings").upsert(listingRows);
  if (listingError) throw toSupabaseError(listingError, "Unable to seed listings.");
  const { error: fxError } = await supabase!.from("fx_rates").upsert(fxRows);
  if (fxError) throw toSupabaseError(fxError, "Unable to seed FX rates.");
  await appendAuditLog({
    action: "seed.sample_data",
    targetType: "system",
    targetId: adminUser.uid,
    details: {
      bottleCount: bottleRows.length,
      listingCount: listingRows.length,
      fxRateCount: fxRows.length,
    },
  });
}
