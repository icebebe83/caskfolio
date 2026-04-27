"use client";

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { resolveNewsImageUrl } from "@/lib/news-utils";

export type NewsEntry = {
  id: string;
  title: string;
  summary: string;
  source: string;
  date?: string;
  url?: string;
  link?: string;
  imageUrl?: string;
  type?: "article" | "video";
  priority?: "high" | "medium" | "low";
};

export type NewsPageResult = {
  entries: NewsEntry[];
  total: number;
};

export const NEWS_PAGE_SIZE = 16;

function mapNewsRow(row: Record<string, unknown>): NewsEntry {
  const url = String(row.url ?? "");
  return {
    id: String(row.id ?? url),
    title: String(row.title ?? ""),
    summary: String(row.summary ?? ""),
    source: String(row.source ?? ""),
    date: String(row.published_at ?? row.created_at ?? ""),
    url,
    link: url,
    imageUrl: resolveNewsImageUrl(url, String(row.image_url ?? "")),
    type:
      row.type === "video" ||
      /youtube\.com\/watch|youtu\.be\//i.test(url) ||
      /The Mash and Drum|SLB Drinks/i.test(String(row.source ?? ""))
        ? "video"
        : "article",
    priority:
      row.priority === "high" || row.priority === "medium" || row.priority === "low"
        ? row.priority
        : "low",
  };
}

function sortCurated(entries: NewsEntry[]): NewsEntry[] {
  const rank = { high: 3, medium: 2, low: 1 };

  return [...entries].sort((left, right) => {
    const dateDelta =
      new Date(right.date ?? 0).getTime() - new Date(left.date ?? 0).getTime();
    if (dateDelta !== 0) return dateDelta;

    const typeDelta = (left.type === "video" ? 1 : 0) - (right.type === "video" ? 1 : 0);
    if (typeDelta !== 0) return typeDelta;

    return rank[right.priority ?? "low"] - rank[left.priority ?? "low"];
  });
}

export async function fetchNewsEntries(page = 1, pageSize = NEWS_PAGE_SIZE): Promise<NewsPageResult> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  if (isSupabaseConfigured && supabase) {
    const { data, error, count } = await supabase
      .from("news")
      .select("*", { count: "exact" })
      .order("published_at", { ascending: false })
      .range(from, to);

    if (!error) {
      return {
        entries: sortCurated((data ?? []).map((row) => mapNewsRow(row))),
        total: count ?? data?.length ?? 0,
      };
    }
  }

  const fallbackUrl =
    typeof window !== "undefined"
      ? "/news.json"
      : "http://127.0.0.1:3008/news.json";

  const response = await fetch(fallbackUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load news.");
  }

  const data = (await response.json()) as NewsEntry[];
  const entries = Array.isArray(data) ? sortCurated(data) : [];
  return {
    entries: entries.slice(from, to + 1),
    total: entries.length,
  };
}
