import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadProjectEnv } from "../shared/load-env.mjs";

loadProjectEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || "";

const SOURCE_PRIORITY = ["Wine-Searcher", "SpiritRadar", "BottleBlueBook", "WhiskyFindr"];

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "old",
  "year",
  "years",
  "ml",
  "whisky",
  "whiskey",
  "bourbon",
  "scotch",
  "single",
  "malt",
  "straight",
  "edition",
  "batch",
  "cask",
  "proof",
  "release",
  "limited",
]);

const OUTPUT_PATH = path.join(process.cwd(), "public", "reference-price-sync.json");
const WINE_SEARCHER_MIN_CONFIDENCE = 0.72;

function assertSupabaseAdminEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
}

function getSupabaseAdmin() {
  assertSupabaseAdminEnv();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeText(value = "") {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value = "") {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value = "") {
  return decodeHtml(String(value).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function buildBottleFields(bottle) {
  return [
    bottle.name,
    bottle.brand,
    bottle.line,
    bottle.batch,
    bottle.age_statement,
  ].filter(Boolean);
}

function isTooGenericForWineSearcher(bottle) {
  const normalizedName = normalizeText(bottle.name);
  const normalizedBrand = normalizeText(bottle.brand);
  const nameTokens = tokenize(bottle.name);
  const ageTokens = tokenize(bottle.age_statement);
  const batchTokens = tokenize(bottle.batch);

  return (
    normalizedName &&
    normalizedBrand &&
    normalizedName === normalizedBrand &&
    nameTokens.length <= 1 &&
    ageTokens.length === 0 &&
    batchTokens.length <= 1
  );
}

function extractVolumeMl(value = "") {
  const match = String(value).match(/(\d{3,4})\s*ml/i);
  return match ? Number(match[1]) : null;
}

function extractYearTokens(value = "") {
  return [...String(value).matchAll(/\b(19|20)\d{2}\b/g)].map((match) => Number(match[0]));
}

function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))];
}

function extractAgeNumbers(value = "") {
  const text = String(value);
  const explicitAges = [
    ...text.matchAll(/\b(\d{1,3})\s*(?:yo|yr|yrs|year|years)\b/gi),
  ].map((match) => Number(match[1]));
  const standaloneAge =
    /^\s*\d{1,3}\s*$/.test(text) ? [Number(text.trim())] : [];
  return uniqueNumbers([...explicitAges, ...standaloneAge]);
}

function getBottleAgeNumbers(bottle) {
  return uniqueNumbers(
    [
      bottle.name,
      bottle.line,
      bottle.batch,
      bottle.age_statement,
    ].flatMap((value) => extractAgeNumbers(value)),
  );
}

function getCandidateAgeNumbers(candidateText) {
  return extractAgeNumbers(candidateText);
}

function getBottleReleaseYears(bottle) {
  return uniqueNumbers(extractYearTokens([bottle.name, bottle.batch, bottle.line].join(" ")));
}

function extractProductMarkers(value = "") {
  const text = normalizeText(value);
  const prefixedMarkers = [
    ...text.matchAll(/\b(?:no|number|batch|chapter|release|series)\s+([0-9]{1,3}[a-z]?)\b/g),
  ].map((match) => match[1]);
  const shortNumericMarkers = [...text.matchAll(/\b([0-9]{1,2}[a-z]?)\b/g)].map(
    (match) => match[1],
  );

  return [...new Set([...prefixedMarkers, ...shortNumericMarkers])];
}

function getBottleProductMarkers(bottle) {
  const ageMarkers = new Set(getBottleAgeNumbers(bottle).map(String));
  const yearMarkers = new Set(getBottleReleaseYears(bottle).map(String));
  return extractProductMarkers([bottle.name, bottle.batch, bottle.line].filter(Boolean).join(" "))
    .filter((marker) => !ageMarkers.has(marker) && !yearMarkers.has(marker));
}

function hasAnyOverlap(leftValues, rightValues) {
  if (!leftValues.length || !rightValues.length) return false;
  const rightSet = new Set(rightValues);
  return leftValues.some((value) => rightSet.has(value));
}

