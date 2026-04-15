import { formatDate } from "@/lib/format";
import type {
  AdminDashboardMetrics,
  AdminProfileSummary,
  AuditLogEntry,
  Bottle,
  BottleReferencePrice,
  HomepageBanner,
  SpiritCategory,
} from "@/lib/types";

export type AdminSection =
  | "Dashboard"
  | "Listings"
  | "News"
  | "Bottles"
  | "Hero / Banner"
  | "Reports"
  | "Users"
  | "Subscription"
  | "Settings";

export type AdminServerStatus = {
  referenceSync: {
    running: boolean;
    status: "idle" | "running" | "success" | "failure";
    lastStartedAt?: string | null;
    lastFinishedAt?: string | null;
    lastSuccessAt?: string | null;
    lastError?: string | null;
    message?: string;
    matchedCount?: number | null;
    failedCount?: number | null;
  };
  newsImport: {
    running: boolean;
    status: "idle" | "running" | "success" | "failure";
    lastStartedAt?: string | null;
    lastFinishedAt?: string | null;
    lastSuccessAt?: string | null;
    lastError?: string | null;
    message?: string;
  };
  settings: {
    googleOAuth: {
      configured: boolean;
      label: string;
    };
    rssSources: string[];
    referenceSyncSchedule: string;
    lastSyncTime?: string | null;
    newsIngestion: {
      available: boolean;
      count: number;
      lastUpdatedAt?: string | null;
      label: string;
    };
  };
};

export type AdminBottleDraft = {
  name: string;
  brand: string;
  category: SpiritCategory;
  batch: string;
  abv: string;
  volumeMl: string;
  aliases: string;
  hotBottle: boolean;
};

export type AdminReferenceDraft = {
  source: string;
  referencePriceUsd: string;
  sourceUrl: string;
  updatedAt: string;
};

export type AdminBannerDraft = {
  id: string;
  label: string;
  headline: string;
  subcopy: string;
  isActive: boolean;
  type: string;
  imageUrl: string;
  displayOrder: number;
};

export type AdminManualNewsDraft = {
  title: string;
  summary: string;
  source: string;
  url: string;
  imageUrl: string;
  priority: "high" | "medium" | "low";
};

export const ADMIN_NAV_ITEMS: readonly AdminSection[] = [
  "Dashboard",
  "Listings",
  "News",
  "Bottles",
  "Hero / Banner",
  "Reports",
  "Users",
  "Subscription",
  "Settings",
] as const;

export const EMPTY_METRICS: AdminDashboardMetrics = {
  todayVisitors: 0,
  totalVisitors: 0,
  todayListings: 0,
  totalListings: 0,
  activeListings: 0,
  openReports: 0,
};

export const EMPTY_SERVER_STATUS: AdminServerStatus = {
  referenceSync: {
    running: false,
    status: "idle",
    lastStartedAt: null,
    lastFinishedAt: null,
    lastSuccessAt: null,
    lastError: null,
    message: "",
    matchedCount: null,
    failedCount: null,
  },
  newsImport: {
    running: false,
    status: "idle",
    lastStartedAt: null,
    lastFinishedAt: null,
    lastSuccessAt: null,
    lastError: null,
    message: "",
  },
  settings: {
    googleOAuth: {
      configured: false,
      label: "Unknown",
    },
    rssSources: [],
    referenceSyncSchedule: "Weekly",
    lastSyncTime: null,
    newsIngestion: {
      available: false,
      count: 0,
      lastUpdatedAt: null,
      label: "Unknown",
    },
  },
};

export function createEmptyBottleDraft(): AdminBottleDraft {
  return {
    name: "",
    brand: "",
    category: "Whisky",
    batch: "",
    abv: "",
    volumeMl: "750",
    aliases: "",
    hotBottle: false,
  };
}

export function createBottleDraft(bottle: Bottle): AdminBottleDraft {
  return {
    name: bottle.name,
    brand: bottle.brand,
    category: bottle.category,
    batch: bottle.batch,
    abv: String(bottle.abv || ""),
    volumeMl: String(bottle.volumeMl || 750),
    aliases: bottle.aliases.join(", "),
    hotBottle: Boolean(bottle.hotBottle),
  };
}

export function createEmptyReferenceDraft(): AdminReferenceDraft {
  return {
    source: "",
    referencePriceUsd: "",
    sourceUrl: "",
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}

export function createReferenceDraft(referencePrice: BottleReferencePrice): AdminReferenceDraft {
  const updatedAt =
    typeof referencePrice.updatedAt === "string"
      ? referencePrice.updatedAt
      : referencePrice.updatedAt instanceof Date
        ? referencePrice.updatedAt.toISOString()
        : typeof referencePrice.updatedAt?.toDate === "function"
          ? referencePrice.updatedAt.toDate().toISOString()
          : new Date().toISOString();

  return {
    source: referencePrice.source,
    referencePriceUsd: String(referencePrice.referencePriceUsd || ""),
    sourceUrl: referencePrice.sourceUrl || "",
    updatedAt: updatedAt.slice(0, 10),
  };
}

export function createEmptyBannerDraft(order = 0): AdminBannerDraft {
  return {
    id: "",
    label: "",
    headline: "",
    subcopy: "",
    isActive: true,
    type: "hero",
    imageUrl: "",
    displayOrder: order,
  };
}

export function createBannerDraft(banner: HomepageBanner): AdminBannerDraft {
  return {
    id: banner.id,
    label: banner.label,
    headline: banner.headline,
    subcopy: banner.subcopy,
    isActive: banner.isActive,
    type: banner.type,
    imageUrl: banner.imageUrl,
    displayOrder: banner.displayOrder,
  };
}

export function createEmptyManualNewsDraft(): AdminManualNewsDraft {
  return {
    title: "",
    summary: "",
    source: "Caskfolio",
    url: "",
    imageUrl: "",
    priority: "medium",
  };
}

export function getBannerListLabel(banner: HomepageBanner, index: number): string {
  return banner.label || banner.headline || `Banner ${index + 1}`;
}

export function getAdminUserLabel(profile: AdminProfileSummary): string {
  return profile.email || profile.id;
}

export function getAdminUserMeta(profile: AdminProfileSummary): string {
  return `${profile.role} · ${formatDate(profile.createdAt)}`;
}

export function getAuditLogLabel(entry: AuditLogEntry): string {
  return entry.actorEmail || entry.actorUserId || "Unknown admin";
}
