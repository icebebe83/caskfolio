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
const REUSABLE_REFERENCE_SOURCES = new Set(["winesearcher", "spiritradar"]);
const REUSABLE_REFERENCE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const PRESENTATION_METADATA_PATTERN =
  /\b(?:(?:very\s+)?old|new)\s+(?:label|bottle|bottling|packaging)\b|\bempty\s+bottle\b/gi;
const NON_IDENTITY_VALUES = new Set(["", ".", "-", "n a", "na", "none", "unknown"]);
const DISTINCTIVE_PRODUCT_QUALIFIERS = new Set([
  "anniversary",
  "commemorative",
  "exclusive",
  "exclusivite",
  "master",
  "private",
  "reserve",
  "select",
  "special",
  "takara",
  "travel",
]);
const NUMBER_WORDS = new Map([
  ["three", "3"],
  ["four", "4"],
  ["five", "5"],
  ["six", "6"],
  ["seven", "7"],
  ["eight", "8"],
  ["nine", "9"],
  ["ten", "10"],
  ["eleven", "11"],
  ["twelve", "12"],
  ["thirteen", "13"],
  ["fourteen", "14"],
  ["fifteen", "15"],
  ["sixteen", "16"],
  ["seventeen", "17"],
  ["eighteen", "18"],
  ["nineteen", "19"],
  ["twenty", "20"],
  ["twenty one", "21"],
  ["twenty five", "25"],
  ["twenty seven", "27"],
  ["twenty nine", "29"],
  ["thirty", "30"],
]);
const SEARCH_ABBREVIATIONS = [
  [/\b(\d{1,3})\s*(?:yo|yr|yrs|y)\b/gi, "$1 year"],
  [/\bcs\b/gi, "cask strength"],
  [/\bbp\b/gi, "barrel proof"],
  [/\bfp\b/gi, "full proof"],
  [/\bsb\b/gi, "single barrel"],
  [/\bdr\b/gi, "distillers reserve"],
];

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
  "label",
  "bottle",
  "bottling",
  "packaging",
  "nas",
  "ed",
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
  let normalized = String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bfourroses\b/g, "four roses")
    .replace(/\bbullet\b/g, "bulleit")
    .replace(/\bcutty sack\b/g, "cutty sark")
    .replace(/\bsantory\b/g, "suntory")
    .replace(/\bhennesy\b/g, "hennessy")
    .replace(/\bannoversary\b/g, "anniversary")
    .replace(/\bmasater\b/g, "master")
    .replace(/\bqubec\b/g, "quebec")
    .replace(/\b(?:the )?glen allachie\b/g, "glenallachie")
    .trim();

  for (const [word, number] of [...NUMBER_WORDS].sort(
    (left, right) => right[0].length - left[0].length,
  )) {
    normalized = normalized.replace(new RegExp(`\\b${word}\\b`, "g"), number);
  }

  return normalized;
}

function tokenize(value = "") {
  return normalizeText(expandSearchAbbreviations(value))
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export function sanitizeReferenceText(value = "") {
  return String(value)
    .replace(PRESENTATION_METADATA_PATTERN, " ")
    .replace(/[·|/]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:_-]+|[\s.,;:_-]+$/g, "")
    .trim();
}

function isNonIdentityValue(value = "") {
  return NON_IDENTITY_VALUES.has(normalizeText(value));
}

function getMeaningfulAgeStatement(bottle) {
  const ageStatement = sanitizeReferenceText(bottle.age_statement);
  if (isNonIdentityValue(ageStatement) || /^nas\b/i.test(ageStatement)) return "";
  return ageStatement;
}