function getStrictMatchAssessment(bottle, candidateText, options = {}) {
  const text = [candidateText, options.url].filter(Boolean).join(" ");
  const candidateTokens = tokenize(text);
  const candidateTokenSet = new Set(candidateTokens);
  const brandTokens = tokenize(bottle.brand);
  const nameTokens = tokenize(bottle.name).filter((token) => !brandTokens.includes(token));
  const lineTokens = tokenize(bottle.line);
  const batchTokens = tokenize(bottle.batch);
  const ageTokens = tokenize(bottle.age_statement);

  const brandScore = ratioOverlap(brandTokens, candidateTokens);
  const nameScore = ratioOverlap(nameTokens, candidateTokens);
  const lineScore = ratioOverlap(lineTokens, candidateTokens);
  const batchScore = ratioOverlap(batchTokens, candidateTokens);
  const ageScore = ratioOverlap(ageTokens, candidateTokens);
  const bottleAges = getBottleAgeNumbers(bottle);
  const candidateAges = getCandidateAgeNumbers(text);
  const bottleYears = getBottleReleaseYears(bottle);
  const candidateYears = extractYearTokens(text);
  const bottleProductMarkers = getBottleProductMarkers(bottle);
  const candidateProductMarkers = extractProductMarkers(candidateText);
  const reasons = [];

  if (brandTokens.length && brandScore < 1) {
    reasons.push("brand mismatch");
  }

  if (nameTokens.length >= 3 && nameScore < 0.85) {
    reasons.push("name token mismatch");
  } else if (nameTokens.length === 2 && nameScore < 1) {
    reasons.push("name token mismatch");
  } else if (nameTokens.length === 1 && !candidateTokenSet.has(nameTokens[0])) {
    reasons.push("name token mismatch");
  }

  if (lineTokens.length && lineScore < 0.8) {
    reasons.push("line mismatch");
  }

  if (batchTokens.length && batchScore < 0.8) {
    reasons.push("batch mismatch");
  }

  if (ageTokens.length && ageScore < 1) {
    reasons.push("age statement mismatch");
  }

  if (bottleAges.length && !hasAnyOverlap(bottleAges, candidateAges)) {
    reasons.push("age number mismatch");
  }

  if (bottleYears.length && !hasAnyOverlap(bottleYears, candidateYears)) {
    reasons.push("release year mismatch");
  }

  if (
    bottleProductMarkers.length &&
    !hasAnyOverlap(bottleProductMarkers, candidateProductMarkers)
  ) {
    reasons.push("product number mismatch");
  }

  const normalizedBottleName = normalizeText(bottle.name);
  const normalizedBrand = normalizeText(bottle.brand);
  const extraCandidateTokens = candidateTokens.filter(
    (token) => !brandTokens.includes(token) && !nameTokens.includes(token),
  );
  const isBrandOnlyBottle =
    normalizedBottleName &&
    normalizedBrand &&
    normalizedBottleName === normalizedBrand;

  if (isBrandOnlyBottle && extraCandidateTokens.length > 0) {
    reasons.push("generic bottle matched a specific release");
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    brandScore,
    nameScore,
    lineScore,
    batchScore,
    ageScore,
  };
}

function ratioOverlap(requiredTokens, candidateTokens) {
  if (!requiredTokens.length) return 1;
  const candidateSet = new Set(candidateTokens);
  const matched = requiredTokens.filter((token) => candidateSet.has(token)).length;
  return matched / requiredTokens.length;
}

