import { createClient } from "@supabase/supabase-js";

const SOURCES = [
  { type: "rss", source: "The Whiskey Wash", url: "https://thewhiskeywash.com/feed/" },
  { type: "index", source: "Whisky Advocate", url: "https://whiskyadvocate.com/Tag/news" },
  { type: "rss", source: "The Spirits Business", url: "https://www.thespiritsbusiness.com/feed/" },
  { type: "rss", source: "Drinkhacker", url: "https://www.drinkhacker.com/feed/" },
];
const YOUTUBE_SOURCES = [
  {
    type: "youtube",
    source: "The Mash and Drum",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC77mfUNd_pVJc0hh7yyjRkg",
  },
  {
    type: "youtube",
    source: "SLB Drinks",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UClFDjrx4rfeR4Dsi44ZzZMw",
  },
];

export const FALLBACK_IMAGE = "/news-fallback.png";
const DEFAULT_STORAGE_BUCKET = "caskindex-images";
const DEFAULT_FETCH_TIMEOUT_MS = 8_000;
const DEFAULT_TEXT_RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;
const DEFAULT_IMAGE_RESPONSE_LIMIT_BYTES = 6 * 1024 * 1024;
const DEFAULT_SOURCE_CONCURRENCY = 3;
const DEFAULT_ARTICLE_CONCURRENCY = 4;
const MAX_REDIRECTS = 3;
const ALLOWED_RASTER_CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
]);
const PRIORITY_RANK = { high: 3, medium: 2, low: 1 };
const ALLOWED_SOURCES = new Set([...SOURCES, ...YOUTUBE_SOURCES].map((item) => item.source));
const VIDEO_SOURCE_NAMES = new Set(YOUTUBE_SOURCES.map((item) => item.source));
const MAX_VIDEOS_PER_RUN = 2;