function getMeaningfulBatch(bottle) {
  const batch = sanitizeReferenceText(bottle.batch);
  if (isNonIdentityValue(batch)) return "";

  const identityParts = [
    ...batch.matchAll(/\b(?:batch|chapter|release|series)\s*[:#-]?\s*[a-z0-9.-]+/gi),
  ].map((match) => match[0]);
  identityParts.push(...[...batch.matchAll(/\b(?:19|20)\d{2}\b/g)].map((match) => match[0]));

  if (/^\s*(?:[a-z]\d{2,3}|\d{2,3}[a-z])\s*$/i.test(batch)) {
    identityParts.push(batch.trim());
  }

  return [...new Set(identityParts.map((value) => value.trim()).filter(Boolean))].join(" ");
}

function getReferenceNames(bottle) {
  const names = [sanitizeReferenceText(bottle.name)];
  for (const alias of Array.isArray(bottle.aliases) ? bottle.aliases : []) {
    if (/^BTL-\d+$/i.test(String(alias).trim())) continue;
    const nextAlias = sanitizeReferenceText(alias);
    if (nextAlias) names.push(nextAlias);
  }
  return [...new Set(names.filter(Boolean))];
}

function expandSearchAbbreviations(value = "") {
  return SEARCH_ABBREVIATIONS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    String(value),
  ).replace(/\s+/g, " ").trim();
}

function joinDistinctSearchFields(fields) {
  const preparedFields = fields
    .map((field) => String(field ?? "").trim())
    .filter(Boolean)
    .map((value) => ({ value, tokens: tokenize(value) }));
  const values = [];
  const includedTokens = new Set();

  for (const [index, field] of preparedFields.entries()) {
    const { value, tokens } = field;
    const isContainedByLaterField = preparedFields
      .slice(index + 1)
      .some((laterField) => tokens.length && tokens.every((token) => laterField.tokens.includes(token)));
    if (isContainedByLaterField) continue;
    if (tokens.length && tokens.every((token) => includedTokens.has(token))) continue;
    values.push(value);
    for (const token of tokens) includedTokens.add(token);
  }

  return values.join(" ").replace(/\s+/g, " ").trim();
}

function addDiagnostic(diagnostics, entry) {
  if (!Array.isArray(diagnostics) || diagnostics.length >= 40) return;
  diagnostics.push(entry);
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
    ...getReferenceNames(bottle),
    sanitizeReferenceText(bottle.brand),
    sanitizeReferenceText(bottle.line),
    getMeaningfulBatch(bottle),
    getMeaningfulAgeStatement(bottle),
  ].filter(Boolean);
}

function isTooGenericForWineSearcher(bottle) {
  const normalizedName = normalizeText(sanitizeReferenceText(bottle.name));
  const normalizedBrand = normalizeText(sanitizeReferenceText(bottle.brand));
  const nameTokens = tokenize(sanitizeReferenceText(bottle.name));
  const ageTokens = tokenize(getMeaningfulAgeStatement(bottle));
  const batchTokens = tokenize(getMeaningfulBatch(bottle));

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
    ...text.matchAll(/\b(\d{1,3})\s*(?:yo|yr|yrs|year|years|y)\b/gi),
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
      getMeaningfulBatch(bottle),
      getMeaningfulAgeStatement(bottle),
    ].flatMap((value) => extractAgeNumbers(value)),
  );
}

function getCandidateAgeNumbers(candidateText) {
  const normalizedText = normalizeText(candidateText);
  const standaloneAgeCandidates = [...normalizedText.matchAll(/\b([3-9]|[1-4][0-9]|50)\b/g)].map(
    (match) => Number(match[1]),
  );
  return uniqueNumbers([...extractAgeNumbers(candidateText), ...standaloneAgeCandidates]);
}

function getBottleReleaseYears(bottle) {
  return uniqueNumbers(
    extractYearTokens(
      [sanitizeReferenceText(bottle.name), getMeaningfulBatch(bottle), bottle.line].join(" "),
    ),
  );
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
  return extractProductMarkers(
    [sanitizeReferenceText(bottle.name), getMeaningfulBatch(bottle), bottle.line]
      .filter(Boolean)
      .join(" "),
  )
    .filter((marker) => !ageMarkers.has(marker) && !yearMarkers.has(marker));
}

