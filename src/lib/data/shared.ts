import { DEFAULT_FX_PAIR } from "@/lib/constants";
import {
  DEFAULT_REGISTER_BOTTLE_IMAGE,
  getListingPreviewImage,
} from "@/lib/media/images";
import { resolveNewsImageUrl } from "@/lib/news-utils";
import { normalizeTelegramId, priceToKrw, toDate } from "@/lib/format";
import type {
  AdminNewsItem,
  AppDateValue,
  AppUser,
  Bottle,
  BottleReferencePrice,
  FxRate,
  HomepageBanner,
  Listing,
  Report,
  SpiritCategory,
} from "@/lib/types";
import { assertSupabaseConfigured, supabase } from "@/lib/supabase/client";

export type BottleRow = Record<string, unknown>;
export type ListingRow = Record<string, unknown> & { bottle?: Record<string, unknown> | null };
export type ListingContactRow = Record<string, unknown>;
export type ReportRow = Record<string, unknown>;
export type BottleReferencePriceRow = Record<string, unknown>;
export type NewsRow = Record<string, unknown>;
export type ContentSlotRow = Record<string, unknown>;

export type ProfileInput = {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  termsAcceptedAt?: string;
};

export function sortByCreatedAtDesc<T extends { createdAt: AppDateValue }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const left = toDate(a.createdAt)?.getTime() ?? 0;
    const right = toDate(b.createdAt)?.getTime() ?? 0;
    return right - left;
  });
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      });
  });
}

export function normalizeCategory(category: unknown): SpiritCategory {
  switch (category) {
    case "Bourbon":
    case "Whisky":
    case "Etc":
    case "Rum":
    case "Tequila":
    case "Sake":
    case "Other spirits":
      return category;
    default:
      return "Whisky";
  }
}

export function normalizeListingStatus(status: unknown): Listing["status"] {
  return status === "active" ? "active" : "inactive";
}

export function toNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function toSupabaseError(error: unknown, fallback: string): Error {
  const rawMessage =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? fallback)
        : fallback;

  if (
    rawMessage.includes("Unsupported provider") ||
    rawMessage.includes('"error_code":"validation_failed"')
  ) {
    return new Error(
      "Google sign-in is not enabled for this Supabase project yet. Enable Google under Supabase Authentication > Providers, then add your Google OAuth client credentials.",
    );
  }

  if (error instanceof Error) return error;
  if (error && typeof error === "object" && "message" in error) {
    return new Error(String((error as { message?: unknown }).message ?? fallback));
  }
  return new Error(fallback);
}

export function isMissingProfileColumnError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");
  return /column .* does not exist/i.test(message) || /schema cache/i.test(message);
}

export function mapBottleRow(row: BottleRow): Bottle {
  return {
    id: String(row.id ?? ""),
    category: normalizeCategory(row.category),
    name: String(row.name ?? ""),
    brand: String(row.brand ?? ""),
    line: String(row.line ?? ""),
    batch: String(row.batch ?? ""),
    ageStatement: String(row.age_statement ?? ""),
    abv: toNumber(row.abv),
    volumeMl: toNumber(row.volume_ml, 750),
    aliases: toStringArray(row.aliases),
    hotBottle: Boolean(row.hot_bottle),
    masterImageUrl:
      String(row.master_image_url ?? row.image_url ?? DEFAULT_REGISTER_BOTTLE_IMAGE),
    masterPreviewImageUrl:
      String(
        row.master_preview_image_url ??
          row.master_image_url ??
          row.image_url ??
          DEFAULT_REGISTER_BOTTLE_IMAGE,
      ),
    imageUrl: String(row.image_url ?? row.master_image_url ?? DEFAULT_REGISTER_BOTTLE_IMAGE),
    createdAt: (row.created_at as AppDateValue) ?? new Date().toISOString(),
    updatedAt:
      (row.updated_at as AppDateValue) ??
      (row.created_at as AppDateValue) ??
      new Date().toISOString(),
  };
}

