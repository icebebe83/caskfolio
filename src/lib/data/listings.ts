import {
  normalizeMessengerHandle,
  normalizeTelegramId,
  priceToKrw,
  priceToUsd,
  toDate,
} from "@/lib/format";
import {
  DEFAULT_REGISTER_BOTTLE_IMAGE,
  getListingPreviewImage,
  saveListingImageMetadata,
  uploadListingOriginalImages,
} from "@/lib/media/images";
import { appendAuditLog } from "@/lib/data/audit";
import {
  clearLocalFallbackData,
  clearLocalListings,
} from "@/lib/local-fallback";
import { assertSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { AppUser, Listing, ListingFormInput } from "@/lib/types";
import {
  fetchListingsQuery,
  mapListingContactRow,
  mapListingRow,
  sortByCreatedAtDesc,
  toDbStatus,
  toSupabaseError,
  withTimeout,
} from "@/lib/data/shared";

export async function fetchLatestListings(limitSize = 8): Promise<Listing[]> {
  assertSupabaseConfigured();
  try {
    clearLocalListings();
    return (await fetchListingsQuery(limitSize)).slice(0, limitSize);
  } catch {
    return [];
  }
}

export async function fetchAllListings(limitSize = 200): Promise<Listing[]> {
  assertSupabaseConfigured();
  try {
    clearLocalListings();
    return (await fetchListingsQuery(limitSize)).slice(0, limitSize);
  } catch {
    return [];
  }
}

export async function fetchListingsForBottle(bottleId: string): Promise<Listing[]> {
  assertSupabaseConfigured();
  try {
    clearLocalListings();
    return sortByCreatedAtDesc(
      (await fetchListingsQuery(undefined, bottleId)).filter((item) => item.bottleId === bottleId),
    );
  } catch {
    return [];
  }
}

export async function fetchListingsForBottleIds(bottleIds: string[]): Promise<Listing[]> {
  assertSupabaseConfigured();
  if (!bottleIds.length) return [];

  try {
    clearLocalListings();
    const { data, error } = await supabase!
      .from("public_listings")
      .select("*")
      .in("bottle_id", bottleIds)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapListingRow);
  } catch {
    return [];
  }
}

export async function fetchListingContact(
  listingId: string,
): Promise<Pick<Listing, "messengerType" | "messengerHandle" | "telegramId"> | null> {
  assertSupabaseConfigured();
  try {
    const { data, error } = await supabase!
      .from("listing_contacts")
      .select("messenger_type,messenger_handle,telegram_id")
      .eq("listing_id", listingId)
      .maybeSingle();
    if (error || !data) return null;
    return mapListingContactRow(data);
  } catch {
    return null;
  }
}