function hasAnyOverlap(leftValues, rightValues) {
  if (!leftValues.length || !rightValues.length) return false;
  const rightSet = new Set(rightValues);
  return leftValues.some((value) => rightSet.has(value));
}

export function getStrictMatchAssessment(bottle, candidateText, options = {}) {
  const text = [candidateText, options.url].filter(Boolean).join(" ");
  const candidateTokens = tokenize(text);
  const candidateTokenSet = new Set(candidateTokens);
  const brandTokens = tokenize(sanitizeReferenceText(bottle.brand));
  const nameAssessments = getReferenceNames(bottle)
    .map((name) => {
      const tokens = tokenize(name);
      return { tokens, score: ratioOverlap(tokens, candidateTokens) };
    })
    .sort((left, right) => right.score - left.score || right.tokens.length - left.tokens.length);
  const nameTokens = nameAssessments[0]?.tokens ?? [];
  const lineTokens = tokenize(sanitizeReferenceText(bottle.line));
  const batchTokens = tokenize(getMeaningfulBatch(bottle));
  const ageTokens = tokenize(getMeaningfulAgeStatement(bottle));

  const brandScore = ratioOverlap(brandTokens, candidateTokens);
  const nameScore = nameAssessments[0]?.score ?? 1;
  const lineScore = ratioOverlap(lineTokens, candidateTokens);
  const batchScore = ratioOverlap(batchTokens, candidateTokens);
  const ageScore = ratioOverlap(ageTokens, candidateTokens);
  const bottleAges = getBottleAgeNumbers(bottle);
  const candidateAges = getCandidateAgeNumbers(text);
  const bottleYears = getBottleReleaseYears(bottle);
  const candidateYears = extractYearTokens(text);
  const bottleProductMarkers = getBottleProductMarkers(bottle);
  const candidateProductMarkers = extractProductMarkers(candidateText);
  const expectedVolume = Number.isFinite(Number(bottle.volume_ml)) ? Number(bottle.volume_ml) : null;
  const matchedVolume = Number.isFinite(Number(options.matchedVolumeMl))
    ? Number(options.matchedVolumeMl)
    : extractVolumeMl(candidateText);
  const reasons = [];

  if (options.candidateName) {
    const bottleIdentityTokens = new Set(buildBottleFields(bottle).flatMap(tokenize));
    const unexpectedQualifiers = tokenize(options.candidateName).filter(
      (token) =>
        DISTINCTIVE_PRODUCT_QUALIFIERS.has(token) && !bottleIdentityTokens.has(token),
    );
    if (unexpectedQualifiers.length) {
      reasons.push(`unexpected product qualifier: ${[...new Set(unexpectedQualifiers)].join(", ")}`);
    }
  }

  const strongNameMatch =
    nameTokens.length === 0 ||
    (nameTokens.length === 1 ? nameScore === 1 : nameTokens.length === 2 ? nameScore === 1 : nameScore >= 0.85);

  if (brandTokens.length && brandScore < 1 && !strongNameMatch) {
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

  if (expectedVolume && matchedVolume && Math.abs(expectedVolume - matchedVolume) > 50) {
    reasons.push("volume mismatch");
  }

  const normalizedBottleName = normalizeText(sanitizeReferenceText(bottle.name));
  const normalizedBrand = normalizeText(sanitizeReferenceText(bottle.brand));
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
    matchedVolumeMl: matchedVolume,
  };
}

function ratioOverlap(requiredTokens, candidateTokens) {
  if (!requiredTokens.length) return 1;
  const candidateSet = new Set(candidateTokens);
  const matched = requiredTokens.filter((token) => candidateSet.has(token)).length;
  return matched / requiredTokens.length;
}

