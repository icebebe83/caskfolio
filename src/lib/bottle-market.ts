import {
  DEFAULT_REGISTER_BOTTLE_IMAGE,
  getBottleImageForSurface,
  getListingImageForSurface,
  hasListingUploadedImage,
} from "@/lib/media/images";
import { getBottleBaseIdentityKey, getBottleBatchIdentityPart } from "@/lib/bottle-identity";
import { toDate } from "@/lib/format";
import type { Bottle, Listing } from "@/lib/types";

export type BottleMarketEntry = {
  bottle: Bottle;
  priceUsd: number;
  imageUrl: string;
  latestAt: number;
  listingCount: number;
};

export function buildBottleEntries(
  listings: Listing[],
  bottles: Bottle[],
  options?: {
    preferListingThumbnail?: boolean;
    fallbackToDefaultImage?: boolean;
  },
): BottleMarketEntry[] {
  const bottleMap = new Map(bottles.map((bottle) => [bottle.id, bottle]));
  const baseGroups = new Map<string, { listings: Listing[]; bottles: Map<string, Bottle> }>();

  listings.forEach((listing) => {
    const bottle = bottleMap.get(listing.bottleId);
    if (!bottle) return;

    const key = getBottleBaseIdentityKey(bottle) || listing.bottleId;
    const current = baseGroups.get(key) ?? { listings: [], bottles: new Map<string, Bottle>() };
    current.listings.push(listing);
    current.bottles.set(bottle.id, bottle);
    baseGroups.set(key, current);
  });

  const grouped = [...baseGroups.values()].flatMap((group) => {
    const nonBlankBatches = new Set([...group.bottles.values()].map(getBottleBatchIdentityPart).filter(Boolean));
    if (nonBlankBatches.size <= 1) {
      return [group];
    }

    const batchGroups = new Map<string, { listings: Listing[]; bottles: Map<string, Bottle> }>();
    group.listings.forEach((listing) => {
      const bottle = bottleMap.get(listing.bottleId);
      if (!bottle) return;

      const batchKey = getBottleBatchIdentityPart(bottle);
      const current = batchGroups.get(batchKey) ?? { listings: [], bottles: new Map<string, Bottle>() };
      current.listings.push(listing);
      current.bottles.set(bottle.id, bottle);
      batchGroups.set(batchKey, current);
    });

    return [...batchGroups.values()];
  });

  return grouped
    .map((group) => {
      const bottleListings = group.listings;
      const sortedListings = [...bottleListings].sort(
        (left, right) =>
          (toDate(right.createdAt)?.getTime() ?? 0) - (toDate(left.createdAt)?.getTime() ?? 0),
      );
      const listingCountByBottleId = sortedListings.reduce((counts, listing) => {
        counts.set(listing.bottleId, (counts.get(listing.bottleId) ?? 0) + 1);
        return counts;
      }, new Map<string, number>());
      const bottle =
        [...group.bottles.values()].sort((left, right) => {
          const countDiff =
            (listingCountByBottleId.get(right.id) ?? 0) - (listingCountByBottleId.get(left.id) ?? 0);
          if (countDiff) return countDiff;
          return (toDate(right.updatedAt)?.getTime() ?? 0) - (toDate(left.updatedAt)?.getTime() ?? 0);
        })[0] ?? null;
      if (!bottle) return null;

      const activeListings = sortedListings.filter((listing) => listing.status === "active");
      const priceSource = activeListings.length ? activeListings : sortedListings;
      const cheapestPrice = Math.min(...priceSource.map((listing) => listing.normalizedPriceUsd));
      const latestListing = sortedListings[0];
      const thumbnailSource = sortedListings.find((listing) => hasListingUploadedImage(listing));
      const thumbnailBottle = thumbnailSource
        ? bottleMap.get(thumbnailSource.bottleId) ?? bottle
        : bottle;
      const latestListingBottle = latestListing
        ? bottleMap.get(latestListing.bottleId) ?? bottle
        : bottle;
      const listingThumbnailImage =
        (thumbnailSource
          ? getListingImageForSurface(thumbnailSource, thumbnailBottle, "market-card")
          : "") ||
        (latestListing && hasListingUploadedImage(latestListing)
          ? getListingImageForSurface(latestListing, latestListingBottle, "market-card")
          : "");
      const bottleImage = getBottleImageForSurface(bottle, "market-card");
      const imageUrl = options?.preferListingThumbnail
        ? listingThumbnailImage || bottleImage || DEFAULT_REGISTER_BOTTLE_IMAGE
        : listingThumbnailImage || bottleImage || DEFAULT_REGISTER_BOTTLE_IMAGE;

      return {
        bottle,
        priceUsd: Number.isFinite(cheapestPrice) ? cheapestPrice : 0,
        imageUrl,
        latestAt: toDate(latestListing?.createdAt)?.getTime() ?? 0,
        listingCount: sortedListings.length,
      } satisfies BottleMarketEntry;
    })
    .filter((entry): entry is BottleMarketEntry => Boolean(entry))
    .sort((left, right) => right.latestAt - left.latestAt);
}