const EXCLUDE_PATTERNS = [
  /\bsubscribe\b/i,
  /\bsubscription\b/i,
  /\bmember(ship)?\b/i,
  /\bretail club\b/i,
  /\bjoin\b/i,
  /\bsweepstakes\b/i,
  /\bgift guide\b/i,
  /\btravel\b/i,
  /\brestaurant\b/i,
  /\bcocktail recipe\b/i,
  /\bhow to drink\b/i,
  /\bbarware\b/i,
  /\bglassware\b/i,
  /\bfood pairing\b/i,
  /\bhotel\b/i,
  /\bstyle\b/i,
  /\bfashion\b/i,
  /\bapril fool('?s)?\b/i,
  /\bjoke(s)?\b/i,
  /\bprank(s)?\b/i,
  /\bbest of the worst\b/i,
  /\bbeer\b/i,
  /\blager\b/i,
  /\bipa\b/i,
  /\bwine\b/i,
  /\bcider\b/i,
  /\bseltzer\b/i,
  /\bnon[- ]alcoholic\b/i,
  /\bready[- ]to[- ]drink\b/i,
  /\brtd\b/i,
  /\bheineken\b/i,
  /\bloyalty programme\b/i,
  /\bloyalty program\b/i,
  /\bcampaign\b/i,
  /\binfluencer\b/i,
  /\bliqueur\b/i,
  /\bamarone\b/i,
  /\bdocg\b/i,
  /(^|\b)review:/i,
  /\breview\b/i,
  /\beditorial\b/i,
];

const VIDEO_EXCLUDE_PATTERNS = [
  /\bsubscribe\b/i,
  /\bsubscription\b/i,
  /\bmember(ship)?\b/i,
  /\bretail club\b/i,
  /\bjoin\b/i,
  /\bsweepstakes\b/i,
  /\bgift guide\b/i,
  /\btravel\b/i,
  /\brestaurant\b/i,
  /\bcocktail recipe\b/i,
  /\bhow to drink\b/i,
  /\bbarware\b/i,
  /\bglassware\b/i,
  /\bfood pairing\b/i,
  /\bhotel\b/i,
  /\bstyle\b/i,
  /\bfashion\b/i,
  /\bapril fool('?s)?\b/i,
  /\bjoke(s)?\b/i,
  /\bprank(s)?\b/i,
  /\bbest of the worst\b/i,
  /\bbeer\b/i,
  /\blager\b/i,
  /\bipa\b/i,
  /\bwine\b/i,
  /\bcider\b/i,
  /\bseltzer\b/i,
  /\bnon[- ]alcoholic\b/i,
  /\bready[- ]to[- ]drink\b/i,
  /\brtd\b/i,
  /\bheineken\b/i,
  /\bloyalty programme\b/i,
  /\bloyalty program\b/i,
  /\bcampaign\b/i,
  /\binfluencer\b/i,
  /\bliqueur\b/i,
  /\bamarone\b/i,
  /\bdocg\b/i,
];

const SPIRITS_PATTERNS = [
  /\bdistiller(y|ies)\b/i,
  /\bwhisk(e)?y\b/i,
  /\birish whiskey\b/i,
  /\bbourbon\b/i,
  /\bscotch\b/i,
  /\bsingle malt\b/i,
  /\bamerican whiskey\b/i,
  /\btennessee whiskey\b/i,
  /\brye whiskey\b/i,
  /\brye\b/i,
  /\brum\b/i,
  /\btequila\b/i,
];
const YOUTUBE_SPIRITS_PATTERNS = [
  /\bwhisk(e)?y\b/i,
  /\bbourbon\b/i,
  /\bscotch\b/i,
  /\bsingle malt\b/i,
  /\bamerican whiskey\b/i,
  /\btennessee whiskey\b/i,
  /\brye\b/i,
  /\bjack daniel'?s\b/i,
  /\bmaker'?s mark\b/i,
  /\bwild turkey\b/i,
  /\bbuffalo trace\b/i,
  /\bheaven hill\b/i,
  /\belijah craig\b/i,
  /\bstagg\b/i,
  /\bweller\b/i,
  /\bbooker'?s\b/i,
];

const HIGH_PATTERNS = [
  /\bprice\b/i,
  /\bpricing\b/i,
  /\bmarket\b/i,
  /\bauction\b/i,
  /\brare\b/i,
  /\blimited release\b/i,
  /\blimited-edition\b/i,
  /\bcollect(or|ors)\b/i,
  /\bsecondary\b/i,
  /\btrend(s)?\b/i,
  /\brelease\b/i,
];

const MEDIUM_PATTERNS = [
  /\bdistiller(y|ies)\b/i,
  /\bbrand\b/i,
  /\bproducer\b/i,
  /\bopens?\b/i,
  /\bexpands?\b/i,
  /\bappoints?\b/i,
  /\bacquires?\b/i,
  /\bupdate(s)?\b/i,
  /\blaunch(es|ed)?\b/i,
];

function stripHtml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text, max = 185) {
  const normalized = stripHtml(text);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3).trimEnd()}...`;
}

function cleanTitle(title = "", source = "") {
  return stripHtml(title)
    .replace(new RegExp(`\\s*[|·-]\\s*${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), "")
    .replace(/\s+[|·-]\s+(news|latest|updates?)$/i, "")
    .trim();
}

function normalizeDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function inferCategory(text) {
  const haystack = stripHtml(text).toLowerCase();
  if (haystack.includes("bourbon")) return "bourbon";
  if (haystack.includes("scotch")) return "scotch";
  if (haystack.includes("rum")) return "rum";
  if (haystack.includes("tequila")) return "tequila";
  if (haystack.includes("auction")) return "auction";
  if (haystack.includes("market") || haystack.includes("price")) return "market";
  return "whisky";
}