export async function submitListing(
  user: AppUser,
  input: ListingFormInput,
  fxRate: number,
  options?: {
    onStageChange?: (stage: "creating-listing" | "uploading-images") => void;
  },
): Promise<{ persisted: "supabase" | "local"; imageUploaded: boolean; uploadIssue?: string }> {
  assertSupabaseConfigured();

  let imageUploaded = false;
  let uploadIssue = "";
  const imageFiles = [...(input.imageFiles ?? []), input.imageFile].filter(
    (file): file is File => Boolean(file),
  );

  const normalizedPriceUsd = Number(
    priceToUsd(input.inputPriceValue, input.inputCurrency, fxRate).toFixed(2),
  );
  const approxPriceKrw = Math.round(
    priceToKrw(input.inputPriceValue, input.inputCurrency, fxRate),
  );

  const normalizedMessengerHandle = normalizeMessengerHandle(
    input.messengerType,
    input.messengerHandle,
  );

  const listingPayload = {
    bottle_id: input.bottle.id,
    bottle_name: input.bottle.name,
    category: input.bottle.category,
    user_id: user.uid,
    price: input.inputPriceValue,
    currency: input.inputCurrency,
    fx_rate_at_entry: fxRate,
    normalized_price_usd: normalizedPriceUsd,
    approx_price_krw: approxPriceKrw,
    quantity: input.quantity,
    condition: input.condition,
    region: input.region.trim(),
    note: input.note.trim(),
    original_images: [] as string[],
    thumbnail_images: [] as string[],
    image_url: DEFAULT_REGISTER_BOTTLE_IMAGE,
    status: "active" as const,
  };

  const recentListingLookup = async (): Promise<Listing | null> => {
    try {
      const { data, error } = await withTimeout(
        Promise.resolve(
          supabase!
            .from("listings")
            .select("*, bottle:bottles(name,category)")
            .eq("user_id", user.uid)
            .eq("bottle_id", input.bottle.id)
            .eq("price", input.inputPriceValue)
            .eq("currency", input.inputCurrency)
            .eq("normalized_price_usd", normalizedPriceUsd)
            .eq("note", input.note.trim())
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle() as never,
        ),
        5000,
        "Checking the saved listing took too long.",
      );

      if (error || !data) return null;

      const mapped = mapListingRow(data);
      const createdAt = toDate(mapped.createdAt)?.getTime() ?? 0;
      const recencyWindowMs = 2 * 60 * 1000;
      return Date.now() - createdAt <= recencyWindowMs ? mapped : null;
    } catch {
      return null;
    }
  };

  try {
    options?.onStageChange?.("creating-listing");
    const { data, error } = await withTimeout<{ data: Record<string, unknown> | null; error: unknown }>(
      Promise.resolve(
        supabase!.from("listings").insert(listingPayload).select("*, bottle:bottles(name,category)").single() as never,
      ),
      15000,
      "Saving the listing took too long. Please try again.",
    );
    if (error || !data) throw error;

    let nextListing = mapListingRow(data);

    const contactPayload = {
      listing_id: nextListing.id,
      user_id: user.uid,
      messenger_type: input.messengerType,
      messenger_handle: normalizedMessengerHandle,
      telegram_id:
        input.messengerType === "telegram" ? normalizeTelegramId(input.messengerHandle) : "",
      updated_at: new Date().toISOString(),
    };

    const { error: contactError } = await supabase!.from("listing_contacts").upsert(contactPayload, {
      onConflict: "listing_id",
    });
    if (contactError) throw contactError;

    nextListing = {
      ...nextListing,
      messengerType: contactPayload.messenger_type as Listing["messengerType"],
      messengerHandle: contactPayload.messenger_handle,
      telegramId: contactPayload.telegram_id,
    };

    if (imageFiles.length) {
      try {
        options?.onStageChange?.("uploading-images");
        const imageMetadata = await withTimeout(
          uploadListingOriginalImages(nextListing.id, imageFiles),
          10000,
          "Uploading the images took too long.",
        );
        const legacyImageUrl = getListingPreviewImage(
          {
            ...nextListing,
            ...imageMetadata,
          },
          "preview",
        );
        await withTimeout(
          saveListingImageMetadata(nextListing.id, {
            ...imageMetadata,
            imageUrl: legacyImageUrl,
          }),
          6000,
          "Finishing the image update took too long.",
        );
        nextListing = {
          ...nextListing,
          ...imageMetadata,
          imageUrl: legacyImageUrl,
        };
        imageUploaded = imageMetadata.originalImages.length > 0;
      } catch (error) {
        uploadIssue = error instanceof Error ? error.message : "Image upload failed.";
      }
    }

    clearLocalFallbackData();
    return { persisted: "supabase", imageUploaded, uploadIssue: uploadIssue || undefined };
  } catch {
    const persistedListing = await recentListingLookup();
    if (persistedListing) {
      clearLocalFallbackData();
      return {
        persisted: "supabase",
        imageUploaded: Boolean((persistedListing.originalImages ?? []).length),
        uploadIssue: uploadIssue || undefined,
      };
    }
    throw toSupabaseError(
      new Error("We couldn't save the listing right now."),
      "We couldn't save the listing right now.",
    );
  }
}

export async function updateListingStatus(
  listingId: string,
  status: Listing["status"],
): Promise<void> {
  const nextStatus = toDbStatus(status);
  if (listingId.startsWith("local-")) {
    clearLocalListings();
    return;
  }

  assertSupabaseConfigured();
  const { error } = await supabase!
    .from("listings")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", listingId);
  if (error) throw toSupabaseError(error, "Unable to update listing status.");
  await appendAuditLog({
    action: "listing.status_updated",
    targetType: "listing",
    targetId: listingId,
    details: { status: nextStatus },
  });
  clearLocalListings();
}