function getWineSearcherConfidence(bottle, match) {
  const bottleBrandTokens = tokenize(bottle.brand);
  const bottleNameTokens = tokenize(bottle.name);
  const bottleBatchTokens = tokenize(bottle.batch);
  const bottleAgeTokens = tokenize(bottle.age_statement);
  const resultText = [
    match.wineName,
    match.wineryName,
    match.appellation,
    match.style,
  ]
    .filter(Boolean)
    .join(" ");
  const resultTokens = tokenize(resultText);
  const normalizedResultText = normalizeText(resultText);

  const brandScore = ratioOverlap(bottleBrandTokens, resultTokens);
  const nameScore = ratioOverlap(bottleNameTokens, resultTokens);
  const batchScore = ratioOverlap(bottleBatchTokens, resultTokens);
  const ageScore = ratioOverlap(bottleAgeTokens, resultTokens);

  const expectedVolume = Number.isFinite(Number(bottle.volume_ml)) ? Number(bottle.volume_ml) : null;
  const matchedVolume = extractVolumeMl(match.wineName);
  const volumeScore =
    expectedVolume && matchedVolume
      ? Math.abs(expectedVolume - matchedVolume) <= 50
        ? 1
        : 0
      : expectedVolume
        ? 0
        : 1;

  const bottleYears = extractYearTokens([bottle.name, bottle.batch].join(" "));
  const resultYears = extractYearTokens(match.wineName);
  const yearScore =
    bottleYears.length === 0
      ? 1
      : bottleYears.some((year) => resultYears.includes(year))
        ? 1
        : 0;
  const categoryNeedle = normalizeText(bottle.category);
  const categoryScore =
    !categoryNeedle || categoryNeedle === "etc"
      ? 1
      : categoryNeedle === "bourbon"
        ? normalizedResultText.includes("bourbon")
          ? 1
          : 0
        : categoryNeedle === "whisky"
          ? ["whisky", "whiskey", "scotch", "single malt"].some((value) =>
              normalizedResultText.includes(value),
            )
            ? 1
            : 0
          : 1;

  const confidence = Number(
    (
      brandScore * 0.35 +
      nameScore * 0.3 +
      batchScore * 0.1 +
      ageScore * 0.1 +
      volumeScore * 0.05 +
      yearScore * 0.05 +
      categoryScore * 0.05
    ).toFixed(3),
  );

  return {
    confidence,
    matchedVolumeMl: matchedVolume,
    volumeScore,
    yearScore,
    categoryScore,
    brandScore,
    nameScore,
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 CaskIndex Reference Sync",
      accept: "text/html,application/json,application/xml,text/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.text();
}

function parseDollarAmount(value = "") {
  const normalized = String(value).replace(/[$,\s]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 CaskIndex Reference Sync",
      accept: "application/json,text/plain,*/*",
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

const fxCache = new Map();
let spiritRadarBottleUrlsPromise = null;

async function convertToUsd(value, currency) {
  if (!Number.isFinite(value)) return null;
  if (!currency || currency === "USD") return Number(value.toFixed(2));

  const code = String(currency).toUpperCase();
  if (code === "USD") return Number(value.toFixed(2));

  if (!fxCache.has(code)) {
    const payload = await fetchJson(`https://open.er-api.com/v6/latest/${code}`);
    fxCache.set(code, Number(payload?.rates?.USD ?? 0));
  }

  const rate = fxCache.get(code);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Number((value * rate).toFixed(2));
}

function extractJsonLdBlocks(html) {
  return [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]?.trim())
    .filter(Boolean);
}

function flattenJsonLd(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonLd);
  }
  if (typeof value === "object") {
    const graphItems = Array.isArray(value["@graph"]) ? value["@graph"] : [];
    return [value, ...graphItems.flatMap(flattenJsonLd)];
  }
  return [];
}

