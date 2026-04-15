"use client";

import { assertSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { Bottle, Listing } from "@/lib/types";

const CARD_THUMBNAIL_WIDTH = 400;
const PREVIEW_THUMBNAIL_WIDTH = 800;
const MASTER_IMAGE_WIDTH = 1400;
const MASTER_PREVIEW_WIDTH = 800;
const HERO_BANNER_WIDTH = 1600;
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "caskindex-images";
export const DEFAULT_REGISTER_BOTTLE_IMAGE = "/register-default-bottle.png";
const IMAGE_OPERATION_TIMEOUT_MS = 15000;

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

function sanitizeFileName(fileName: string): string {
  return fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-");
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function createStorageSafeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function assertBrowserImageApis(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Image processing is only available in the browser.");
  }
}

function withImageTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  assertBrowserImageApis();

  return new Promise((resolve, reject) => {
    const url = window.URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      window.URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      window.URL.revokeObjectURL(url);
      reject(new Error("Unable to read image."));
    };
    image.src = url;
  });
}

async function createJpegVariant(file: File, targetWidth: number): Promise<Blob> {
  const image = await loadImage(file);
  const scale = Math.min(1, targetWidth / Math.max(image.width, 1));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not available for thumbnail generation.");
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to generate thumbnail."));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      0.82,
    );
  });
}

async function uploadBlob(
  path: string,
  blob: Blob,
  contentType: string,
  options?: { upsert?: boolean },
): Promise<string> {
  assertSupabaseConfigured();
  const {
    data: { session },
  } = await withImageTimeout(
    supabase!.auth.getSession(),
    5000,
    "Image auth session lookup timed out.",
  );

  if (!session) {
    throw new Error("You must be signed in before uploading images.");
  }

  const { error } = await withImageTimeout(
    supabase!.storage.from(STORAGE_BUCKET).upload(path, blob, {
      contentType,
      upsert: options?.upsert ?? false,
      cacheControl: "31536000",
    }),
    IMAGE_OPERATION_TIMEOUT_MS,
    "Image upload timed out.",
  );
  if (error) {
    throw new Error(error.message || "Image upload failed.");
  }

  const { data } = supabase!.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error("Unable to generate image URL.");
  }

  return data.publicUrl;
}

async function uploadFile(path: string, file: File): Promise<string> {
  return uploadBlob(path, file, file.type || "image/jpeg");
}

export async function uploadBottleMasterImage(
  bottleId: string,
  file: File,
): Promise<{ masterImageUrl: string; masterPreviewImageUrl: string }> {
  const [masterBlob, previewBlob] = await Promise.all([
    createJpegVariant(file, MASTER_IMAGE_WIDTH),
    createJpegVariant(file, MASTER_PREVIEW_WIDTH),
  ]);
  const [masterImageUrl, masterPreviewImageUrl] = await Promise.all([
    uploadBlob(`bottles/${bottleId}/master/main.jpg`, masterBlob, "image/jpeg", { upsert: true }),
    uploadBlob(`bottles/${bottleId}/master/preview.jpg`, previewBlob, "image/jpeg", {
      upsert: true,
    }),
  ]);

  return { masterImageUrl, masterPreviewImageUrl };
}

export async function uploadHomepageHeroImage(
  slotKey: string,
  file: File,
): Promise<string> {
  const heroBlob = await createJpegVariant(file, HERO_BANNER_WIDTH);
  return uploadBlob(`site-content/${slotKey}/hero.jpg`, heroBlob, "image/jpeg", {
    upsert: true,
  });
}

export async function uploadListingOriginalImages(
  listingId: string,
  files: File[],
): Promise<{ originalImages: string[]; thumbnailImages: string[] }> {
  const originalImages: string[] = [];
  const thumbnailImages: string[] = [];

  for (const file of files) {
    const safeFileName = sanitizeFileName(file.name || `image-${Date.now()}.jpg`);
    const uniqueId = createStorageSafeId();
    const fileBaseName = `${stripExtension(safeFileName) || "image"}-${uniqueId}`;
    const originalFileName = safeFileName.includes(".")
      ? safeFileName.replace(stripExtension(safeFileName), fileBaseName)
      : `${fileBaseName}.jpg`;
    const originalImageUrl = await uploadFile(
      `listings/${listingId}/original/${originalFileName}`,
      file,
    );
    const [cardBlob, previewBlob] = await Promise.all([
      createJpegVariant(file, CARD_THUMBNAIL_WIDTH),
      createJpegVariant(file, PREVIEW_THUMBNAIL_WIDTH),
    ]);
    const [cardThumbnailUrl, previewThumbnailUrl] = await Promise.all([
      uploadBlob(`listings/${listingId}/thumb/card-${fileBaseName}.jpg`, cardBlob, "image/jpeg"),
      uploadBlob(
        `listings/${listingId}/thumb/preview-${fileBaseName}.jpg`,
        previewBlob,
        "image/jpeg",
      ),
    ]);

    originalImages.push(originalImageUrl);
    thumbnailImages.push(cardThumbnailUrl, previewThumbnailUrl);
  }

  return { originalImages, thumbnailImages };
}

export async function saveListingImageMetadata(
  listingId: string,
  imageMetadata: {
    originalImages: string[];
    thumbnailImages: string[];
    imageUrl?: string;
  },
): Promise<void> {
  assertSupabaseConfigured();
  const response = await withImageTimeout<{ error: { message?: string } | null }>(
    Promise.resolve(
      supabase!
        .from("listings")
        .update({
          original_images: imageMetadata.originalImages,
          thumbnail_images: imageMetadata.thumbnailImages,
          image_url: imageMetadata.imageUrl ?? imageMetadata.thumbnailImages[0] ?? "",
          updated_at: new Date().toISOString(),
        })
        .eq("id", listingId) as never,
    ),
    IMAGE_OPERATION_TIMEOUT_MS,
    "Listing image metadata save timed out.",
  );
  const { error } = response;

  if (error) {
    throw new Error(error.message);
  }
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
