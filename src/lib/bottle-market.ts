import {
  DEFAULT_REGISTER_BOTTLE_IMAGE,
  getBottleImageForSurface,
  getListingImageForSurface,
  hasListingUploadedImage,
} from "@/lib/media/images";
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
  const grouped = new Map<string, Listing[]>();

  listings.forEach((listing) => {
    const current = grouped.get(listing.bottleId) ?? [];
    current.push(listing);
    grouped.set(listing.bottleId, current);
  });

  return [...grouped.entries()]
    .map(([bottleId, bottleListings]) => {
      const bottle = bottleMap.get(bottleId);
      if (!bottle) return null;

      const sortedListings = [...bottleListings].sort(
        (left, right) =>
          (toDate(right.createdAt)?.getTime() ?? 0) - (toDate(left.createdAt)?.getTime() ?? 0),
      );
      const activeListings = sortedListings.filter((listing) => listing.status === "active");
      const priceSource = activeListings.length ? activeListings : sortedListings;
      const cheapestPrice = Math.min(...priceSource.map((listing) => listing.normalizedPriceUsd));
      const latestListing = sortedListings[0];
      const thumbnailSource = sortedListings.find((listing) => hasListingUploadedImage(listing));
      const listingThumbnailImage =
        (thumbnailSource
          ? getListingImageForSurface(thumbnailSource, bottle, "market-card")
          : "") ||
        (latestListing && hasListingUploadedImage(latestListing)
          ? getListingImageForSurface(latestListing, bottle, "market-card")
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