export function mapListingRow(row: ListingRow): Listing {
  const bottle = row.bottle ?? null;
  const inputCurrency = row.currency === "KRW" ? "KRW" : "USD";
  const inputPriceValue = toNumber(row.price);
  const fxRateAtEntry = toNumber(row.fx_rate_at_entry);
  const normalizedPriceUsd = toNumber(row.normalized_price_usd);
  const approxPriceKrw =
    row.approx_price_krw !== undefined
      ? toNumber(row.approx_price_krw)
      : Math.round(priceToKrw(inputPriceValue, inputCurrency, fxRateAtEntry));
  const messengerType =
    typeof row.messenger_type === "string" ? row.messenger_type : undefined;
  const messengerHandle =
    typeof row.messenger_handle === "string"
      ? row.messenger_handle
      : typeof row.telegram_id === "string"
        ? row.telegram_id
        : "";

  return {
    id: String(row.id ?? ""),
    bottleId: String(row.bottle_id ?? ""),
    bottleName: String(row.bottle_name ?? bottle?.name ?? ""),
    category: normalizeCategory(row.category ?? bottle?.category),
    inputPriceValue,
    inputCurrency,
    fxRateAtEntry,
    normalizedPriceUsd,
    approxPriceKrw,
    quantity: toNumber(row.quantity, 1),
    condition: String(row.condition ?? ""),
    region: String(row.region ?? ""),
    messengerType: messengerType as Listing["messengerType"],
    messengerHandle,
    telegramId:
      messengerType === "telegram" ? normalizeTelegramId(messengerHandle) : "",
    note: String(row.note ?? ""),
    originalImages: toStringArray(row.original_images),
    thumbnailImages: toStringArray(row.thumbnail_images),
    imageUrl:
      String(
        row.image_url ??
          toStringArray(row.thumbnail_images)[0] ??
          toStringArray(row.original_images)[0] ??
          DEFAULT_REGISTER_BOTTLE_IMAGE,
      ),
    status: normalizeListingStatus(row.status),
    createdAt: (row.created_at as AppDateValue) ?? new Date().toISOString(),
    updatedAt:
      (row.updated_at as AppDateValue) ??
      (row.created_at as AppDateValue) ??
      new Date().toISOString(),
    createdBy: String(row.user_id ?? ""),
  };
}

export function mapListingContactRow(row: ListingContactRow): Pick<
  Listing,
  "messengerType" | "messengerHandle" | "telegramId"
> {
  const messengerType =
    typeof row.messenger_type === "string" ? row.messenger_type : undefined;
  const messengerHandle =
    typeof row.messenger_handle === "string"
      ? row.messenger_handle
      : typeof row.telegram_id === "string"
        ? row.telegram_id
        : "";

  return {
    messengerType: messengerType as Listing["messengerType"],
    messengerHandle,
    telegramId: messengerType === "telegram" ? normalizeTelegramId(messengerHandle) : "",
  };
}

export function mapReportRow(row: ReportRow): Report {
  return {
    id: String(row.id ?? ""),
    listingId: String(row.listing_id ?? ""),
    reason: String(row.reason ?? ""),
    note: String(row.note ?? ""),
    createdBy: String(row.user_id ?? ""),
    status: row.status === "resolved" ? "resolved" : "open",
    createdAt: (row.created_at as AppDateValue) ?? new Date().toISOString(),
    updatedAt:
      (row.updated_at as AppDateValue) ??
      (row.created_at as AppDateValue) ??
      new Date().toISOString(),
  };
}

export function mapAdminNewsRow(row: NewsRow): AdminNewsItem {
  const url = String(row.url ?? "");
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    summary: String(row.summary ?? ""),
    source: String(row.source ?? ""),
    url,
    imageUrl: resolveNewsImageUrl(url, String(row.image_url ?? "")),
    publishedAt:
      (row.published_at as AppDateValue) ??
      (row.created_at as AppDateValue) ??
      new Date().toISOString(),
    createdAt: (row.created_at as AppDateValue) ?? new Date().toISOString(),
    priority:
      row.priority === "high" || row.priority === "medium" || row.priority === "low"
        ? row.priority
        : "medium",
    type: row.type === "video" ? "video" : "article",
  };
}

