import type { MessengerType, SpiritCategory } from "@/lib/types";

export const CATEGORIES: SpiritCategory[] = [
  "Whisky",
  "Bourbon",
  "Tequila",
  "Rum",
  "Etc",
];

export const ETC_CATEGORIES: SpiritCategory[] = [
  "Etc",
  "Rum",
  "Tequila",
  "Sake",
  "Other spirits",
];

export const LISTING_CONDITIONS = [
  "New",
  "Sealed",
  "No Box",
  "Label Wear",
  "Damaged Box",
];

export const BOTTLE_LABEL_VERSION_OPTIONS = ["", "New Label", "Old Label"] as const;

export const BOTTLE_VOLUME_OPTIONS = [375, 700, 750, 1000, 1500, 1750];

export const LISTING_STATUSES = ["active", "inactive"] as const;

export const REPORT_REASONS = [
  "Suspicious pricing",
  "Fake bottle",
  "Duplicate listing",
  "Broken messenger link",
];

export const DEFAULT_FX_PAIR = "USD/KRW";

export const MESSENGER_OPTIONS: Array<{ label: string; value: MessengerType }> = [
  { label: "Telegram", value: "telegram" },
  { label: "Signal", value: "signal" },
  { label: "WhatsApp", value: "whatsapp" },
  { label: "Line", value: "line" },
];

export function matchesCategoryFilter(category: SpiritCategory, filter: string): boolean {
  if (filter === "All") return true;
  if (filter === "Etc") return ETC_CATEGORIES.includes(category);
  return category === filter;
}

export const NEWS_FEEDS = [
  "https://thewhiskeywash.com/feed/",
  "https://www.whiskyadvocate.com/feed/",
  "https://www.thespiritsbusiness.com/feed/",
  "https://www.americanwhiskeymag.com/feed/",
  "https://scotchwhisky.com/feed/",
  "https://whiskeyreviewer.com/feed/",
  "https://www.whiskynotes.be/feed/",
  "https://www.drinkhacker.com/feed/",
  "https://www.thewhiskyexchange.com/blog/feed/",
] as const;
