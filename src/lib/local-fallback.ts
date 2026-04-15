"use client";

import type { HomepageBanner } from "@/lib/types";

const LOCAL_BOTTLES_KEYS = ["caskfolio.local.bottles", "caskindex.local.bottles"] as const;
const LOCAL_LISTINGS_KEYS = ["caskfolio.local.listings", "caskindex.local.listings"] as const;
const LOCAL_HOMEPAGE_BANNERS_KEYS = [
  "caskfolio.local.homepageBanners",
  "caskindex.local.homepageBanners",
] as const;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJsonArray<T>(keys: readonly string[]): T[] {
  if (!canUseStorage()) return [];

  try {
    for (const key of keys) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (key !== keys[0]) {
          window.localStorage.setItem(keys[0], JSON.stringify(parsed));
        }
        return parsed as T[];
      }
    }
    return [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(keys: readonly string[], values: T[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(keys[0], JSON.stringify(values));
}

function readJsonObject<T>(key: string): T | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJsonObject<T>(keys: readonly string[], value: T | null): void {
  if (!canUseStorage()) return;
  if (value === null) {
    for (const key of keys) {
      window.localStorage.removeItem(key);
    }
    return;
  }
  window.localStorage.setItem(keys[0], JSON.stringify(value));
}

export function clearLocalBottles(): void {
  writeJsonArray(LOCAL_BOTTLES_KEYS, []);
}

export function clearLocalListings(): void {
  writeJsonArray(LOCAL_LISTINGS_KEYS, []);
}

export function clearLocalFallbackData(): void {
  clearLocalBottles();
  clearLocalListings();
}

export function getLocalHomepageBanners(): HomepageBanner[] {
  return readJsonArray<HomepageBanner>(LOCAL_HOMEPAGE_BANNERS_KEYS);
}

export function saveLocalHomepageBanners<T>(banners: T[]): void {
  writeJsonArray(LOCAL_HOMEPAGE_BANNERS_KEYS, banners);
}

export function clearLocalHomepageBanners(): void {
  writeJsonObject(LOCAL_HOMEPAGE_BANNERS_KEYS, null);
}
