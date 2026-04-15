import {
  clearLocalHomepageBanners,
  getLocalHomepageBanners,
  saveLocalHomepageBanners,
} from "@/lib/local-fallback";
import { appendAuditLog } from "@/lib/data/audit";
import { uploadHomepageHeroImage } from "@/lib/media/images";
import { assertSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { HomepageBanner } from "@/lib/types";
import { mapHomepageBannerRow } from "@/lib/data/shared";

let contentSlotsUnavailable = false;
const CONTENT_SLOTS_UNAVAILABLE_KEY = "caskfolio.contentSlots.unavailableAt";
const CONTENT_SLOTS_UNAVAILABLE_TTL_MS = 1000 * 30;

function getUnavailableCache(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(CONTENT_SLOTS_UNAVAILABLE_KEY);
  const value = Number(raw || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (Date.now() - value > CONTENT_SLOTS_UNAVAILABLE_TTL_MS) {
    window.localStorage.removeItem(CONTENT_SLOTS_UNAVAILABLE_KEY);
    return 0;
  }
  return value;
}

function rememberUnavailableCache(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONTENT_SLOTS_UNAVAILABLE_KEY, String(Date.now()));
}

function clearUnavailableCache(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CONTENT_SLOTS_UNAVAILABLE_KEY);
}

function isMissingContentSlotsTableError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");

  return (
    /content_slots/i.test(message) &&
    (/schema cache/i.test(message) ||
      /relation .* does not exist/i.test(message) ||
      /could not find the table/i.test(message))
  );
}

export async function fetchHomepageBanners(): Promise<HomepageBanner[]> {
  assertSupabaseConfigured();
  const localBanners = getLocalHomepageBanners()
    .slice()
    .sort((left, right) => left.displayOrder - right.displayOrder);
  try {
    const { data, error } = await supabase!
      .from("content_slots")
      .select("*")
      .like("slot_key", "homepage_banner_%")
      .order("display_order", { ascending: true })
      .order("updated_at", { ascending: false });

    if (error) throw error;
    const remoteBanners = (data ?? []).map(mapHomepageBannerRow);
    contentSlotsUnavailable = false;
    clearUnavailableCache();
    if (remoteBanners.length > 0) {
      clearLocalHomepageBanners();
      return remoteBanners;
    }
    return localBanners;
  } catch (error) {
    if (isMissingContentSlotsTableError(error)) {
      contentSlotsUnavailable = true;
      rememberUnavailableCache();
    }
    return localBanners;
  }
}

export async function saveHomepageBanner(input: {
  id?: string;
  label: string;
  headline: string;
  subcopy: string;
  isActive: boolean;
  type?: string;
  imageFile?: File | null;
  imageUrl?: string;
  displayOrder: number;
}): Promise<HomepageBanner> {
  assertSupabaseConfigured();
  const currentBanners = await fetchHomepageBanners();
  const nextId = input.id || globalThis.crypto?.randomUUID?.() || `banner-${Date.now()}`;
  const current = currentBanners.find((banner) => banner.id === nextId) ?? null;
  const slotKey = current?.slotKey || `homepage_banner_${nextId}`;
  const nextImageUrl = input.imageFile
    ? await uploadHomepageHeroImage(slotKey, input.imageFile)
    : input.imageUrl?.trim() || current?.imageUrl || "";

  const payload = {
    id: nextId,
    slot_key: slotKey,
    label: input.label.trim(),
    type: input.type?.trim() || current?.type || "hero",
    image_url: nextImageUrl,
    headline: input.headline.trim(),
    subcopy: input.subcopy.trim(),
    is_active: input.isActive,
    display_order: input.displayOrder,
    updated_at: new Date().toISOString(),
  };

  const localBanner: HomepageBanner = {
    id: current?.id || nextId,
    slotKey,
    label: payload.label,
    type: payload.type,
    imageUrl: payload.image_url,
    headline: payload.headline,
    subcopy: payload.subcopy,
    isActive: payload.is_active,
    displayOrder: payload.display_order,
    createdAt: current?.createdAt || new Date().toISOString(),
    updatedAt: payload.updated_at,
  };

  const { error } = await supabase!
    .from("content_slots")
    .upsert(payload, { onConflict: "id" });
  if (error) {
    if (isMissingContentSlotsTableError(error)) {
      contentSlotsUnavailable = true;
      rememberUnavailableCache();
    }
    const merged = [...currentBanners.filter((banner) => banner.id !== localBanner.id), localBanner].sort(
      (left, right) => left.displayOrder - right.displayOrder,
    );
    saveLocalHomepageBanners(merged);
    return localBanner;
  }

  clearLocalHomepageBanners();
  contentSlotsUnavailable = false;
  clearUnavailableCache();
  await appendAuditLog({
    action: current ? "banner.updated" : "banner.created",
    targetType: "content_slot",
    targetId: localBanner.id,
    details: {
      slotKey,
      label: payload.label,
      type: payload.type,
      isActive: payload.is_active,
      displayOrder: payload.display_order,
    },
  });
  return localBanner;
}