function decodeXml(value = "") {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractFirstImageFromHtml(html = "") {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ? stripHtml(decodeXml(match[1])) : "";
}

function scorePriority(article) {
  const haystack = `${article.title} ${article.summary}`.toLowerCase();
  const highScore = HIGH_PATTERNS.filter((pattern) => pattern.test(haystack)).length;
  if (highScore > 0) return "high";

  const mediumScore = MEDIUM_PATTERNS.filter((pattern) => pattern.test(haystack)).length;
  if (mediumScore > 0) return "medium";

  return "low";
}

function scoreVideoPriority(article) {
  const haystack = `${article.title} ${article.summary}`.toLowerCase();
  if (/\breview\b|\bcompare\b|\bblind\b|\brank\b|\bvs\b/i.test(haystack)) return "high";

  const highScore = HIGH_PATTERNS.filter((pattern) => pattern.test(haystack)).length;
  if (highScore > 0) return "high";

  const mediumScore = MEDIUM_PATTERNS.filter((pattern) => pattern.test(haystack)).length;
  if (mediumScore > 0 || /\brelease\b|\bbatch\b|\bcask strength\b|\bbarrel proof\b/i.test(haystack)) return "medium";

  return "low";
}

function isRelevant(article) {
  const haystack = `${article.title} ${article.summary} ${article.source}`.toLowerCase();
  if (EXCLUDE_PATTERNS.some((pattern) => pattern.test(haystack))) return false;
  const hasSpiritsContext = SPIRITS_PATTERNS.some((pattern) => pattern.test(haystack));
  const hasCollectorValue =
    HIGH_PATTERNS.some((pattern) => pattern.test(haystack)) ||
    MEDIUM_PATTERNS.some((pattern) => pattern.test(haystack));

  return hasSpiritsContext && hasCollectorValue;
}

function isRelevantVideo(article) {
  const haystack = `${article.title} ${article.summary} ${article.source}`.toLowerCase();
  if (VIDEO_EXCLUDE_PATTERNS.some((pattern) => pattern.test(haystack))) return false;

  const hasWhiskeyContext = YOUTUBE_SPIRITS_PATTERNS.some((pattern) => pattern.test(haystack));
  const hasCollectorValue =
    HIGH_PATTERNS.some((pattern) => pattern.test(haystack)) ||
    MEDIUM_PATTERNS.some((pattern) => pattern.test(haystack)) ||
    /\breview\b|\bcompare\b|\bblind\b|\brank\b|\brelease\b|\bbatch\b|\bbarrel proof\b|\bcask strength\b|\bauction\b|\bmarket\b/i.test(haystack);

  return hasWhiskeyContext && hasCollectorValue;
}

function buildSummary(description = "", title = "") {
  const cleaned = truncate(description || title, 190);
  return cleaned || "Curated spirits coverage relevant to bottle collectors.";
}

function buildVideoSummary(title = "", description = "") {
  const cleanedDescription = stripHtml(description)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b(shop|shirts?|glasses?|merch|patreon|subscribe|join|links?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const sentence = cleanedDescription
    .split(/(?<=[.!?])\s+/)
    .find((part) => part && part.length > 50 && !/new shirts|glasses now available|merch/i.test(part)) || "";

  const summarySource = sentence ? `${title}. ${sentence}` : title;
  return truncate(summarySource, 190) || "Collector video coverage focused on whiskey and bourbon market interest.";
}

function normalizeUrl(url = "", baseUrl = "") {
  if (!url) return "";
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return "";
  }
}

function isUsableImageUrl(url = "") {
  if (!url) return false;
  if (url.startsWith("/")) return true;
  if (!/^https?:\/\//i.test(url)) return false;
  return !/logo|avatar|icon|favicon/i.test(url);
}

function extractFeedImage(item, articleUrl) {
  const directImage =
    item.match(/<media:content[^>]*url="([^"]+)"/i)?.[1] ||
    item.match(/<media:thumbnail[^>]*url="([^"]+)"/i)?.[1] ||
    item.match(/<enclosure[^>]*url="([^"]+)"/i)?.[1] ||
    extractFirstImageFromHtml(
      item.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i)?.[1] ||
        item.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] ||
        "",
    );

  const normalized = normalizeUrl(stripHtml(decodeXml(directImage || "")), articleUrl);
  return isUsableImageUrl(normalized) ? normalized : "";
}


function inferNewsType(source = "", url = "") {
  if (VIDEO_SOURCE_NAMES.has(source) || /youtube\.com\/watch|youtu\.be\//i.test(url)) {
    return "video";
  }

  return "article";
}

