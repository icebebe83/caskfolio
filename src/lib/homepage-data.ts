import "server-only";

import { buildBottleEntries } from "@/lib/bottle-market";
import { bottleSearchText, toDate } from "@/lib/format";
import { DEFAULT_REGISTER_BOTTLE_IMAGE } from "@/lib/media/image-selection";
import type {
  Bottle,
  Listing,
  ListingStatus,
  SpiritCategory,
} from "@/lib/types";

const MARKET_REVALIDATE_SECONDS = 60;
const BANNER_REVALIDATE_SECONDS = 300;

const MARKET_SELECT = [
  "id",
  "bottle_id",
  "bottle_name",
  "category",
  "normalized_price_usd",
  "status",
  "thumbnail_images",
  "image_url",
  "created_at",
  "updated_at",
  `bottle:bottles(${[
    "id",
    "category",
    "name",
    "brand",
    "line",
    "batch",
    "age_statement",
    "abv",
    "volume_ml",
    "aliases",
    "hot_bottle",
    "master_image_url",
    "master_preview_image_url",
    "image_url",
    "created_at",
    "updated_at",
  ].join(",")})`,
].join(",");

const BANNER_SELECT = [
  "id",
  "slot_key",
  "label",
  "type",
  "image_url",
  "headline",
  "subcopy",
  "is_active",
  "display_order",
  "created_at",
  "updated_at",
].join(",");

type Row = Record<string, unknown>;

export type HomepageLatestEntry = {
  id: string;
  marketEntryId: string;
  category: SpiritCategory;
};

export type HomepageMarketEntry = {
  id: string;
  href: string;
  imageUrl: string;
  name: string;
  category: SpiritCategory;
  searchText: string;
  priceUsd: number;
  listingCount: number;
  latestAt: number;
  hotBottle: boolean;
};

export type HomepageHeroBanner = {
  id: string;
  imageUrl: string;
  headline: string;
  subcopy: string;
  displayOrder: number;
};

export type HomepageData = {
  marketEntries: HomepageMarketEntry[];
  latestEntries: HomepageLatestEntry[];
  heroBanners: HomepageHeroBanner[];
};

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item))
    : [];
}

function toCategory(value: unknown): SpiritCategory {
  switch (value) {
    case "Bourbon":
    case "Whisky":
    case "Etc":
    case "Rum":
    case "Tequila":
    case "Sake":
    case "Other spirits":
      return value;
    default:
      return "Whisky";
  }
}

function toStatus(value: unknown): ListingStatus {
  return value === "active" ? "active" : "inactive";
}

function mapHomepageBottle(row: Row): Bottle {
  const previewImage =
    String(
      row.master_preview_image_url ??
        row.master_image_url ??
        row.image_url ??
        "",
    ) ||
    DEFAULT_REGISTER_BOTTLE_IMAGE;

  return {
    id: String(row.id ?? ""),
    category: toCategory(row.category),
    name: String(row.name ?? ""),
    brand: String(row.brand ?? ""),
    line: String(row.line ?? ""),
    batch: String(row.batch ?? ""),
    ageStatement: String(row.age_statement ?? ""),
    abv: toNumber(row.abv),
    volumeMl: toNumber(row.volume_ml, 750),
    aliases: toStringArray(row.aliases),
    hotBottle: Boolean(row.hot_bottle),
    masterImageUrl: String(row.master_image_url ?? previewImage),
    masterPreviewImageUrl: previewImage,
    imageUrl: previewImage,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
  };
}

function mapHomepageListing(row: Row, bottle: Bottle): Listing {
  const thumbnails = toStringArray(row.thumbnail_images);
  const listingImage = String(row.image_url ?? "");

  return {
    id: String(row.id ?? ""),
    bottleId: String(row.bottle_id ?? bottle.id),
    bottleName: String(row.bottle_name ?? bottle.name),
    category: toCategory(row.category ?? bottle.category),
    inputPriceValue: 0,
    inputCurrency: "USD",
    fxRateAtEntry: 0,
    normalizedPriceUsd: toNumber(row.normalized_price_usd),
    approxPriceKrw: 0,
    quantity: 1,
    condition: "",
    region: "",
    note: "",
    originalImages: listingImage ? [listingImage] : [],
    thumbnailImages: thumbnails,
    imageUrl:
      thumbnails[0] ||
      listingImage ||
      bottle.masterPreviewImageUrl ||
      bottle.imageUrl,
    status: toStatus(row.status),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
    createdBy: "",
  };
}

function mapHomepageBanner(
  row: Row,
  supabaseHost: string,
): HomepageHeroBanner {
  return {
    id: String(row.id ?? ""),
    imageUrl: optimizeHomepageImage(
      String(row.image_url ?? ""),
      1600,
      78,
      supabaseHost,
    ),
    headline: String(row.headline ?? ""),
    subcopy: String(row.subcopy ?? ""),
    displayOrder: toNumber(row.display_order),
  };
}

const NETLIFY_REMOTE_IMAGE_HOSTS = new Set([
  "d1e2y5wc27crnp.cloudfront.net",
  "whiskyadvocate.com",
  "www.whiskyadvocate.com",
  "woodencork.com",
  "www.woodencork.com",
]);