export async function updateListing(
  listing: Listing,
  input: {
    inputPriceValue: number;
    inputCurrency: Listing["inputCurrency"];
    fxRate: number;
    quantity: number;
    condition: string;
    region: string;
    messengerType: NonNullable<Listing["messengerType"]>;
    messengerHandle: string;
    note: string;
    status: "active" | "inactive";
    imageFile?: File | null;
    imageFiles?: File[];
  },
): Promise<Listing> {
  const normalizedPriceUsd = Number(
    priceToUsd(input.inputPriceValue, input.inputCurrency, input.fxRate).toFixed(2),
  );
  const approxPriceKrw = Math.round(
    priceToKrw(input.inputPriceValue, input.inputCurrency, input.fxRate),
  );
  const now = new Date().toISOString();
  let nextListing: Listing = {
    ...listing,
    inputPriceValue: input.inputPriceValue,
    inputCurrency: input.inputCurrency,
    fxRateAtEntry: input.fxRate,
    normalizedPriceUsd,
    approxPriceKrw,
    quantity: input.quantity,
    condition: input.condition.trim(),
    region: input.region.trim(),
    messengerType: input.messengerType,
    messengerHandle: normalizeMessengerHandle(input.messengerType, input.messengerHandle),
    telegramId:
      input.messengerType === "telegram" ? normalizeTelegramId(input.messengerHandle) : "",
    note: input.note.trim(),
    status: input.status,
    updatedAt: now,
  };

  const imageFiles = [...(input.imageFiles ?? []), input.imageFile].filter(
    (file): file is File => Boolean(file),
  );

  if (imageFiles.length && !listing.id.startsWith("local-")) {
    try {
      const imageMetadata = await uploadListingOriginalImages(listing.id, imageFiles);
      await saveListingImageMetadata(listing.id, {
        ...imageMetadata,
        imageUrl: getListingPreviewImage(
          {
            ...nextListing,
            ...imageMetadata,
          },
          "preview",
        ),
      });
      nextListing = {
        ...nextListing,
        ...imageMetadata,
        imageUrl: getListingPreviewImage(
          {
            ...nextListing,
            ...imageMetadata,
          },
          "preview",
        ),
      };
    } catch {
      nextListing = {
        ...nextListing,
        originalImages: listing.originalImages ?? [],
        thumbnailImages: listing.thumbnailImages ?? [],
        imageUrl: listing.imageUrl,
      };
    }
  }

  if (listing.id.startsWith("local-")) {
    clearLocalListings();
    return nextListing;
  }

  assertSupabaseConfigured();
  const { error } = await supabase!
    .from("listings")
    .update({
      price: nextListing.inputPriceValue,
      currency: nextListing.inputCurrency,
      fx_rate_at_entry: nextListing.fxRateAtEntry,
      normalized_price_usd: nextListing.normalizedPriceUsd,
      approx_price_krw: nextListing.approxPriceKrw,
      quantity: nextListing.quantity,
      condition: nextListing.condition,
      region: nextListing.region,
      note: nextListing.note,
      original_images: nextListing.originalImages ?? [],
      thumbnail_images: nextListing.thumbnailImages ?? [],
      image_url: nextListing.imageUrl,
      status: toDbStatus(nextListing.status),
      updated_at: now,
    })
    .eq("id", listing.id);
  if (error) throw toSupabaseError(error, "Unable to update listing.");

  const { error: contactError } = await supabase!
    .from("listing_contacts")
    .upsert(
      {
        listing_id: listing.id,
        user_id: listing.createdBy,
        messenger_type: nextListing.messengerType ?? "telegram",
        messenger_handle: nextListing.messengerHandle ?? "",
        telegram_id: nextListing.telegramId ?? "",
        updated_at: now,
      },
      { onConflict: "listing_id" },
    );
  if (contactError) throw toSupabaseError(contactError, "Unable to update listing contact.");
  clearLocalListings();
  return nextListing;
}

export async function deleteListing(listingId: string): Promise<void> {
  if (listingId.startsWith("local-")) {
    clearLocalListings();
    return;
  }

  assertSupabaseConfigured();
  const { error } = await supabase!.from("listings").delete().eq("id", listingId);
  if (error) throw toSupabaseError(error, "Unable to delete listing.");
  await appendAuditLog({
    action: "listing.deleted",
    targetType: "listing",
    targetId: listingId,
  });
  clearLocalListings();
}