function parseRss(xml, source) {
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);

  return items
    .map((item) => {
      const rawTitle = item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
      const articleUrl = stripHtml(item.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || "");
      const description =
        item.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i)?.[1] ||
        item.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] ||
        "";

      const article = {
        id: articleUrl,
        title: cleanTitle(rawTitle, source),
        summary: buildSummary(description, rawTitle),
        source,
        date: normalizeDate(item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || ""),
        url: articleUrl,
        imageUrl: extractFeedImage(item, articleUrl),
        category: inferCategory(`${rawTitle} ${description}`),
        external: true,
        type: "article",
      };

      return {
        ...article,
        priority: scorePriority(article),
      };
    })
    .filter((article) => article.url);
}


function parseYouTubeFeed(xml, source) {
  const entries = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);

  return entries
    .map((entry) => {
      const rawTitle = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
      const videoUrl = stripHtml(entry.match(/<link[^>]+href="([^"]+)"/i)?.[1] || "");
      const published = entry.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1] || "";
      const description =
        entry.match(/<media:description>([\s\S]*?)<\/media:description>/i)?.[1] ||
        entry.match(/<media:group>[\s\S]*?<media:description>([\s\S]*?)<\/media:description>/i)?.[1] ||
        "";
      const thumbnail = entry.match(/<media:thumbnail[^>]+url="([^"]+)"/i)?.[1] || "";

      const article = {
        id: videoUrl,
        title: cleanTitle(rawTitle, source.source),
        summary: buildVideoSummary(rawTitle, description),
        source: source.source,
        date: normalizeDate(published),
        url: videoUrl,
        imageUrl: normalizeUrl(stripHtml(decodeXml(thumbnail)), videoUrl),
        category: inferCategory(`${rawTitle} ${description}`),
        external: true,
        type: "video",
      };

      return {
        ...article,
        priority: scoreVideoPriority(article),
      };
    })
    .filter((article) => article.url);
}

function parseWhiskyAdvocateIndex(html, source) {
  const items = [...html.matchAll(/<div class="postsItem[\s\S]*?<div class="postsItemBody">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi)]
    .map((match) => match[0]);

  return items
    .map((item) => {
      const titleMatch =
        item.match(/<h4 class="postsItemTitle">[\s\S]*?<a[^>]+href="([^"]+)"[^>]*title="([^"]+)"[^>]*>/i) ||
        item.match(/<h4 class="postsItemTitle">[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      const articleUrl = normalizeUrl(titleMatch?.[1] || "", source.url);
      const rawTitle = stripHtml(titleMatch?.[2] || "");
      const rawDate = stripHtml(item.match(/<p class="postsItemDate">([\s\S]*?)<\/p>/i)?.[1] || "");
      const preview = stripHtml(item.match(/<p class="postsItemPreview">([\s\S]*?)<\/p>/i)?.[1] || "");
      const rawImage = normalizeUrl(
        stripHtml(item.match(/<img[^>]+class="postsItemImg"[^>]+src="([^"]+)"/i)?.[1] || ""),
        source.url,
      );

      const article = {
        id: articleUrl,
        title: cleanTitle(rawTitle, source.source),
        summary: buildSummary(preview, rawTitle),
        source: source.source,
        date: normalizeDate(rawDate || ""),
        url: articleUrl,
        imageUrl: isUsableImageUrl(rawImage) ? rawImage : "",
        category: inferCategory(`${rawTitle} ${preview}`),
        external: true,
      };

      return {
        ...article,
        priority: scorePriority(article),
      };
    })
    .filter((article) => article.url);
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;

  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return true;

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPrivateLiteralHostname(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, "").replace(/\.+$/, "").toLowerCase();
  if (!normalized) return true;
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".localdomain")
  ) {
    return true;
  }
  if (isPrivateIpv4(normalized)) return true;
  if (!normalized.includes(":")) return false;

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    /^fe[c-f]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("::ffff:")
  );
}

export function assertSafeRemoteUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Remote URL is invalid.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Remote URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Remote URL credentials are not allowed.");
  }
  if (isPrivateLiteralHostname(url.hostname)) {
    throw new Error("Remote URL points to a private or local address.");
  }

  return url;
}