function optimizeHomepageImage(
  source: string,
  width: number,
  quality: number,
  supabaseHost: string,
): string {
  if (!source || process.env.NETLIFY !== "true") return source;

  let isAllowed = source.startsWith("/");
  if (!isAllowed) {
    try {
      const sourceUrl = new URL(source);
      isAllowed =
        sourceUrl.protocol === "https:" &&
        (sourceUrl.hostname === supabaseHost ||
          NETLIFY_REMOTE_IMAGE_HOSTS.has(sourceUrl.hostname));
    } catch {
      return source;
    }
  }

  if (!isAllowed || source.startsWith("/.netlify/images")) return source;

  const params = new URLSearchParams({
    url: source,
    w: String(width),
    q: String(quality),
  });
  return `/.netlify/images?${params.toString()}`;
}

function supabaseConfig(): { anonKey: string; url: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!url || !anonKey || url.includes("...") || anonKey.includes("...")) {
    throw new Error("Homepage data requires the Supabase public URL and anonymous key.");
  }

  return { anonKey, url };
}

async function fetchRows(
  resourceUrl: URL,
  anonKey: string,
  revalidate: number,
): Promise<Row[]> {
  const response = await fetch(resourceUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    next: { revalidate },
  });

  if (!response.ok) {
    throw new Error(`Homepage data request failed with status ${response.status}.`);
  }

  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error("Homepage data response was not an array.");
  }

  return rows.filter((row): row is Row => Boolean(row) && typeof row === "object");
}

export async function fetchHomepageData(): Promise<HomepageData> {
  const { anonKey, url } = supabaseConfig();
  const supabaseHost = new URL(url).hostname;
  const marketUrl = new URL("/rest/v1/public_listings", url);
  marketUrl.searchParams.set("select", MARKET_SELECT);
  marketUrl.searchParams.set("order", "created_at.desc,id.desc");
  marketUrl.searchParams.set("limit", "200");

  const bannerUrl = new URL("/rest/v1/content_slots", url);
  bannerUrl.searchParams.set("select", BANNER_SELECT);
  bannerUrl.searchParams.set("slot_key", "like.homepage_banner_%");
  bannerUrl.searchParams.set("is_active", "eq.true");
  bannerUrl.searchParams.set("order", "display_order.asc,updated_at.desc");
  bannerUrl.searchParams.set("limit", "10");

  const [marketRows, bannerRows] = await Promise.all([
    fetchRows(marketUrl, anonKey, MARKET_REVALIDATE_SECONDS),
    fetchRows(bannerUrl, anonKey, BANNER_REVALIDATE_SECONDS).catch((error) => {
      console.warn(
        "Homepage banners are unavailable; rendering the default hero.",
        error instanceof Error ? error.message : error,
      );
      return [];
    }),
  ]);

  const bottlesById = new Map<string, Bottle>();
  const listings: Listing[] = [];

  marketRows.forEach((row) => {
    const nestedBottle = row.bottle;
    if (!nestedBottle || typeof nestedBottle !== "object" || Array.isArray(nestedBottle)) {
      return;
    }

    const bottle = mapHomepageBottle(nestedBottle as Row);
    if (!bottle.id || !bottle.name) return;

    bottlesById.set(bottle.id, bottle);
    listings.push(mapHomepageListing(row, bottle));
  });

  const bottles = [...bottlesById.values()];
  const bottleEntries = buildBottleEntries(listings, bottles, {
    preferListingThumbnail: true,
    fallbackToDefaultImage: true,
  });
  const entryByBottleId = new Map<
    string,
    (typeof bottleEntries)[number]
  >();
  bottleEntries.forEach((entry) => {
    entry.bottleIds.forEach((bottleId) => entryByBottleId.set(bottleId, entry));
  });

  const latestEntries = [...listings]
    .sort(
      (left, right) =>
        (toDate(right.createdAt)?.getTime() ?? 0) -
          (toDate(left.createdAt)?.getTime() ?? 0) ||
        right.id.localeCompare(left.id),
    )
    .map((listing) => {
      const marketEntry = entryByBottleId.get(listing.bottleId);
      if (!marketEntry) return null;

      return {
        id: listing.id,
        marketEntryId: marketEntry.bottle.id,
        category: listing.category,
      } satisfies HomepageLatestEntry;
    })
    .filter((entry): entry is HomepageLatestEntry => Boolean(entry));

  return {
    marketEntries: bottleEntries.map((entry) => ({
      id: entry.bottle.id,
      href: `/bottle?id=${entry.bottle.id}`,
      imageUrl: optimizeHomepageImage(
        entry.imageUrl,
        560,
        74,
        supabaseHost,
      ),
      name: entry.bottle.name,
      category: entry.bottle.category,
      searchText: bottleSearchText(entry.bottle),
      priceUsd: entry.priceUsd,
      listingCount: entry.listingCount,
      latestAt: entry.latestAt,
      hotBottle: Boolean(entry.bottle.hotBottle),
    })),
    latestEntries,
    heroBanners: bannerRows.map((row) =>
      mapHomepageBanner(row, supabaseHost),
    ),
  };
}