export function mapHomepageBannerRow(row: ContentSlotRow): HomepageBanner {
  return {
    id: String(row.id ?? ""),
    slotKey: String(row.slot_key ?? ""),
    label: String(row.label ?? ""),
    type: String(row.type ?? "hero"),
    imageUrl: String(row.image_url ?? ""),
    headline: String(row.headline ?? ""),
    subcopy: String(row.subcopy ?? ""),
    isActive: Boolean(row.is_active),
    displayOrder: toNumber(row.display_order),
    createdAt: (row.created_at as AppDateValue) ?? new Date().toISOString(),
    updatedAt: (row.updated_at as AppDateValue) ?? new Date().toISOString(),
  };
}

export function mapBottleReferencePriceRow(row: BottleReferencePriceRow): BottleReferencePrice {
  return {
    bottleId: String(row.bottle_id ?? ""),
    source: String(row.source ?? ""),
    referencePriceUsd: toNumber(row.reference_price_usd),
    referencePrice6mAgo:
      row.reference_price_6m_ago === null || row.reference_price_6m_ago === undefined
        ? null
        : toNumber(row.reference_price_6m_ago),
    referenceChangePercent:
      row.reference_change_percent === null || row.reference_change_percent === undefined
        ? null
        : toNumber(row.reference_change_percent),
    sourceUrl: typeof row.source_url === "string" ? row.source_url : "",
    updatedAt: (row.updated_at as AppDateValue) ?? new Date().toISOString(),
    confidenceScore:
      row.confidence_score === null || row.confidence_score === undefined
        ? null
        : toNumber(row.confidence_score),
    matchedName: typeof row.matched_name === "string" ? row.matched_name : "",
    matchedVolumeMl:
      row.matched_volume_ml === null || row.matched_volume_ml === undefined
        ? null
        : toNumber(row.matched_volume_ml),
  };
}

export async function ensureProfile(
  user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  },
  input?: ProfileInput,
): Promise<void> {
  assertSupabaseConfigured();
  void input;
  const profilePayload = {
    id: user.id,
    email: user.email ?? "",
  };

  const { error } = await supabase!.from("profiles").upsert(profilePayload, { onConflict: "id" });
  if (!error) return;

  throw toSupabaseError(error, "Unable to save profile.");
}

export function readUserProfileMetadata(user: {
  user_metadata?: Record<string, unknown> | null;
}): Pick<AppUser, "firstName" | "lastName" | "dateOfBirth"> {
  const metadata = user.user_metadata ?? {};
  return {
    firstName: typeof metadata.first_name === "string" ? metadata.first_name : "",
    lastName: typeof metadata.last_name === "string" ? metadata.last_name : "",
    dateOfBirth: typeof metadata.date_of_birth === "string" ? metadata.date_of_birth : "",
  };
}

export function currentOrigin(): string | undefined {
  return typeof window !== "undefined" ? window.location.origin : undefined;
}

export function startOfTodayInSeoulIso(): string {
  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60_000;
  const seoul = new Date(utcTime + 9 * 60 * 60 * 1000);
  const startOfDaySeoul = new Date(
    Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth(), seoul.getUTCDate(), -9, 0, 0, 0),
  );
  return startOfDaySeoul.toISOString();
}

export function toDbStatus(status: Listing["status"]): "active" | "inactive" {
  return status === "active" ? "active" : "inactive";
}

export async function fetchListingsQuery(limitSize?: number, bottleId?: string): Promise<Listing[]> {
  assertSupabaseConfigured();
  let query = supabase!
    .from("public_listings")
    .select("*")
    .order("created_at", { ascending: false });

  if (limitSize) query = query.limit(limitSize);
  if (bottleId) query = query.eq("bottle_id", bottleId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapListingRow);
}

export function mapFxRateRow(data: Record<string, unknown>, pair = DEFAULT_FX_PAIR): FxRate {
  return {
    id: String(data.id ?? ""),
    pair: String(data.pair ?? pair),
    rate: toNumber(data.rate),
    updatedAt: (data.updated_at as AppDateValue) ?? new Date().toISOString(),
    source: String(data.source ?? ""),
  };
}

export function buildListingPreviewUrl(listing: Listing): string {
  return getListingPreviewImage(listing, "preview");
}