export async function mapWithConcurrency(items, requestedConcurrency, mapper) {
  if (!items.length) return [];

  const concurrency = Math.max(
    1,
    Math.min(items.length, Number.isFinite(requestedConcurrency) ? Math.floor(requestedConcurrency) : 1),
  );
  const results = new Array(items.length);
  let nextIndex = 0;
  let hasFailure = false;
  let failureReason;

  const worker = async () => {
    while (!hasFailure) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        if (!hasFailure) {
          hasFailure = true;
          failureReason = error;
        }
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (hasFailure) throw failureReason;
  return results;
}

async function readLimitedResponse(response, maxBytes) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Remote response exceeds the ${maxBytes}-byte limit.`);
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`Remote response exceeds the ${maxBytes}-byte limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export async function fetchRemoteBytes(
  value,
  {
    fetchImpl,
    headers,
    maxBytes,
    timeoutMs,
  },
) {
  let currentUrl = assertSafeRemoteUrl(value);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(currentUrl, {
        headers,
        redirect: "manual",
        signal: controller.signal,
      });
      const finalUrl = response.url ? assertSafeRemoteUrl(response.url) : currentUrl;

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REDIRECTS) {
          throw new Error("Remote request exceeded the redirect limit.");
        }
        await response.body?.cancel().catch(() => undefined);
        currentUrl = assertSafeRemoteUrl(new URL(location, finalUrl).toString());
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return {
        bytes: await readLimitedResponse(response, maxBytes),
        contentType: response.headers.get("content-type") || "",
        url: finalUrl.toString(),
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Remote request timed out after ${timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Remote request exceeded the redirect limit.");
}

async function fetchText(url, network) {
  const result = await fetchRemoteBytes(url, {
    fetchImpl: network.fetchImpl,
    headers: {
      "user-agent": "Mozilla/5.0 CaskIndex News Curator",
      accept: "text/html,application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
    },
    maxBytes: network.textResponseLimitBytes,
    timeoutMs: network.timeoutMs,
  });
  return new TextDecoder().decode(result.bytes);
}

async function extractArticleDetails(article, network) {
  try {
    const html = await fetchText(article.url, network);
    const ogImage =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ||
      "";
    const metaDescription =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"]+)["']/i)?.[1] ||
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"]+)["']/i)?.[1] ||
      "";
    const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => stripHtml(match[1]))
      .filter((text) => text.length > 90);
    const firstImage = extractFirstImageFromHtml(html);
    const picked = normalizeUrl(ogImage || firstImage, article.url);
    const summarySource = metaDescription || paragraphs[0] || article.summary || article.title;
    const summary =
      article.type === "video"
        ? buildVideoSummary(article.title, summarySource)
        : truncate(summarySource, 190);
    return {
      imageUrl: isUsableImageUrl(article.imageUrl) ? article.imageUrl : isUsableImageUrl(picked) ? picked : FALLBACK_IMAGE,
      summary,
    };
  } catch {
    return {
      imageUrl: isUsableImageUrl(article.imageUrl) ? article.imageUrl : FALLBACK_IMAGE,
      summary: article.summary,
    };
  }
}

export async function collectArticles(network, sourceConcurrency) {
  const sourceResults = await mapWithConcurrency(
    [...SOURCES, ...YOUTUBE_SOURCES],
    sourceConcurrency,
    async (source) => {
      try {
        const payload = await fetchText(source.url, network);
        if (source.type === "index") {
          return { articles: parseWhiskyAdvocateIndex(payload, source), failed: false };
        }
        if (source.type === "youtube") {
          return { articles: parseYouTubeFeed(payload, source), failed: false };
        }
        return { articles: parseRss(payload, source.source), failed: false };
      } catch (error) {
        console.warn(
          `[news-import] skipped ${source.url}: ${error instanceof Error ? error.message : "unknown error"}`,
        );
        return { articles: [], failed: true };
      }
    },
  );
  const sourceFailureCount = sourceResults.filter((result) => result.failed).length;
  if (sourceFailureCount === sourceResults.length) {
    throw new Error("Unable to fetch any configured news source.");
  }

  const articles = sourceResults.flatMap((result) => result.articles);

  const curated = articles
    .filter((article) => (article.type === "video" ? isRelevantVideo(article) : isRelevant(article)))
    .filter((article) => article.priority === "high" || article.priority === "medium");

  const videos = curated
    .filter((article) => article.type === "video")
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, MAX_VIDEOS_PER_RUN);
  const articlesOnly = curated.filter((article) => article.type !== "video");

  return {
    articles: [...articlesOnly, ...videos],
    sourceCount: sourceResults.length,
    sourceFailureCount,
  };
}