export async function deleteHomepageBanner(bannerId: string): Promise<void> {
  assertSupabaseConfigured();
  const currentBanners = await fetchHomepageBanners();
  const { error } = await supabase!.from("content_slots").delete().eq("id", bannerId);
  if (error) {
    if (isMissingContentSlotsTableError(error)) {
      contentSlotsUnavailable = true;
      rememberUnavailableCache();
    }
    saveLocalHomepageBanners(currentBanners.filter((banner) => banner.id !== bannerId));
    return;
  }

  clearLocalHomepageBanners();
  contentSlotsUnavailable = false;
  clearUnavailableCache();
  await appendAuditLog({
    action: "banner.deleted",
    targetType: "content_slot",
    targetId: bannerId,
  });
}

export async function reorderHomepageBanners(orderedIds: string[]): Promise<void> {
  assertSupabaseConfigured();
  const currentBanners = await fetchHomepageBanners();
  const payload = orderedIds
    .map((id, index) => {
      const banner = currentBanners.find((item) => item.id === id);
      if (!banner) return null;
      return {
        id: banner.id,
        slot_key: banner.slotKey,
        label: banner.label,
        type: banner.type,
        image_url: banner.imageUrl,
        headline: banner.headline,
        subcopy: banner.subcopy,
        is_active: banner.isActive,
        display_order: index,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const { error } = await supabase!.from("content_slots").upsert(payload, { onConflict: "id" });
  if (error) {
    if (isMissingContentSlotsTableError(error)) {
      contentSlotsUnavailable = true;
      rememberUnavailableCache();
    }
    saveLocalHomepageBanners(
      payload.map((item) => {
        const existing = currentBanners.find((banner) => banner.id === item.id);
        return {
          id: item.id,
          slotKey: item.slot_key,
          label: item.label,
          type: item.type,
          imageUrl: item.image_url,
          headline: item.headline,
          subcopy: item.subcopy,
          isActive: item.is_active,
          displayOrder: item.display_order,
          createdAt: existing?.createdAt || new Date().toISOString(),
          updatedAt: item.updated_at,
        };
      }),
    );
    return;
  }

  clearLocalHomepageBanners();
  contentSlotsUnavailable = false;
  clearUnavailableCache();
  await appendAuditLog({
    action: "banner.reordered",
    targetType: "content_slot",
    details: { orderedIds },
  });
}

export async function syncLocalHomepageBannersToRemote(): Promise<boolean> {
  assertSupabaseConfigured();
  const localBanners = getLocalHomepageBanners()
    .slice()
    .sort((left, right) => left.displayOrder - right.displayOrder);

  if (!localBanners.length) {
    return false;
  }

  const { data, error } = await supabase!
    .from("content_slots")
    .select("id")
    .like("slot_key", "homepage_banner_%")
    .limit(1);

  if (error) {
    throw error;
  }

  if ((data ?? []).length > 0) {
    clearLocalHomepageBanners();
    contentSlotsUnavailable = false;
    clearUnavailableCache();
    return false;
  }

  const now = new Date().toISOString();
  const payload = localBanners.map((banner, index) => ({
    id: banner.id,
    slot_key: banner.slotKey,
    label: banner.label,
    type: banner.type,
    image_url: banner.imageUrl,
    headline: banner.headline,
    subcopy: banner.subcopy,
    is_active: banner.isActive,
    display_order: Number.isFinite(banner.displayOrder) ? banner.displayOrder : index,
    updated_at: now,
  }));

  const { error: upsertError } = await supabase!
    .from("content_slots")
    .upsert(payload, { onConflict: "id" });

  if (upsertError) {
    throw upsertError;
  }

  clearLocalHomepageBanners();
  contentSlotsUnavailable = false;
  clearUnavailableCache();
  return true;
}