function extractSpiritRadarMetadata(html) {
  let product = null;
  let webpage = null;

  for (const block of extractJsonLdBlocks(html)) {
    try {
      const parsed = JSON.parse(block);
      const items = flattenJsonLd(parsed);
      product ||= items.find((item) => item?.["@type"] === "Product") ?? null;
      webpage ||= items.find((item) => item?.["@type"] === "WebPage") ?? null;
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  const bottleId = html.match(/var bottle_id=(\d+)/)?.[1] ?? "";
  return {
    bottleId,
    product,
    webpage,
  };
}

function pickSpiritRadarHistoryPoint(history, targetTimestamp) {
  const candidates = history
    .filter((item) => Number.isFinite(Number(item?.priceRealValue)))
    .map((item) => ({
      timestamp: Date.parse(item.date),
      value: Number(item.priceRealValue),
    }))
    .filter((item) => Number.isFinite(item.timestamp) && Number.isFinite(item.value));

  if (!candidates.length) return null;

  const olderOrEqual = candidates.filter((item) => item.timestamp <= targetTimestamp);
  if (olderOrEqual.length) {
    return olderOrEqual.reduce((best, current) =>
      current.timestamp > best.timestamp ? current : best,
    );
  }

  return candidates[0];
}

async function getSpiritRadarBottleUrls() {
  spiritRadarBottleUrlsPromise ||= fetchText(
    "https://www.spiritradar.com/sitemap-post-type-bottle.xml",
  ).then((xml) =>
    [...xml.matchAll(/<loc>(.*?)<\/loc>/g)]
      .map((match) => match[1])
      .filter((url) => typeof url === "string" && url.includes("/bottle/") && !url.endsWith("/bottle/")),
  );
  return spiritRadarBottleUrlsPromise;
}

function scoreSpiritRadarUrl(url, bottle) {
  const slug = url.split("/").filter(Boolean).pop() ?? "";
  const slugTokens = new Set(tokenize(slug));
  const fields = buildBottleFields(bottle);
  const weightedGroups = [
    { tokens: tokenize(bottle.brand), weight: 3 },
    { tokens: tokenize(bottle.name), weight: 2.5 },
    { tokens: tokenize(bottle.line), weight: 1.5 },
    { tokens: tokenize(bottle.batch), weight: 1.5 },
    { tokens: tokenize(bottle.age_statement), weight: 1.2 },
  ];

  let score = 0;
  let matchedCount = 0;

  for (const group of weightedGroups) {
    for (const token of group.tokens) {
      if (slugTokens.has(token)) {
        score += group.weight;
        matchedCount += 1;
      }
    }
  }

  const fullFingerprint = normalizeText(fields.join(" "));
  if (fullFingerprint && normalizeText(slug).includes(fullFingerprint.split(" ").slice(0, 3).join(" "))) {
    score += 3;
  }

  return { score, matchedCount };
}

async function fetchSpiritRadarReference(bottle) {
  const urls = await getSpiritRadarBottleUrls();
  const ranked = urls
    .map((url) => ({ url, ...scoreSpiritRadarUrl(url, bottle) }))
    .filter((entry) => entry.score >= 3 && entry.matchedCount >= 2)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  for (const candidate of ranked) {
    try {
      const html = await fetchText(candidate.url);
      const { bottleId, product, webpage } = extractSpiritRadarMetadata(html);
      if (!bottleId || !product?.offers?.lowPrice) {
        continue;
      }

      const strictMatch = getStrictMatchAssessment(
        bottle,
        [
          product.name,
          product.description,
          webpage?.name,
          webpage?.headline,
        ]
          .filter(Boolean)
          .join(" "),
        { url: candidate.url },
      );
      if (!strictMatch.accepted) {
        continue;
      }

      const sourceCurrency = String(product.offers.priceCurrency ?? "USD").toUpperCase();
      const historyPayload = await fetchJson(`https://www.spiritradar.com/data/${bottleId}.json`);
      const history = historyPayload?.data?.priceHistory?.data ?? [];
      const latestPoint = pickSpiritRadarHistoryPoint(history, Number.POSITIVE_INFINITY);
      const currentValue = latestPoint?.value ?? Number(product.offers.lowPrice);
      const latestTimestamp = latestPoint?.timestamp ?? Date.now();
      const sixMonthPoint = pickSpiritRadarHistoryPoint(
        history,
        latestTimestamp - 180 * 24 * 60 * 60 * 1000,
      );

      const referencePriceUsd = await convertToUsd(currentValue, sourceCurrency);
      if (!referencePriceUsd) {
        continue;
      }

      const referencePrice6mAgo = sixMonthPoint?.value
        ? await convertToUsd(sixMonthPoint.value, sourceCurrency)
        : referencePriceUsd;
      const referenceChangePercent =
        referencePrice6mAgo && referencePrice6mAgo > 0
          ? Number((((referencePriceUsd - referencePrice6mAgo) / referencePrice6mAgo) * 100).toFixed(1))
          : 0;

      return {
        bottle_id: bottle.id,
        source: "SpiritRadar",
        reference_price_usd: referencePriceUsd,
        reference_price_6m_ago: referencePrice6mAgo ?? referencePriceUsd,
        reference_change_percent: referenceChangePercent,
        source_url: candidate.url,
        updated_at:
          webpage?.dateModified ||
          (Number.isFinite(latestTimestamp) ? new Date(latestTimestamp).toISOString() : new Date().toISOString()),
      };
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function buildWineSearcherQueries(bottle) {
  const uniqueQueries = new Set();
  const primary = [bottle.brand, bottle.name, bottle.batch, bottle.age_statement]
    .filter(Boolean)
    .join(" ")
    .trim();
  const secondary = [bottle.brand, bottle.name].filter(Boolean).join(" ").trim();

  for (const query of [primary, secondary]) {
    if (query) uniqueQueries.add(query);
  }

  return [...uniqueQueries];
}

async function fetchWineSearcherReference(bottle) {
  if (!APIFY_API_TOKEN) {
    return null;
  }
  if (isTooGenericForWineSearcher(bottle)) {
    return null;
  }

  const queries = buildWineSearcherQueries(bottle);
  for (const query of queries) {
    try {
      const payload = await fetchJsonWithTimeout(
        `https://api.apify.com/v2/acts/mrbridge~wine-searcher-scraper-from-list/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_API_TOKEN)}&timeout=15`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            inputType: "wineNames",
            wineNames: [query],
            proxyCountry: "US",
            useCache: true,
            cacheTtlDays: 30,
            maxConcurrency: 1,
          }),
        },
        20000,
      );

      const match = Array.isArray(payload) ? payload[0] : null;
      if (!match?.cheapestPriceAmount) {
        continue;
      }

      const confidence = getWineSearcherConfidence(bottle, match);
      if (
        confidence.brandScore <= 0 ||
        confidence.nameScore < 0.5 ||
        confidence.categoryScore <= 0 ||
        confidence.confidence < WINE_SEARCHER_MIN_CONFIDENCE
      ) {
        continue;
      }

      const strictMatch = getStrictMatchAssessment(
        bottle,
        [
          match.wineName,
          match.wineryName,
          match.appellation,
          match.style,
        ]
          .filter(Boolean)
          .join(" "),
        { url: match.wineSearcherUrl || "" },
      );
      if (!strictMatch.accepted) {
        continue;
      }

      const referencePriceUsd = await convertToUsd(
        Number(match.cheapestPriceAmount),
        String(match.cheapestPriceCurrency ?? "USD").toUpperCase(),
      );
      if (!referencePriceUsd) {
        continue;
      }

      return {
        bottle_id: bottle.id,
        source: "Wine-Searcher",
        reference_price_usd: referencePriceUsd,
        reference_price_6m_ago: referencePriceUsd,
        reference_change_percent: 0,
        source_url: match.wineSearcherUrl || "",
        updated_at: match.scrapedAt || match.cachedAt || new Date().toISOString(),
        confidence_score: confidence.confidence,
        matched_name: match.wineName || "",
        matched_volume_ml: confidence.matchedVolumeMl,
      };
    } catch {
      // Continue to the next query variation.
    }
  }

  return null;
}

async function fetchWhiskyFindrReference(bottle) {
  // WhiskyFindr result pages currently expose unrelated dollar amounts that can look
  // like a match. Keep it out of automatic reference sync until result-level parsing
  // can validate the matched product name and price together.
  return null;

  const query = encodeURIComponent(buildBottleFields(bottle).join(" "));
  const pages = [
    `https://www.whiskyfindr.com/explore?q=${query}`,
    `https://www.whiskyfindr.com/secondary-market?q=${query}`,
  ];
  const bottleFingerprint = normalizeText([bottle.brand, bottle.name, bottle.age_statement].join(" "));
  const bottleNameFingerprint = normalizeText(bottle.name);

  for (const url of pages) {
    try {
      const html = await fetchText(url);
      const normalizedHtml = normalizeText(html);
      const hasExactBottleFingerprint =
        (bottleFingerprint.length > 8 && normalizedHtml.includes(bottleFingerprint)) ||
        (bottleNameFingerprint.length > 8 && normalizedHtml.includes(bottleNameFingerprint));

      if (!hasExactBottleFingerprint) {
        continue;
      }

      const strictMatch = getStrictMatchAssessment(bottle, normalizedHtml, { url });
      if (!strictMatch.accepted) {
        continue;
      }

      const priceMatch = html.match(/\$([1-9][0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/);
      if (!priceMatch) {
        continue;
      }

      return {
        bottle_id: bottle.id,
        source: "WhiskyFindr",
        reference_price_usd: Number(priceMatch[1].replace(/,/g, "")),
        reference_price_6m_ago: Number(priceMatch[1].replace(/,/g, "")),
        reference_change_percent: 0,
        source_url: url,
        updated_at: new Date().toISOString(),
      };
    } catch {
      // Continue to the next WhiskyFindr probe.
    }
  }

  return null;
}

function buildBottleBlueBookQueries(bottle) {
  const queries = new Set();
  const primary = [bottle.brand, bottle.name, bottle.batch, bottle.age_statement]
    .filter(Boolean)
    .join(" ")
    .trim();
  const secondary = [bottle.brand, bottle.name].filter(Boolean).join(" ").trim();
  const tertiary = [bottle.name, bottle.batch].filter(Boolean).join(" ").trim();

  for (const query of [primary, secondary, tertiary, bottle.name]) {
    if (query && normalizeText(query).length >= 3) {
      queries.add(query);
    }
  }

  return [...queries];
}

function extractBottleBlueBookCandidates(html) {
  return [...html.matchAll(/<a\s+href="([^"]+)"\s+class="bottle_listings_box">([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      const url = decodeHtml(match[1]);
      const block = match[2] ?? "";
      const text = stripHtml(block);
      const title = text.match(/^(.*?)\s+Year:/i)?.[1]?.trim() ?? text.split("Market Estimate:")[0]?.trim() ?? "";
      const yearValue = text.match(/Year:\s*([^\s]+(?:\s+[^\s]+)?)/i)?.[1]?.trim() ?? "";
      const proof = Number(text.match(/Proof:\s*([0-9.]+)/i)?.[1] ?? NaN);
      const volumeMl = Number(text.match(/Size:\s*([0-9,]+)\s*mL/i)?.[1]?.replace(/,/g, "") ?? NaN);
      const estimateMatch = text.match(/Market Estimate:\s*\$?([0-9,]+)\s*-\s*\$?([0-9,]+)/i);
      const lastSaleDate = text.match(/Last Collected Sale Date:\s*([0-9]{2}-[0-9]{2}-[0-9]{4}|N\/A)/i)?.[1] ?? "";
      const changeRaw = text.match(/Market Change:\s*(No Change|[-+]?\d+(?:\.\d+)?%)/i)?.[1] ?? "";

      return {
        url,
        title,
        text,
        year: yearValue,
        proof: Number.isFinite(proof) ? proof : null,
        volumeMl: Number.isFinite(volumeMl) ? volumeMl : null,
        estimateLow: estimateMatch ? parseDollarAmount(estimateMatch[1]) : null,
        estimateHigh: estimateMatch ? parseDollarAmount(estimateMatch[2]) : null,
        lastSaleDate,
        changePercent:
          changeRaw && !/no change/i.test(changeRaw)
            ? Number(changeRaw.replace("%", ""))
            : 0,
      };
    })
    .filter((candidate) => candidate.url && candidate.title);
}

function getBottleBlueBookSearchPageUrls(html) {
  return [
    ...new Set(
      [...html.matchAll(/href="(https:\/\/bottlebluebook\.com\/search\/[^"]+\?page=\d+)"/gi)]
        .map((match) => decodeHtml(match[1]))
        .slice(0, 2),
    ),
  ];
}

function getBottleBlueBookCandidateConfidence(bottle, candidate) {
  const bottleBrandTokens = tokenize(bottle.brand);
  const bottleNameTokens = tokenize(bottle.name);
  const bottleBatchTokens = tokenize(bottle.batch);
  const bottleAgeTokens = tokenize(bottle.age_statement);
  const candidateTokens = tokenize([candidate.title, candidate.text].filter(Boolean).join(" "));
  const normalizedCandidateText = normalizeText([candidate.title, candidate.text].filter(Boolean).join(" "));

  const brandScore = ratioOverlap(bottleBrandTokens, candidateTokens);
  const nameScore = ratioOverlap(bottleNameTokens, candidateTokens);
  const batchScore = ratioOverlap(bottleBatchTokens, candidateTokens);
  const ageScore = ratioOverlap(bottleAgeTokens, candidateTokens);

  const expectedProof = Number(bottle.abv) > 0 ? Number(bottle.abv) * 2 : null;
  const proofScore =
    expectedProof && candidate.proof
      ? Math.abs(expectedProof - candidate.proof) <= 1
        ? 1
        : 0
      : expectedProof
        ? 0.5
        : 1;

  const expectedVolume = Number.isFinite(Number(bottle.volume_ml)) ? Number(bottle.volume_ml) : null;
  const volumeScore =
    expectedVolume && candidate.volumeMl
      ? Math.abs(expectedVolume - candidate.volumeMl) <= 50
        ? 1
        : 0
      : expectedVolume
        ? 0.5
        : 1;

  const bottleYears = extractYearTokens([bottle.name, bottle.batch].join(" "));
  const candidateYears = extractYearTokens([candidate.title, candidate.year].join(" "));
  const yearScore =
    bottleYears.length === 0
      ? 1
      : bottleYears.some((year) => candidateYears.includes(year))
        ? 1
        : 0;

  const categoryNeedle = normalizeText(bottle.category);
  const categoryScore =
    !categoryNeedle || categoryNeedle === "etc"
      ? 1
      : categoryNeedle === "bourbon"
        ? normalizedCandidateText.includes("bourbon") || candidate.url.includes("/Bourbon")
          ? 1
          : 0.8
        : categoryNeedle === "whisky"
          ? 1
          : 0.5;

  const confidence = Number(
    (
      brandScore * 0.28 +
      nameScore * 0.3 +
      batchScore * 0.1 +
      ageScore * 0.08 +
      proofScore * 0.1 +
      volumeScore * 0.06 +
      yearScore * 0.04 +
      categoryScore * 0.04
    ).toFixed(3),
  );

  return {
    confidence,
    brandScore,
    nameScore,
    proofScore,
    volumeScore,
    yearScore,
  };
}

function parseBottleBlueBookDate(value = "") {
  const match = String(value).match(/\b([0-9]{2})[/-]([0-9]{2})[/-]([0-9]{4})\b/);
  if (!match) return null;
  const [, month, day, year] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function extractBottleBlueBookDetail(html, candidate) {
  const text = stripHtml(html);
  const title = stripHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") || candidate.title;
  const type =
    stripHtml(
      html.match(/<span[^>]*>\s*Type\s*<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "",
    ) || "";
  const estimateMatch = text.match(/Market Data\s+\$?([0-9,]+)\s*-\s*\$?([0-9,]+)/i);
  const averageMatch = text.match(/\$?([0-9,]+)\s+30 Day Average/i);
  const latestTransaction = [...text.matchAll(/Sold:\s*\$([0-9,]+)\s+on\s+([0-9]{2}\/[0-9]{2}\/[0-9]{4})/gi)][0];
  const historicalMatch = html.match(/data:\s*(\[[^\]]+\])\s*,\s*lineColors/i);

  let historical = [];
  if (historicalMatch?.[1]) {
    try {
      historical = JSON.parse(historicalMatch[1]);
    } catch {
      historical = [];
    }
  }

  const estimateLow = estimateMatch ? parseDollarAmount(estimateMatch[1]) : candidate.estimateLow;
  const estimateHigh = estimateMatch ? parseDollarAmount(estimateMatch[2]) : candidate.estimateHigh;
  const average = averageMatch ? parseDollarAmount(averageMatch[1]) : null;
  const midpoint =
    estimateLow && estimateHigh
      ? Number(((estimateLow + estimateHigh) / 2).toFixed(2))
      : null;
  const referencePriceUsd = average ?? midpoint;
  const lastTransactionDate = latestTransaction?.[2] ?? "";
  const lastSaleDate = lastTransactionDate || candidate.lastSaleDate;

  return {
    title,
    type,
    estimateLow,
    estimateHigh,
    average,
    referencePriceUsd,
    latestTransactionPrice: latestTransaction ? parseDollarAmount(latestTransaction[1]) : null,
    lastSaleDate,
    historical,
  };
}

async function fetchBottleBlueBookReference(bottle) {
  const category = normalizeText(bottle.category);
  if (["rum", "tequila", "sake", "other spirits"].includes(category)) {
    return null;
  }

  const seenUrls = new Set();

  for (const query of buildBottleBlueBookQueries(bottle)) {
    try {
      const firstUrl = `https://bottlebluebook.com/search?q=${encodeURIComponent(query)}`;
      const firstHtml = await fetchText(firstUrl);
      const pageUrls = [firstUrl, ...getBottleBlueBookSearchPageUrls(firstHtml)];
      const candidates = [];

      for (const pageUrl of pageUrls) {
        const html = pageUrl === firstUrl ? firstHtml : await fetchText(pageUrl);
        candidates.push(...extractBottleBlueBookCandidates(html));
      }

      const ranked = candidates
        .filter((candidate) => {
          if (seenUrls.has(candidate.url)) return false;
          seenUrls.add(candidate.url);
          return true;
        })
        .map((candidate) => ({
          ...candidate,
          confidence: getBottleBlueBookCandidateConfidence(bottle, candidate),
        }))
        .filter((candidate) => candidate.confidence.confidence >= 0.74)
        .filter((candidate) =>
          getStrictMatchAssessment(
            bottle,
            [candidate.title, candidate.year].filter(Boolean).join(" "),
            { url: candidate.url },
          ).accepted,
        )
        .sort((left, right) => right.confidence.confidence - left.confidence.confidence)
        .slice(0, 3);

      for (const candidate of ranked) {
        const detailHtml = await fetchText(candidate.url);
        const detail = extractBottleBlueBookDetail(detailHtml, candidate);
        const detailConfidence = getBottleBlueBookCandidateConfidence(bottle, {
          ...candidate,
          title: detail.title || candidate.title,
          text: [candidate.text, detail.type].filter(Boolean).join(" "),
        });
        const strictDetailMatch = getStrictMatchAssessment(
          bottle,
          [
            detail.title || candidate.title,
            detail.type,
            candidate.year,
          ]
            .filter(Boolean)
            .join(" "),
          { url: candidate.url },
        );

        if (
          !detail.referencePriceUsd ||
          detailConfidence.confidence < 0.78 ||
          !strictDetailMatch.accepted
        ) {
          continue;
        }

        const historicalCurrent = Array.isArray(detail.historical) ? detail.historical.at(-1) : null;

        return {
          bottle_id: bottle.id,
          source: "BottleBlueBook",
          reference_price_usd: detail.referencePriceUsd,
          reference_price_6m_ago: detail.referencePriceUsd,
          reference_change_percent: candidate.changePercent,
          source_url: candidate.url,
          updated_at:
            parseBottleBlueBookDate(detail.lastSaleDate) ||
            (historicalCurrent?.y ? new Date(`${historicalCurrent.y}-01-01T00:00:00.000Z`).toISOString() : new Date().toISOString()),
          confidence_score: detailConfidence.confidence,
          matched_name: detail.title || candidate.title,
          matched_volume_ml: candidate.volumeMl,
        };
      }
    } catch {
      // Continue to the next query variation.
    }
  }

  return null;
}

export async function resolveExternalReferencePrice(bottle) {
  for (const source of SOURCE_PRIORITY) {
    if (source === "Wine-Searcher") {
      const result = await fetchWineSearcherReference(bottle);
      if (result) return result;
    }

    if (source === "WhiskyFindr") {
      const result = await fetchWhiskyFindrReference(bottle);
      if (result) return result;
    }

    if (source === "SpiritRadar") {
      const result = await fetchSpiritRadarReference(bottle);
      if (result) return result;
    }

    if (source === "BottleBlueBook") {
      const result = await fetchBottleBlueBookReference(bottle);
      if (result) return result;
    }
  }

  return null;
}

async function replaceBottleReferencePrice(supabase, bottleId, referenceRow) {
  await supabase.from("bottle_reference_prices").delete().eq("bottle_id", bottleId);

  const {
    confidence_score,
    matched_name,
    matched_volume_ml,
    ...dbRow
  } = referenceRow;

  const { error } = await supabase.from("bottle_reference_prices").insert(dbRow);
  if (error) {
    if (error.message?.includes("Could not find the table 'public.bottle_reference_prices'")) {
      throw new Error(
        "The Supabase table public.bottle_reference_prices does not exist yet. Apply the latest schema before running reference sync.",
      );
    }
    throw new Error(`Unable to save reference price for ${bottleId}: ${error.message}`);
  }
}

export async function syncBottleReferencePrice(supabase, bottleId) {
  const { data: bottle, error } = await supabase
    .from("bottles")
    .select("*")
    .eq("id", bottleId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load bottle ${bottleId}: ${error.message}`);
  }

  if (!bottle) {
    throw new Error(`Bottle ${bottleId} was not found.`);
  }

  const reference = await resolveExternalReferencePrice(bottle);

  if (reference) {
    await replaceBottleReferencePrice(supabase, bottle.id, reference);
    return {
      matched: true,
      detail: {
        bottleId: bottle.id,
        bottleName: bottle.name,
        source: reference.source,
        referencePriceUsd: reference.reference_price_usd,
        confidenceScore: reference.confidence_score ?? null,
        matchedName: reference.matched_name ?? null,
        matchedVolumeMl: reference.matched_volume_ml ?? null,
      },
    };
  }

  await supabase.from("bottle_reference_prices").delete().eq("bottle_id", bottle.id);
  return {
    matched: false,
    detail: {
      bottleId: bottle.id,
      bottleName: bottle.name,
      source: null,
      referencePriceUsd: null,
      confidenceScore: null,
      matchedName: null,
      matchedVolumeMl: null,
    },
  };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const currentIndex = index;
      index += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function main() {
  const supabase = getSupabaseAdmin();
  const requestedBottleId = process.argv
    .slice(2)
    .find((arg) => arg.startsWith("--bottle="))
    ?.split("=")[1];

  const { data: bottles, error } = await supabase.from("bottles").select("*").order("created_at");
  if (error) {
    throw new Error(`Unable to load bottles: ${error.message}`);
  }

  const targetBottles = (bottles ?? []).filter((bottle) =>
    requestedBottleId ? bottle.id === requestedBottleId : true,
  );

  const summary = {
    processed: 0,
    matched: 0,
    failed: 0,
    updatedAt: new Date().toISOString(),
    details: [],
  };

  const results = await mapWithConcurrency(targetBottles, 5, async (bottle, index) => {
    console.log(`[reference-sync] ${index + 1}/${targetBottles.length}: ${bottle.name}`);
    return syncBottleReferencePrice(supabase, bottle.id);
  });

  for (const result of results) {
    summary.processed += 1;
    if (result?.matched) {
      summary.matched += 1;
    } else {
      summary.failed += 1;
    }
    if (result?.detail) {
      summary.details.push(result.detail);
    }
  }

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(summary, null, 2));
  console.log(`[reference-sync] processed ${summary.processed} bottle(s), matched ${summary.matched}, failed ${summary.failed}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[reference-sync] failed:", error);
    process.exitCode = 1;
  });
}