function makeDocId(url) {
  return Buffer.from(url).toString("base64url").slice(0, 120);
}

function getSupabaseAdmin(env = process.env) {
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function fetchExistingUrls(supabase) {
  const { data, error } = await supabase.from("news").select("url").limit(1000);
  if (error) {
    throw new Error("Unable to read existing news URLs from Supabase.");
  }
  if (!data) return new Set();
  return new Set(data.map((row) => row.url).filter(Boolean));
}

function isMissingPriorityColumn(error) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message ?? "")
        : String(error ?? "");
  return /column .*priority.* does not exist/i.test(message) || /schema cache/i.test(message);
}


function isMissingTypeColumn(error) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message ?? "")
        : String(error ?? "");
  return /column .*type.* does not exist/i.test(message) || /schema cache/i.test(message);
}

function inferImageExtension(contentType = "", imageUrl = "") {
  if (contentType.includes("avif") || /\.avif($|\?)/i.test(imageUrl)) return "avif";
  if (contentType.includes("png") || /\.png($|\?)/i.test(imageUrl)) return "png";
  if (contentType.includes("webp") || /\.webp($|\?)/i.test(imageUrl)) return "webp";
  if (contentType.includes("gif") || /\.gif($|\?)/i.test(imageUrl)) return "gif";
  return "jpg";
}

function normalizeResponseContentType(value = "") {
  return value.split(";", 1)[0].trim().toLowerCase();
}

export function isAllowedRasterContentType(value = "") {
  return ALLOWED_RASTER_CONTENT_TYPES.has(normalizeResponseContentType(value));
}

async function uploadNewsImageBuffer(
  supabase,
  storageBucket,
  storagePath,
  buffer,
  contentType = "image/jpeg",
) {
  const { error } = await supabase.storage.from(storageBucket).upload(storagePath, buffer, {
    contentType,
    upsert: true,
    cacheControl: "31536000",
  });

  if (error) {
    throw new Error(error.message || "thumbnail upload failed");
  }

  const { data } = supabase.storage.from(storageBucket).getPublicUrl(storagePath);
  return data?.publicUrl || "";
}

async function saveArticle(supabase, article) {
  const payload = {
    id: makeDocId(article.url),
    title: article.title,
    summary: article.summary,
    source: article.source,
    url: article.url,
    image_url: article.imageUrl,
    published_at: article.date,
    priority: article.priority,
    created_at: new Date().toISOString(),
    category: article.category,
    external: true,
    type: article.type ?? "article",
  };

  const firstAttempt = await supabase.from("news").upsert(payload, { onConflict: "url" });
  if (!firstAttempt.error) return;

  if (isMissingPriorityColumn(firstAttempt.error) || isMissingTypeColumn(firstAttempt.error)) {
    const fallbackAttempt = await supabase.from("news").upsert(
      {
        id: payload.id,
        title: payload.title,
        summary: payload.summary,
        source: payload.source,
        url: payload.url,
        image_url: payload.image_url,
        published_at: payload.published_at,
        created_at: payload.created_at,
        category: payload.category,
        external: payload.external,
      },
      { onConflict: "url" },
    );
    if (!fallbackAttempt.error) return;
  }

  const message =
    firstAttempt.error instanceof Error
      ? firstAttempt.error.message
      : String(firstAttempt.error?.message ?? "unknown error");
  throw new Error(`Unable to save news article: ${article.title} (${message})`);
}