export function getWineSearcherConfidence(bottle, match) {
  const bottleBrandTokens = tokenize(sanitizeReferenceText(bottle.brand));
  const bottleNameTokenVariants = getReferenceNames(bottle).map(tokenize);
  const bottleBatchTokens = tokenize(getMeaningfulBatch(bottle));
  const bottleAgeTokens = tokenize(getMeaningfulAgeStatement(bottle));
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
  const nameScore = Math.max(
    0,
    ...bottleNameTokenVariants.map((tokens) => ratioOverlap(tokens, resultTokens)),
  );
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
        ? 0.5
        : 1;

  const bottleYears = getBottleReleaseYears(bottle);
  const resultYears = extractYearTokens(match.wineName);
  const yearScore =
    bottleYears.length === 0
      ? 1
      : bottleYears.some((year) => resultYears.includes(year))
        ? 1
        : 0;
  const categoryNeedle = normalizeText(bottle.category).replace(/^위스키$/, "whisky");
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
      brandScore * 0.2 +
      nameScore * 0.45 +
      batchScore * 0.1 +
      ageScore * 0.08 +
      volumeScore * 0.05 +
      yearScore * 0.07 +
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
    { tokens: tokenize(sanitizeReferenceText(bottle.brand)), weight: 3 },
    { tokens: tokenize(sanitizeReferenceText(bottle.name)), weight: 2.5 },
    { tokens: tokenize(sanitizeReferenceText(bottle.line)), weight: 1.5 },
    { tokens: tokenize(getMeaningfulBatch(bottle)), weight: 1.5 },
    { tokens: tokenize(getMeaningfulAgeStatement(bottle)), weight: 1.2 },
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

async function fetchSpiritRadarReference(bottle, diagnostics) {
  const urls = await getSpiritRadarBottleUrls();
  const ranked = urls
    .map((url) => ({ url, ...scoreSpiritRadarUrl(url, bottle) }))
    .filter((entry) => entry.score >= 3 && entry.matchedCount >= 2)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  if (!ranked.length) {
    addDiagnostic(diagnostics, { source: "SpiritRadar", status: "no_candidates" });
  }

  for (const candidate of ranked) {
    try {
      const html = await fetchText(candidate.url);
      const { bottleId, product, webpage } = extractSpiritRadarMetadata(html);
      if (!bottleId || !product?.offers?.lowPrice) {
        addDiagnostic(diagnostics, {
          source: "SpiritRadar",
          status: "invalid_result",
          url: candidate.url,
        });
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
        { url: candidate.url, candidateName: product.name || webpage?.name || "" },
      );
      if (!strictMatch.accepted) {
        addDiagnostic(diagnostics, {
          source: "SpiritRadar",
          status: "strict_mismatch",
          reasons: strictMatch.reasons,
          url: candidate.url,
        });
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
        addDiagnostic(diagnostics, {
          source: "SpiritRadar",
          status: "invalid_price",
          url: candidate.url,
        });
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
    } catch (error) {
      addDiagnostic(diagnostics, {
        source: "SpiritRadar",
        status: "source_error",
        message: error instanceof Error ? error.message : "Unknown source error",
        url: candidate.url,
      });
    }
  }

  return null;
}

export function buildWineSearcherQueries(bottle) {
  const uniqueQueries = new Map();
  const brand = sanitizeReferenceText(bottle.brand);
  const batch = getMeaningfulBatch(bottle);
  const ageStatement = getMeaningfulAgeStatement(bottle);

  for (const rawName of getReferenceNames(bottle)) {
    const name = expandSearchAbbreviations(rawName);
    const queries = [
      [name, batch, ageStatement],
      [brand, name],
      [name],
    ];
    for (const fields of queries) {
      const query = joinDistinctSearchFields(fields);
      const key = normalizeText(query);
      if (key && !uniqueQueries.has(key)) uniqueQueries.set(key, query);
    }
  }

  return [...uniqueQueries.values()];
}

async function fetchWineSearcherReference(bottle, diagnostics, options = {}) {
  const apifyApiToken = options.apifyApiToken || APIFY_API_TOKEN;
  if (!apifyApiToken) {
    addDiagnostic(diagnostics, { source: "Wine-Searcher", status: "not_configured" });
    return null;
  }
  if (isTooGenericForWineSearcher(bottle)) {
    addDiagnostic(diagnostics, { source: "Wine-Searcher", status: "too_generic" });
    return null;
  }

  const queries = buildWineSearcherQueries(bottle);
  for (const query of queries) {
    try {
      const payload = await fetchJsonWithTimeout(
        `https://api.apify.com/v2/acts/mrbridge~wine-searcher-scraper-from-list/run-sync-get-dataset-items?token=${encodeURIComponent(apifyApiToken)}&timeout=15`,
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
        addDiagnostic(diagnostics, {
          source: "Wine-Searcher",
          status: "no_price",
          query,
        });
        continue;
      }

      const confidence = getWineSearcherConfidence(bottle, match);
      if (
        confidence.nameScore < 0.65 ||
        (confidence.brandScore <= 0 && confidence.nameScore < 0.9) ||
        confidence.confidence < WINE_SEARCHER_MIN_CONFIDENCE
      ) {
        addDiagnostic(diagnostics, {
          source: "Wine-Searcher",
          status: "low_confidence",
          query,
          confidence: confidence.confidence,
          matchedName: match.wineName || "",
        });
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
        {
          url: match.wineSearcherUrl || "",
          matchedVolumeMl: confidence.matchedVolumeMl,
          candidateName: match.wineName || "",
        },
      );
      if (!strictMatch.accepted) {
        addDiagnostic(diagnostics, {
          source: "Wine-Searcher",
          status: "strict_mismatch",
          query,
          reasons: strictMatch.reasons,
          matchedName: match.wineName || "",
        });
        continue;
      }

      const referencePriceUsd = await convertToUsd(
        Number(match.cheapestPriceAmount),
        String(match.cheapestPriceCurrency ?? "USD").toUpperCase(),
      );
      if (!referencePriceUsd) {
        addDiagnostic(diagnostics, {
          source: "Wine-Searcher",
          status: "invalid_price",
          query,
        });
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
    } catch (error) {
      addDiagnostic(diagnostics, {
        source: "Wine-Searcher",
        status: "source_error",
        query,
        message: error instanceof Error ? error.message : "Unknown source error",
      });
    }
  }

  return null;
}

async function fetchWhiskyFindrReference(bottle, diagnostics) {
  // WhiskyFindr result pages currently expose unrelated dollar amounts that can look
  // like a match. Keep it out of automatic reference sync until result-level parsing
  // can validate the matched product name and price together.
  addDiagnostic(diagnostics, { source: "WhiskyFindr", status: "disabled_unreliable_price" });
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

export function buildBottleBlueBookQueries(bottle) {
  const queries = new Map();
  const brand = sanitizeReferenceText(bottle.brand);
  const batch = getMeaningfulBatch(bottle);
  const ageStatement = getMeaningfulAgeStatement(bottle);

  for (const rawName of getReferenceNames(bottle)) {
    const name = expandSearchAbbreviations(rawName);
    for (const fields of [
      [name, batch, ageStatement],
      [brand, name],
      [name],
    ]) {
      const query = joinDistinctSearchFields(fields);
      const key = normalizeText(query);
      if (key.length >= 3 && !queries.has(key)) {
        queries.set(key, query);
      }
    }
  }

  return [...queries.values()];
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

export function getBottleBlueBookCandidateConfidence(bottle, candidate) {
  const bottleBrandTokens = tokenize(sanitizeReferenceText(bottle.brand));
  const bottleNameTokenVariants = getReferenceNames(bottle).map(tokenize);
  const bottleBatchTokens = tokenize(getMeaningfulBatch(bottle));
  const bottleAgeTokens = tokenize(getMeaningfulAgeStatement(bottle));
  const candidateTokens = tokenize([candidate.title, candidate.text].filter(Boolean).join(" "));
  const normalizedCandidateText = normalizeText([candidate.title, candidate.text].filter(Boolean).join(" "));

  const brandScore = ratioOverlap(bottleBrandTokens, candidateTokens);
  const nameScore = Math.max(
    0,
    ...bottleNameTokenVariants.map((tokens) => ratioOverlap(tokens, candidateTokens)),
  );
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

  const bottleYears = getBottleReleaseYears(bottle);
  const candidateYears = extractYearTokens([candidate.title, candidate.year].join(" "));
  const yearScore =
    bottleYears.length === 0
      ? 1
      : bottleYears.some((year) => candidateYears.includes(year))
        ? 1
        : 0;

  const categoryNeedle = normalizeText(bottle.category).replace(/^위스키$/, "whisky");
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
      brandScore * 0.18 +
      nameScore * 0.45 +
      batchScore * 0.08 +
      ageScore * 0.07 +
      proofScore * 0.08 +
      volumeScore * 0.05 +
      yearScore * 0.05 +
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

async function fetchBottleBlueBookReference(bottle, diagnostics) {
  const category = normalizeText(bottle.category);
  if (["rum", "tequila", "sake", "other spirits"].includes(category)) {
    addDiagnostic(diagnostics, { source: "BottleBlueBook", status: "unsupported_category" });
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

      if (!candidates.length) {
        addDiagnostic(diagnostics, { source: "BottleBlueBook", status: "no_candidates", query });
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
            { url: candidate.url, candidateName: candidate.title },
          ).accepted,
        )
        .sort((left, right) => right.confidence.confidence - left.confidence.confidence)
        .slice(0, 3);

      if (candidates.length && !ranked.length) {
        addDiagnostic(diagnostics, {
          source: "BottleBlueBook",
          status: "no_qualified_candidates",
          query,
        });
      }

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
          { url: candidate.url, candidateName: detail.title || candidate.title },
        );

        if (
          !detail.referencePriceUsd ||
          detailConfidence.confidence < 0.78 ||
          !strictDetailMatch.accepted
        ) {
          addDiagnostic(diagnostics, {
            source: "BottleBlueBook",
            status: !detail.referencePriceUsd ? "invalid_price" : "strict_mismatch",
            query,
            confidence: detailConfidence.confidence,
            reasons: strictDetailMatch.reasons,
            matchedName: detail.title || candidate.title,
          });
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
    } catch (error) {
      addDiagnostic(diagnostics, {
        source: "BottleBlueBook",
        status: "source_error",
        query,
        message: error instanceof Error ? error.message : "Unknown source error",
      });
    }
  }

  return null;
}

export async function resolveExternalReferencePrice(bottle, options = {}) {
  const diagnostics = options.diagnostics;
  for (const source of SOURCE_PRIORITY) {
    if (source === "Wine-Searcher") {
      const result = await fetchWineSearcherReference(bottle, diagnostics, options);
      if (result) return result;
    }

    if (source === "WhiskyFindr") {
      const result = await fetchWhiskyFindrReference(bottle, diagnostics);
      if (result) return result;
    }

    if (source === "SpiritRadar") {
      const result = await fetchSpiritRadarReference(bottle, diagnostics);
      if (result) return result;
    }

    if (source === "BottleBlueBook") {
      const result = await fetchBottleBlueBookReference(bottle, diagnostics);
      if (result) return result;
    }
  }

  return null;
}

function getDistinctiveBatchTokens(bottle) {
  const nameTokens = new Set(getReferenceNames(bottle).flatMap(tokenize));
  const ageTokens = new Set(tokenize(getMeaningfulAgeStatement(bottle)));
  return tokenize(getMeaningfulBatch(bottle)).filter(
    (token) => !nameTokens.has(token) && !ageTokens.has(token),
  );
}

export function isReusableBottleMatch(targetBottle, candidateBottle) {
  const targetNames = new Set(getReferenceNames(targetBottle).map(normalizeText));
  const candidateNames = new Set(getReferenceNames(candidateBottle).map(normalizeText));
  if (![...targetNames].some((name) => candidateNames.has(name))) return false;

  const targetVolume = Number(targetBottle.volume_ml);
  const candidateVolume = Number(candidateBottle.volume_ml);
  if (
    Number.isFinite(targetVolume) &&
    Number.isFinite(candidateVolume) &&
    Math.abs(targetVolume - candidateVolume) > 50
  ) {
    return false;
  }

  const targetAges = getBottleAgeNumbers(targetBottle);
  const candidateAges = getBottleAgeNumbers(candidateBottle);
  if (targetAges.length || candidateAges.length) {
    if (!hasAnyOverlap(targetAges, candidateAges)) return false;
  }

  const targetYears = getBottleReleaseYears(targetBottle);
  const candidateYears = getBottleReleaseYears(candidateBottle);
  if (targetYears.length || candidateYears.length) {
    if (!hasAnyOverlap(targetYears, candidateYears)) return false;
  }

  const targetMarkers = getBottleProductMarkers(targetBottle);
  const candidateMarkers = getBottleProductMarkers(candidateBottle);
  if (targetMarkers.length || candidateMarkers.length) {
    if (!hasAnyOverlap(targetMarkers, candidateMarkers)) return false;
  }

  const targetBatchTokens = getDistinctiveBatchTokens(targetBottle);
  const candidateBatchTokens = getDistinctiveBatchTokens(candidateBottle);
  if (targetBatchTokens.length || candidateBatchTokens.length) {
    if (!hasAnyOverlap(targetBatchTokens, candidateBatchTokens)) return false;
  }

  return true;
}

function normalizeReferenceSource(source = "") {
  return normalizeText(source).replace(/\s+/g, "");
}

function getSourceIdentityText(sourceUrl = "") {
  try {
    const url = new URL(sourceUrl);
    return decodeURIComponent(url.pathname).replace(/[+/_-]+/g, " ");
  } catch {
    return "";
  }
}

function isReusableReferenceRow(reference, bottle) {
  const source = normalizeReferenceSource(reference.source);
  const updatedAt = Date.parse(reference.updated_at);
  const ageMs = Date.now() - updatedAt;
  const sourceIdentityText = getSourceIdentityText(reference.source_url);
  const sourceMatch = sourceIdentityText
    ? getStrictMatchAssessment(bottle, sourceIdentityText, { candidateName: sourceIdentityText })
    : { accepted: false };
  return (
    REUSABLE_REFERENCE_SOURCES.has(source) &&
    Number(reference.reference_price_usd) > 0 &&
    /^https?:\/\//i.test(String(reference.source_url ?? "")) &&
    Number.isFinite(updatedAt) &&
    ageMs <= REUSABLE_REFERENCE_MAX_AGE_MS &&
    sourceMatch.accepted
  );
}

async function findReusableExternalReference(supabase, bottle, diagnostics) {
  const [{ data: bottles, error: bottlesError }, { data: references, error: referencesError }] =
    await Promise.all([
      supabase
        .from("bottles")
        .select("id,name,brand,category,line,batch,age_statement,volume_ml,aliases")
        .neq("id", bottle.id)
        .limit(2000),
      supabase
        .from("bottle_reference_prices")
        .select(
          "bottle_id,source,reference_price_usd,reference_price_6m_ago,reference_change_percent,source_url,updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(5000),
    ]);

  if (bottlesError || referencesError) {
    addDiagnostic(diagnostics, {
      source: "existing_reference",
      status: "lookup_error",
      message: bottlesError?.message || referencesError?.message || "Unable to load reusable references",
    });
    return null;
  }

  if ((references ?? []).some((row) => String(row.bottle_id) === String(bottle.id))) {
    return null;
  }

  const reusableBottleIds = new Set(
    (bottles ?? [])
      .filter((candidate) => isReusableBottleMatch(bottle, candidate))
      .map((candidate) => String(candidate.id)),
  );

  const sourceRank = new Map(
    SOURCE_PRIORITY.map((source, index) => [normalizeReferenceSource(source), index]),
  );
  const reference = (references ?? [])
    .filter(
      (row) => {
        const sourceBottle = (bottles ?? []).find(
          (candidate) => String(candidate.id) === String(row.bottle_id),
        );
        return (
          reusableBottleIds.has(String(row.bottle_id)) &&
          sourceBottle &&
          isReusableReferenceRow(row, sourceBottle)
        );
      },
    )
    .sort((left, right) => {
      const sourceDifference =
        (sourceRank.get(normalizeReferenceSource(left.source)) ?? 99) -
        (sourceRank.get(normalizeReferenceSource(right.source)) ?? 99);
      if (sourceDifference) return sourceDifference;
      return Date.parse(right.updated_at) - Date.parse(left.updated_at);
    })[0];

  if (!reference) {
    addDiagnostic(diagnostics, { source: "existing_reference", status: "no_exact_match" });
    return null;
  }

  return {
    reusedFromBottleId: reference.bottle_id,
    reference: {
      bottle_id: bottle.id,
      source: reference.source,
      reference_price_usd: Number(reference.reference_price_usd),
      reference_price_6m_ago: Number(
        reference.reference_price_6m_ago ?? reference.reference_price_usd,
      ),
      reference_change_percent: Number(reference.reference_change_percent ?? 0),
      source_url: reference.source_url,
      updated_at: reference.updated_at,
    },
  };
}

async function replaceBottleReferencePrice(supabase, bottleId, referenceRow) {
  const {
    confidence_score,
    matched_name,
    matched_volume_ml,
    ...dbRow
  } = referenceRow;

  const { data: insertedRow, error } = await supabase
    .from("bottle_reference_prices")
    .insert(dbRow)
    .select("id")
    .single();
  if (error) {
    if (error.message?.includes("Could not find the table 'public.bottle_reference_prices'")) {
      throw new Error(
        "The Supabase table public.bottle_reference_prices does not exist yet. Apply the latest schema before running reference sync.",
      );
    }
    throw new Error(`Unable to save reference price for ${bottleId}: ${error.message}`);
  }

  const { error: cleanupError } = await supabase
    .from("bottle_reference_prices")
    .delete()
    .eq("bottle_id", bottleId)
    .neq("id", insertedRow.id);
  if (cleanupError) {
    throw new Error(
      `Saved the new reference price but could not remove older rows for ${bottleId}: ${cleanupError.message}`,
    );
  }
}

export async function syncBottleReferencePrice(supabase, bottleId, options = {}) {
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

  if (options.onlyIfMissing) {
    const { data: existingReferences, error: existingReferenceError } = await supabase
      .from("bottle_reference_prices")
      .select("source,reference_price_usd,source_url,updated_at")
      .eq("bottle_id", bottle.id)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (existingReferenceError) {
      throw new Error(
        `Unable to check the existing reference price for ${bottle.id}: ${existingReferenceError.message}`,
      );
    }
    const existingReference = existingReferences?.[0];
    if (existingReference) {
      return {
        matched: true,
        detail: {
          bottleId: bottle.id,
          bottleName: bottle.name,
          source: existingReference.source,
          referencePriceUsd: Number(existingReference.reference_price_usd),
          confidenceScore: null,
          matchedName: null,
          matchedVolumeMl: null,
          matchMethod: "existing_reference",
          reusedFromBottleId: null,
          diagnostics: [],
          dryRun: Boolean(options.dryRun),
          skipped: true,
        },
      };
    }
  }

  const diagnostics = [];
  const reusedReference = await findReusableExternalReference(supabase, bottle, diagnostics);
  const reference =
    reusedReference?.reference ??
    (options.reuseOnly
      ? null
      : await resolveExternalReferencePrice(bottle, {
          diagnostics,
          apifyApiToken: options.apifyApiToken,
        }));

  if (reference) {
    if (!options.dryRun) {
      await replaceBottleReferencePrice(supabase, bottle.id, reference);
    }
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
        matchMethod: reusedReference ? "existing_external_reference" : "external_lookup",
        reusedFromBottleId: reusedReference?.reusedFromBottleId ?? null,
        diagnostics,
        dryRun: Boolean(options.dryRun),
      },
    };
  }

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
      matchMethod: null,
      reusedFromBottleId: null,
      diagnostics,
      dryRun: Boolean(options.dryRun),
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
