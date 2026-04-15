import { ETC_CATEGORIES } from "@/lib/constants";
import type { AppDateValue, Bottle, Listing, MessengerType, SpiritCategory } from "@/lib/types";

export function toDate(value: AppDateValue): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  if (typeof value === "object" && "toDate" in value) {
    return value.toDate();
  }
  return null;
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatKrw(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatDate(value: AppDateValue): string {
  const date = toDate(value);
  if (!date) return "Pending";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatRelativeShort(value: AppDateValue): string {
  const date = toDate(value);
  if (!date) return "Pending";
  return new Intl.RelativeTimeFormat("en-US", { numeric: "auto" }).format(
    Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    "day",
  );
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function normalizeTelegramId(value: string): string {
  return value.trim().replace(/^@+/, "").replace(/\s+/g, "");
}

export function buildTelegramLink(telegramId: string): string {
  return `https://t.me/${normalizeTelegramId(telegramId)}`;
}

export function normalizeMessengerHandle(type: MessengerType, value: string): string {
  const trimmed = value.trim();

  if (type === "telegram") {
    return normalizeTelegramId(trimmed);
  }

  if (type === "whatsapp") {
    return trimmed.replace(/\s+/g, "");
  }

  return trimmed;
}

export function formatMessengerType(type: MessengerType): string {
  switch (type) {
    case "line":
      return "Line";
    case "kakaotalk":
      return "KakaoTalk";
    case "telegram":
      return "Telegram";
    case "signal":
      return "Signal";
    case "whatsapp":
      return "WhatsApp";
  }
}

export function formatListingStatus(status: Listing["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "inactive":
      return "Inactive";
  }
}

export function getStatusDotClass(status: Listing["status"]): string {
  return status === "active" ? "bg-emerald-500" : "bg-neutral-400";
}

export function buildMessengerLink(type: MessengerType, handle: string): string {
  const normalizedHandle = normalizeMessengerHandle(type, handle);

  if (!normalizedHandle) {
    return "";
  }

  switch (type) {
    case "telegram":
      return buildTelegramLink(normalizedHandle);
    case "whatsapp": {
      const digitsOnly = normalizedHandle.replace(/[^0-9]/g, "");
      return digitsOnly ? `https://wa.me/${digitsOnly}` : "";
    }
    case "signal":
      return `https://signal.me/#p/${encodeURIComponent(normalizedHandle)}`;
    case "line":
      return `https://line.me/R/ti/p/~${encodeURIComponent(normalizedHandle)}`;
    case "kakaotalk":
      return "";
  }
}

export function formatCategoryLabel(category: SpiritCategory): string {
  return ETC_CATEGORIES.includes(category) ? "Etc" : category;
}

export function bottleSearchText(bottle: Bottle): string {
  return [
    bottle.name,
    bottle.brand,
    bottle.line,
    bottle.batch,
    bottle.ageStatement,
    ...bottle.aliases,
  ]
    .join(" ")
    .toLowerCase();
}

export function listingSearchText(listing: Listing, bottle?: Bottle): string {
  return [
    listing.bottleName,
    listing.category,
    listing.condition,
    listing.region,
    bottle ? bottleSearchText(bottle) : "",
  ]
    .join(" ")
    .toLowerCase();
}

export function priceToUsd(
  value: number,
  currency: "USD" | "KRW",
  fxRate: number,
): number {
  if (currency === "USD") return value;
  return fxRate > 0 ? value / fxRate : 0;
}

export function priceToKrw(
  value: number,
  currency: "USD" | "KRW",
  fxRate: number,
): number {
  if (currency === "KRW") return value;
  return value * fxRate;
}