async function uploadRemoteNewsThumbnail(
  supabase,
  storageBucket,
  imageUrl,
  articleUrl,
  network,
) {
  if (!imageUrl || imageUrl.startsWith("/")) {
    return imageUrl || FALLBACK_IMAGE;
  }

  try {
    assertSafeRemoteUrl(imageUrl);
  } catch (error) {
    console.warn(
      `[news-import] unsafe remote thumbnail skipped: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return FALLBACK_IMAGE;
  }

  try {
    const result = await fetchRemoteBytes(imageUrl, {
      fetchImpl: network.fetchImpl,
      headers: {
        "user-agent": "Mozilla/5.0 Caskfolio News Image Cacher",
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      maxBytes: network.imageResponseLimitBytes,
      timeoutMs: network.timeoutMs,
    });
    const contentType = normalizeResponseContentType(result.contentType);
    if (!isAllowedRasterContentType(contentType)) {
      console.warn(
        `[news-import] remote thumbnail MIME skipped: ${contentType || "missing content type"}`,
      );
      return imageUrl;
    }

    const extension = inferImageExtension(contentType, imageUrl);
    const storagePath = `news/imported/${makeDocId(articleUrl || imageUrl)}.${extension}`;
    const publicUrl = await uploadNewsImageBuffer(
      supabase,
      storageBucket,
      storagePath,
      Buffer.from(result.bytes),
      contentType,
    );
    return publicUrl || imageUrl;
  } catch (error) {
    console.warn(
      `[news-import] remote thumbnail upload skipped: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return imageUrl;
  }
}

function sortCuratedArticles(articles) {
  return [...articles].sort((left, right) => {
    const dateDelta = new Date(right.date).getTime() - new Date(left.date).getTime();
    if (dateDelta !== 0) return dateDelta;

    const typeDelta = (left.type === "video" ? 1 : 0) - (right.type === "video" ? 1 : 0);
    if (typeDelta !== 0) return typeDelta;

    return PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority];
  });
}

export async function fetchPublishedArticles(supabase) {
  const { data, error } = await supabase
    .from("news")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(160);
  if (error) {
    throw new Error("Unable to read published news articles from Supabase.");
  }
  if (!data?.length) {
    return [];
  }

  return sortCuratedArticles(
    data.map((row) => ({
      id: String(row.id ?? row.url ?? ""),
      title: String(row.title ?? ""),
      summary: String(row.summary ?? ""),
      source: String(row.source ?? ""),
      date: normalizeDate(row.published_at ?? row.created_at),
      url: String(row.url ?? ""),
      imageUrl: String(row.image_url ?? FALLBACK_IMAGE),
      category: inferCategory(`${row.title ?? ""} ${row.summary ?? ""}`),
      type: inferNewsType(String(row.source ?? ""), String(row.url ?? "")),
      priority:
        row.priority === "high" || row.priority === "medium"
          ? row.priority
          : inferNewsType(String(row.source ?? ""), String(row.url ?? "")) === "video"
            ? scoreVideoPriority(row)
            : scorePriority(row),
      external: true,
    })),
  );
}

function limitVideoShare(articles) {
  let videoCount = 0;
  return sortCuratedArticles(articles).filter((article) => {
    if (article.type !== "video") return true;
    if (videoCount >= MAX_VIDEOS_PER_RUN) return false;
    videoCount += 1;
    return true;
  });
}

