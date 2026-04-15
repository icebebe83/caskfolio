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

export async function fetchNewsEntries(): Promise<NewsEntry[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(18);

    if (!error && data?.length) {
      return sortCurated(data.map((row) => mapNewsRow(row)));
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
  return Array.isArray(data) ? sortCurated(data) : [];
}
