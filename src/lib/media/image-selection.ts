import type { Bottle, Listing } from "@/lib/types";

export const DEFAULT_REGISTER_BOTTLE_IMAGE = "/register-default-bottle.png";

export type ImageSurface =
  | "market-card"
  | "listing-card"
  | "mypage-card"
  | "detail-archive-card"
  | "detail-related-card"
  | "detail-hero"
  | "listing-original";

export const IMAGE_SURFACE_RULES: Record<
  ImageSurface,
  {
    listingVariant: "card" | "preview" | "original";
    description: string;
  }
> = {
  "market-card": {
    listingVariant: "card",
    description: "Homepage and search cards always use the lightweight card thumbnail.",
  },
  "listing-card": {
    listingVariant: "card",
    description: "Listing cards use the smallest thumbnail to minimize transfer cost.",
  },
  "mypage-card": {
    listingVariant: "card",
    description: "My Page collection cards use the lightweight card thumbnail.",
  },
  "detail-archive-card": {
    listingVariant: "card",
    description: "Bottle archive cards stay on card thumbnails for consistency and lower data use.",
  },
  "detail-related-card": {
    listingVariant: "card",
    description: "Related bottle cards use the lightweight card thumbnail.",
  },
  "detail-hero": {
    listingVariant: "preview",
    description: "Bottle detail hero may use the preview variant for extra clarity.",
  },
  "listing-original": {
    listingVariant: "original",
    description: "Original listing uploads are reserved for detail-oriented views only.",
  },
};

export function isDefaultRegisterBottleImage(imageUrl?: string | null): boolean {
  return Boolean(imageUrl && imageUrl.includes(DEFAULT_REGISTER_BOTTLE_IMAGE));
}

export function getBottleCardImage(
  bottle?: Pick<Bottle, "masterPreviewImageUrl" | "masterImageUrl" | "imageUrl"> | null,
): string {
  return (
    bottle?.masterPreviewImageUrl ||
    bottle?.masterImageUrl ||
    bottle?.imageUrl ||
    DEFAULT_REGISTER_BOTTLE_IMAGE
  );
}

export function getBottlePreviewImage(
  bottle?: Pick<Bottle, "masterPreviewImageUrl" | "masterImageUrl" | "imageUrl"> | null,
): string {
  return getBottleCardImage(bottle);
}

function findThumbnailVariant(
  listing: Pick<Listing, "thumbnailImages" | "originalImages" | "imageUrl">,
  variant: "card" | "preview",
): string {
  const thumbnails = listing.thumbnailImages ?? [];
  const matchedThumbnail = thumbnails.find((url) => url.includes(`/thumb/${variant}-`));
  const listingImageUrl =
    listing.imageUrl && !isDefaultRegisterBottleImage(listing.imageUrl) ? listing.imageUrl : "";

  return (
    matchedThumbnail ||
    thumbnails[0] ||
    listing.originalImages?.[0] ||
    listingImageUrl
  );
}

export function getListingPreviewImage(
  listing: Pick<Listing, "thumbnailImages" | "originalImages" | "imageUrl">,
  variant: "card" | "preview" = "card",
): string {
  return findThumbnailVariant(listing, variant);
}

export function hasListingUploadedImage(
  listing?: Pick<Listing, "thumbnailImages" | "originalImages" | "imageUrl"> | null,
): boolean {
  if (!listing) return false;

  const thumbnailImages = listing.thumbnailImages ?? [];
  const originalImages = listing.originalImages ?? [];

  return Boolean(thumbnailImages.length || originalImages.length);
}

export function getBestBottleThumbnail(
  listing?: Pick<Listing, "thumbnailImages" | "originalImages" | "imageUrl"> | null,
  bottle?: Pick<Bottle, "masterPreviewImageUrl" | "masterImageUrl" | "imageUrl"> | null,
  variant: "card" | "preview" = "card",
): string {
  return (listing ? getListingPreviewImage(listing, variant) : "") || getBottleCardImage(bottle);
}

export function getListingOriginalImage(
  listing: Pick<Listing, "originalImages" | "imageUrl">,
): string {
  return listing.originalImages?.[0] || listing.imageUrl || DEFAULT_REGISTER_BOTTLE_IMAGE;
}

function getListingVariantForSurface(surface: ImageSurface): "card" | "preview" | "original" {
  return IMAGE_SURFACE_RULES[surface].listingVariant;
}

export function getBottleImageForSurface(
  bottle: Pick<Bottle, "masterPreviewImageUrl" | "masterImageUrl" | "imageUrl"> | null | undefined,
  surface: Exclude<ImageSurface, "listing-original">,
): string {
  if (surface === "detail-hero") {
    return getBottlePreviewImage(bottle);
  }

  return getBottleCardImage(bottle);
}

export function getListingImageForSurface(
  listing: Pick<Listing, "thumbnailImages" | "originalImages" | "imageUrl"> | null | undefined,
  bottle:
    | Pick<Bottle, "masterPreviewImageUrl" | "masterImageUrl" | "imageUrl">
    | null
    | undefined,
  surface: ImageSurface,
): string {
  if (surface === "listing-original") {
    return listing ? getListingOriginalImage(listing) : DEFAULT_REGISTER_BOTTLE_IMAGE;
  }

  const variant = getListingVariantForSurface(surface) as "card" | "preview";
  const listingImage = listing ? getListingPreviewImage(listing, variant) : "";
  return listingImage || getBottleImageForSurface(bottle, surface);
}