export async function runNewsImport(options = {}) {
  const {
    env = process.env,
    writeOutputFile = false,
    useLocalThumbnails = false,
    prepareLocalThumbnail,
    writeOutput,
    fetchImpl = globalThis.fetch,
    fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    textResponseLimitBytes = DEFAULT_TEXT_RESPONSE_LIMIT_BYTES,
    imageResponseLimitBytes = DEFAULT_IMAGE_RESPONSE_LIMIT_BYTES,
    sourceConcurrency = DEFAULT_SOURCE_CONCURRENCY,
    articleConcurrency = DEFAULT_ARTICLE_CONCURRENCY,
  } = options;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for news import.");
  }
  if (useLocalThumbnails && typeof prepareLocalThumbnail !== "function") {
    throw new Error("Local thumbnail mode requires a CLI thumbnail adapter.");
  }
  if (writeOutputFile && typeof writeOutput !== "function") {
    throw new Error("Writing news.json requires a CLI output adapter.");
  }

  const toBoundedInteger = (value, fallback, minimum, maximum) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.floor(numeric)));
  };
  const network = {
    fetchImpl,
    timeoutMs: toBoundedInteger(fetchTimeoutMs, DEFAULT_FETCH_TIMEOUT_MS, 1_000, 30_000),
    textResponseLimitBytes: toBoundedInteger(
      textResponseLimitBytes,
      DEFAULT_TEXT_RESPONSE_LIMIT_BYTES,
      64 * 1024,
      5 * 1024 * 1024,
    ),
    imageResponseLimitBytes: toBoundedInteger(
      imageResponseLimitBytes,
      DEFAULT_IMAGE_RESPONSE_LIMIT_BYTES,
      64 * 1024,
      10 * 1024 * 1024,
    ),
  };
  const boundedSourceConcurrency = toBoundedInteger(
    sourceConcurrency,
    DEFAULT_SOURCE_CONCURRENCY,
    1,
    6,
  );
  const boundedArticleConcurrency = toBoundedInteger(
    articleConcurrency,
    DEFAULT_ARTICLE_CONCURRENCY,
    1,
    6,
  );
  const storageBucket =
    env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ||
    DEFAULT_STORAGE_BUCKET;
  const collectedResult = await collectArticles(network, boundedSourceConcurrency);
  const collected = limitVideoShare(
    [
      ...new Map(
        collectedResult.articles.map((item) => [item.url, item]),
      ).values(),
    ],
  );

  const supabase = getSupabaseAdmin(env);
  const existingUrls = await fetchExistingUrls(supabase);
  const newArticles = collected.filter((item) => !existingUrls.has(item.url)).slice(0, 3);
  const curatedArticles = collected.slice(0, 18);

  await mapWithConcurrency(curatedArticles, boundedArticleConcurrency, async (article) => {
    const extracted = await extractArticleDetails(article, network);
    article.summary = extracted.summary || article.summary;
    const sourceImageUrl = extracted.imageUrl || article.imageUrl || FALLBACK_IMAGE;
    if (useLocalThumbnails) {
      article.imageUrl = await prepareLocalThumbnail({
        article,
        fallbackImage: FALLBACK_IMAGE,
        sourceImageUrl,
        uploadBuffer: (storagePath, buffer, contentType = "image/jpeg") =>
          uploadNewsImageBuffer(
            supabase,
            storageBucket,
            storagePath,
            buffer,
            contentType,
          ),
      });
    } else {
      article.imageUrl = await uploadRemoteNewsThumbnail(
        supabase,
        storageBucket,
        sourceImageUrl,
        article.url,
        network,
      );
    }
    await saveArticle(supabase, article);
  });

  const publishedArticles = await fetchPublishedArticles(supabase);
  const fallbackArticles = limitVideoShare(collected).slice(0, 18);
  const outputArticles = (publishedArticles.length ? publishedArticles : fallbackArticles).map((article) => ({
    ...article,
    imageUrl: article.imageUrl || FALLBACK_IMAGE,
  }));

  if (writeOutputFile) {
    await writeOutput(outputArticles);
  }

  const summary = {
    saved: newArticles.length,
    count: outputArticles.length,
    latestTitle: outputArticles[0]?.title ?? "",
    sourceCount: collectedResult.sourceCount,
    sourceFailureCount: collectedResult.sourceFailureCount,
    warning:
      collectedResult.sourceFailureCount > 0
        ? `${collectedResult.sourceFailureCount} of ${collectedResult.sourceCount} news sources failed.`
        : "",
    wroteOutputFile: writeOutputFile,
  };

  if (!writeOutputFile) {
    console.log(
      `[news-import] saved ${summary.saved} new article(s) and refreshed Supabase news rows`,
    );
  }

  return summary;
}
