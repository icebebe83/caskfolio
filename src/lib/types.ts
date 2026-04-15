export type SpiritCategory =
  | "Bourbon"
  | "Whisky"
  | "Etc"
  | "Rum"
  | "Tequila"
  | "Sake"
  | "Other spirits";
export type ListingCurrency = "USD" | "KRW";
export type ListingStatus = "active" | "inactive";
export type ReportStatus = "open" | "resolved";
export type MessengerType = "kakaotalk" | "telegram" | "signal" | "whatsapp" | "line";
export type AppDateValue = { toDate(): Date } | Date | string | null | undefined;
export type FirestoreDate = AppDateValue;

export interface AppUser {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
}

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  date: string;
  link: string;
}

export interface Bottle {
  id: string;
  category: SpiritCategory;
  name: string;
  brand: string;
  line: string;
  batch: string;
  ageStatement: string;
  abv: number;
  volumeMl: number;
  aliases: string[];
  hotBottle?: boolean;
  masterImageUrl?: string;
  masterPreviewImageUrl?: string;
  imageUrl: string;
  createdAt: AppDateValue;
  updatedAt: AppDateValue;
}

export interface Listing {
  id: string;
  bottleId: string;
  bottleName: string;
  category: SpiritCategory;
  inputPriceValue: number;
  inputCurrency: ListingCurrency;
  fxRateAtEntry: number;
  normalizedPriceUsd: number;
  approxPriceKrw: number;
  quantity: number;
  condition: string;
  region: string;
  messengerType?: MessengerType;
  messengerHandle?: string;
  telegramId?: string;
  note: string;
  originalImages?: string[];
  thumbnailImages?: string[];
  imageUrl: string;
  status: ListingStatus;
  createdAt: AppDateValue;
  updatedAt: AppDateValue;
  createdBy: string;
}

export interface FxRate {
  id?: string;
  pair: string;
  rate: number;
  updatedAt: AppDateValue;
  source: string;
}

export interface BottleReferencePrice {
  bottleId: string;
  source: string;
  referencePriceUsd: number;
  referencePrice6mAgo?: number | null;
  referenceChangePercent?: number | null;
  sourceUrl?: string;
  updatedAt: AppDateValue;
  confidenceScore?: number | null;
  matchedName?: string;
  matchedVolumeMl?: number | null;
}

export interface HomepageBanner {
  id: string;
  slotKey: string;
  label: string;
  type: string;
  imageUrl: string;
  headline: string;
  subcopy: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: AppDateValue;
  updatedAt: AppDateValue;
}

export interface Report {
  id: string;
  listingId: string;
  reason: string;
  note: string;
  createdBy: string;
  status: ReportStatus;
  createdAt: AppDateValue;
  updatedAt: AppDateValue;
}

export interface AdminUser {
  uid: string;
  email: string;
  role: "admin";
  createdAt: AppDateValue;
}

export interface AdminProfileSummary {
  id: string;
  email: string;
  createdAt: AppDateValue;
  role: "admin" | "user";
}

export interface AdminNewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  imageUrl: string;
  publishedAt: AppDateValue;
  createdAt: AppDateValue;
  priority: "high" | "medium" | "low";
  type: "article" | "video";
}

export interface AdminDashboardMetrics {
  todayVisitors: number;
  totalVisitors: number;
  todayListings: number;
  totalListings: number;
  activeListings: number;
  openReports: number;
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId?: string;
  details: Record<string, unknown>;
  createdAt: AppDateValue;
}

export interface ListingFilters {
  category: string;
  condition: string;
  region: string;
  status: string;
  sort: "latest" | "lowest";
  query: string;
}

export interface ListingFormInput {
  bottle: Bottle;
  inputPriceValue: number;
  inputCurrency: ListingCurrency;
  quantity: number;
  condition: string;
  region: string;
  messengerType: MessengerType;
  messengerHandle: string;
  note: string;
  imageFile?: File | null;
  imageFiles?: File[];
}
