import fs from "node:fs/promises";
import path from "node:path";
import { createNewsThumbnail, getNewsFallbackImage } from "./news-image-utils.mjs";

const FEEDS = [
  "https://thewhiskeywash.com/feed/",
  "https://www.whiskyadvocate.com/feed/",
  "https://www.thespiritsbusiness.com/feed/",
  "https://www.americanwhiskeymag.com/feed/",
  "https://scotchwhisky.com/feed/",
  "https://whiskeyreviewer.com/feed/",
  "https://www.whiskynotes.be/feed/",
  "https://www.drinkhacker.com/feed/",
  "https://www.thewhiskyexchange.com/blog/feed/",
];

const OUTPUT_PATH = path.join(process.cwd(), "public", "news.json");
const MAX_ITEMS = 18;

function decodeHtml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirst(block, tag) {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  return block.match(pattern)?.[1]?.trim() ?? "";
}

function summarize(text) {
  const clean = decodeHtml(text);
  if (clean.length <= 180) return clean;
  return `${clean.slice(0, 177).trimEnd()}...`;
}

function createFallbackImage() {
  return getNewsFallbackImage();
}

function normalizeSource(channelTitle, feedUrl) {
  const cleanTitle = decodeHtml(channelTitle);
  if (cleanTitle) return cleanTitle;
  return new URL(feedUrl).hostname.replace(/^www\./, "");
}

function parseFeed(xml, feedUrl) {
  const channelTitle = extractFirst(xml, "title");
  const source = normalizeSource(channelTitle, feedUrl);
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);

  return items
    .map((item) => {
      const title = decodeHtml(extractFirst(item, "title"));
      const link = decodeHtml(extractFirst(item, "link"));
      const rawDate = decodeHtml(extractFirst(item, "pubDate"));
      const description =
        extractFirst(item, "description") ||
        extractFirst(item, "content:encoded") ||
        extractFirst(item, "content");
      const imageUrl =
        decodeHtml(item.match(/<media:content[^>]*url="([^"]+)"/i)?.[1] || "") ||
        decodeHtml(item.match(/<media:thumbnail[^>]*url="([^"]+)"/i)?.[1] || "") ||
        decodeHtml(item.match(/<enclosure[^>]*url="([^"]+)"/i)?.[1] || "") ||
        decodeHtml(description.match(/<img[^>]+src="([^"]+)"/i)?.[1] || "");
      const date = new Date(rawDate);

      if (!title || !link || Number.isNaN(date.getTime())) {
        return null;
      }

      return {
        id: `${source}:${link}`,
        title,
        summary: summarize(description),
        source,
        date: date.toISOString(),
        link,
        imageUrl: imageUrl || createFallbackImage(),
      };
    })
    .filter(Boolean);
}

async function fetchFeed(feedUrl) {
  const response = await fetch(feedUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 CaskIndex News Fetcher",
      accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function main() {
  const collected = [];

  for (const feedUrl of FEEDS) {
    try {
      const xml = await fetchFeed(feedUrl);
      collected.push(...parseFeed(xml, feedUrl));
    } catch (error) {
      console.warn(`[news] skipped ${feedUrl}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  const deduped = [...new Map(collected.map((item) => [item.link, item])).values()]
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, MAX_ITEMS);

  const hydrated = [];

  for (const item of deduped) {
    hydrated.push({
      ...item,
      date: item.date,
      imageUrl: await createNewsThumbnail(item.imageUrl),
    });
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(hydrated, null, 2));
  console.log(`[news] wrote ${hydrated.length} articles to ${OUTPUT_PATH}`);
}

main().catch(async (error) => {
  console.error("[news] failed to generate feed:", error);
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, "[]\n");
  process.exitCode = 0;
});
