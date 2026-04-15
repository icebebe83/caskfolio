import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

import { loadProjectEnv } from "../shared/load-env.mjs";

loadProjectEnv();

const workbookPath =
  process.argv[2] ?? "/Users/darren/Desktop/Whisky image/whisky_catalog_final.xlsx";
const imageDir =
  process.argv[3] ?? "/Users/darren/Desktop/vibe cording/liquor v.Codex/Whisky-image";
const maxExternalId = Number(process.argv[4] ?? 120);
const STORAGE_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "caskindex-images";
const DEFAULT_REGISTER_BOTTLE_IMAGE = "/register-default-bottle.png";
const MASTER_IMAGE_WIDTH = 1400;
const MASTER_PREVIEW_WIDTH = 800;
const IMPORT_NOTE_PREFIX = "Imported catalog reference";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

if (!fs.existsSync(workbookPath)) {
  throw new Error(`Workbook not found: ${workbookPath}`);
}

if (!fs.existsSync(imageDir)) {
  throw new Error(`Image directory not found: ${imageDir}`);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeCategory(value) {
  const category = normalizeText(value);
  if (category === "ETC") return "Etc";
  if (["Bourbon", "Whisky", "Rum", "Tequila", "Etc"].includes(category)) return category;
  return "Whisky";
}

const PACKAGING_BATCH_PATTERNS = [
  /\bold bottle\b/i,
  /\blatest bottle\b/i,
  /\bnew bottle\b/i,
  /\bold label\b/i,
  /\bnew label\b/i,
];

function normalizeBottleBatch(value, bottleName = "") {
  const batch = normalizeText(value);
  const name = normalizeText(bottleName).toLowerCase();
  if (!batch) return "";
  if (PACKAGING_BATCH_PATTERNS.some((pattern) => pattern.test(batch))) {
    return "";
  }
  if (name && name.includes(batch.toLowerCase())) {
    return "";
  }
  return batch;
}

function toSignature(name, brand, batch) {
  return [name, brand, batch]
    .map((value) => normalizeText(value).toLowerCase())
    .join("|");
}

function parsePriceKrw(value) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  const parsed = Number(digits);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid price value: ${value}`);
  }
  return parsed;
}

function formatAgeStatement(value) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return `${numeric} Year${numeric > 1 ? "s" : ""}`;
  }
  return normalizeText(value);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}

function listImageFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => /^BTL-\d+/i.test(name))
    .reduce((map, name) => {
      map.set(name, path.join(dir, name));
      return map;
    }, new Map());
}

function findImagePath(row, fileMap) {
  const candidates = [];
  const externalId = normalizeText(row.external_id);
  const masterImage = normalizeText(row.master_image);

  if (masterImage && masterImage.toLowerCase() !== "delete") {
    candidates.push(masterImage);
    if (!path.extname(masterImage)) {
      for (const ext of [".jpg", ".jpeg", ".png", ".webp", ".avif"]) {
        candidates.push(`${masterImage}${ext}`);
      }
    }
  }

  for (const ext of [".jpg", ".jpeg", ".png", ".webp", ".avif"]) {
    candidates.push(`${externalId}${ext}`);
  }

  for (const candidate of candidates) {
    if (fileMap.has(candidate)) {
      return fileMap.get(candidate);
    }
  }

  return null;
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "caskfolio-import-"));
}

function convertToJpeg(inputPath, outputPath, targetWidth) {
  execFileSync(
    "sips",
    ["-s", "format", "jpeg", "-Z", String(targetWidth), inputPath, "--out", outputPath],
    { stdio: "ignore" },
  );
}

async function uploadBottleMasterImages(bottleId, sourceImagePath) {
  const tempDir = createTempDir();
  const masterPath = path.join(tempDir, "main.jpg");
  const previewPath = path.join(tempDir, "preview.jpg");

  try {
    convertToJpeg(sourceImagePath, masterPath, MASTER_IMAGE_WIDTH);
    convertToJpeg(sourceImagePath, previewPath, MASTER_PREVIEW_WIDTH);

    const masterBuffer = fs.readFileSync(masterPath);
    const previewBuffer = fs.readFileSync(previewPath);

    const masterStoragePath = `bottles/${bottleId}/master/main.jpg`;
    const previewStoragePath = `bottles/${bottleId}/master/preview.jpg`;

    const [{ error: masterError }, { error: previewError }] = await Promise.all([
      supabase.storage.from(STORAGE_BUCKET).upload(masterStoragePath, masterBuffer, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
        upsert: true,
      }),
      supabase.storage.from(STORAGE_BUCKET).upload(previewStoragePath, previewBuffer, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
        upsert: true,
      }),
    ]);

    if (masterError) throw new Error(masterError.message);
    if (previewError) throw new Error(previewError.message);

    return {
      masterImageUrl: supabase.storage.from(STORAGE_BUCKET).getPublicUrl(masterStoragePath).data.publicUrl,
      masterPreviewImageUrl: supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(previewStoragePath).data.publicUrl,
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function readWorkbookRows(excelFile, maxId) {
  const python = `
import json
from openpyxl import load_workbook

wb = load_workbook(${JSON.stringify(excelFile)}, read_only=True, data_only=True)
ws = wb["bottles"]
headers = [cell for cell in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]
rows = []
for row in ws.iter_rows(min_row=2, values_only=True):
    record = dict(zip(headers, row))
    ext_id = record.get("external_id")
    if not isinstance(ext_id, str) or not ext_id.startswith("BTL-"):
        continue
    if int(ext_id.split("-")[1]) > ${maxId}:
        continue
    rows.append(record)
print(json.dumps(rows, ensure_ascii=False))
`;

  const output = execFileSync("python3", ["-c", python], { encoding: "utf8" });
  return JSON.parse(output);
}

async function fetchAdminUserId() {
  const { data, error } = await supabase
    .from("admins")
    .select("user_id")
    .limit(1)
    .maybeSingle();

  if (error || !data?.user_id) {
    throw new Error("No admin user found. Create an admin profile before importing.");
  }

  return data.user_id;
}

async function fetchExistingBottles() {
  const { data, error } = await supabase.from("bottles").select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchExistingImportedListings() {
  const { data, error } = await supabase
    .from("listings")
    .select("id, bottle_id, note")
    .ilike("note", `${IMPORT_NOTE_PREFIX}%`);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchFxRate() {
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
    if (!response.ok) throw new Error(`FX fetch failed (${response.status})`);
    const payload = await response.json();
    const rate = Number(payload?.rates?.KRW ?? 0);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Invalid FX rate");
    return rate;
  } catch {
    return 1450;
  }
}

function pickPrimaryBottle(rows) {
  return [...rows].sort((left, right) => {
    const leftAlias = [...(left.aliases ?? [])].sort()[0] ?? "";
    const rightAlias = [...(right.aliases ?? [])].sort()[0] ?? "";
    return leftAlias.localeCompare(rightAlias) || left.id.localeCompare(right.id);
  })[0];
}

async function mergeImportedBottleDuplicates() {
  const importedBottles = (await fetchExistingBottles()).filter((row) =>
    (row.aliases ?? []).some((alias) => /^BTL-\d{4}$/i.test(String(alias))),
  );
  const grouped = new Map();

  for (const row of importedBottles) {
    const canonicalBatch = normalizeBottleBatch(row.batch, row.name);
    const signature = toSignature(row.name, row.brand, canonicalBatch);
    const current = grouped.get(signature) ?? [];
    current.push(row);
    grouped.set(signature, current);
  }

  let mergedBottleRows = 0;

  for (const rows of grouped.values()) {
    if (rows.length <= 1) continue;

    const primary = pickPrimaryBottle(rows);
    const duplicates = rows.filter((row) => row.id !== primary.id);
    const mergedAliases = uniqueStrings(rows.flatMap((row) => row.aliases ?? []));
    const canonicalBatch = normalizeBottleBatch(primary.batch, primary.name);
    const preferredImageSource =
      rows.find((row) => row.master_preview_image_url && row.master_preview_image_url !== DEFAULT_REGISTER_BOTTLE_IMAGE) ??
      rows.find((row) => row.master_image_url && row.master_image_url !== DEFAULT_REGISTER_BOTTLE_IMAGE) ??
      primary;

    const { error: updatePrimaryError } = await supabase
      .from("bottles")
      .update({
        aliases: mergedAliases,
        batch: canonicalBatch,
        master_image_url: preferredImageSource.master_image_url || DEFAULT_REGISTER_BOTTLE_IMAGE,
        master_preview_image_url:
          preferredImageSource.master_preview_image_url ||
          preferredImageSource.master_image_url ||
          DEFAULT_REGISTER_BOTTLE_IMAGE,
        image_url:
          preferredImageSource.master_preview_image_url ||
          preferredImageSource.master_image_url ||
          DEFAULT_REGISTER_BOTTLE_IMAGE,
        updated_at: new Date().toISOString(),
      })
      .eq("id", primary.id);

    if (updatePrimaryError) {
      throw new Error(`Failed to update merged bottle ${primary.id}: ${updatePrimaryError.message}`);
    }

    for (const duplicate of duplicates) {
      const { error: reassignError } = await supabase
        .from("listings")
        .update({ bottle_id: primary.id })
        .eq("bottle_id", duplicate.id);

      if (reassignError) {
        throw new Error(`Failed to reassign listings from ${duplicate.id}: ${reassignError.message}`);
      }

      const { error: deleteError } = await supabase.from("bottles").delete().eq("id", duplicate.id);
      if (deleteError) {
        throw new Error(`Failed to delete duplicate bottle ${duplicate.id}: ${deleteError.message}`);
      }

      mergedBottleRows += 1;
    }
  }

  return mergedBottleRows;
}

async function main() {
  const rows = readWorkbookRows(workbookPath, maxExternalId);
  const fileMap = listImageFiles(imageDir);
  const adminUserId = await fetchAdminUserId();
  const fxRate = await fetchFxRate();
  const existingBottleRows = await fetchExistingBottles();
  const importedListingRows = await fetchExistingImportedListings();

  const bottleByAlias = new Map();
  const bottleBySignature = new Map();
  for (const row of existingBottleRows) {
    for (const alias of row.aliases ?? []) {
      bottleByAlias.set(normalizeText(alias), row);
    }
    bottleBySignature.set(
      toSignature(row.name, row.brand, normalizeBottleBatch(row.batch, row.name)),
      row,
    );
  }

  const listingByNote = new Map(
    importedListingRows.map((row) => [normalizeText(row.note), row]),
  );

  let createdBottles = 0;
  let updatedBottles = 0;
  let createdListings = 0;
  let updatedListings = 0;
  let uploadedImages = 0;
  let mergedBottleRows = 0;
  const fallbackImages = [];

  for (const row of rows) {
    const externalId = normalizeText(row.external_id);
    const name = normalizeText(row.name);
    const brand = normalizeText(row.brand);
    const category = normalizeCategory(row.category);
    const batch = normalizeBottleBatch(row.batch, name);
    const ageStatement = formatAgeStatement(row.age);
    const abv = toNumber(row.abv, 0);
    const volumeMl = toNumber(row.volume_ml, 750);
    const priceKrw = parsePriceKrw(row.price);
    const normalizedPriceUsd = Number((priceKrw / fxRate).toFixed(2));
    const signature = toSignature(name, brand, batch);
    const imagePath = findImagePath(row, fileMap);

    let bottle =
      bottleByAlias.get(externalId) ??
      bottleBySignature.get(signature) ??
      null;

    const aliases = uniqueStrings([...(bottle?.aliases ?? []), externalId]);
    const baseBottlePayload = {
      category,
      name,
      brand,
      line: normalizeText(bottle?.line ?? ""),
      batch,
      age_statement: ageStatement,
      abv,
      volume_ml: volumeMl,
      aliases,
      updated_at: new Date().toISOString(),
    };

    if (bottle) {
      const { data, error } = await supabase
        .from("bottles")
        .update(baseBottlePayload)
        .eq("id", bottle.id)
        .select("*")
        .single();
      if (error || !data) throw new Error(`Bottle update failed for ${externalId}: ${error?.message ?? "unknown error"}`);
      bottle = data;
      updatedBottles += 1;
    } else {
      const { data, error } = await supabase
        .from("bottles")
        .insert({
          ...baseBottlePayload,
          hot_bottle: false,
          master_image_url: DEFAULT_REGISTER_BOTTLE_IMAGE,
          master_preview_image_url: DEFAULT_REGISTER_BOTTLE_IMAGE,
          image_url: DEFAULT_REGISTER_BOTTLE_IMAGE,
        })
        .select("*")
        .single();
      if (error || !data) throw new Error(`Bottle insert failed for ${externalId}: ${error?.message ?? "unknown error"}`);
      bottle = data;
      createdBottles += 1;
    }

    bottleByAlias.set(externalId, bottle);
    bottleBySignature.set(signature, bottle);

    if (imagePath) {
      const imageUrls = await uploadBottleMasterImages(bottle.id, imagePath);
      const { error } = await supabase
        .from("bottles")
        .update({
          master_image_url: imageUrls.masterImageUrl,
          master_preview_image_url: imageUrls.masterPreviewImageUrl,
          image_url: imageUrls.masterPreviewImageUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", bottle.id);
      if (error) throw new Error(`Bottle image update failed for ${externalId}: ${error.message}`);
      uploadedImages += 1;
      bottle.master_image_url = imageUrls.masterImageUrl;
      bottle.master_preview_image_url = imageUrls.masterPreviewImageUrl;
      bottle.image_url = imageUrls.masterPreviewImageUrl;
    } else {
      fallbackImages.push(externalId);
    }

    const note = `${IMPORT_NOTE_PREFIX} ${externalId}`;
    const existingListing = listingByNote.get(note) ?? null;
    const listingPayload = {
      bottle_id: bottle.id,
      bottle_name: name,
      category,
      user_id: adminUserId,
      price: priceKrw,
      currency: "KRW",
      fx_rate_at_entry: fxRate,
      normalized_price_usd: normalizedPriceUsd,
      approx_price_krw: priceKrw,
      quantity: 1,
      condition: "",
      region: "",
      messenger_type: null,
      messenger_handle: null,
      telegram_id: "",
      note,
      original_images: [],
      thumbnail_images: [],
      image_url: bottle.master_preview_image_url || bottle.image_url || DEFAULT_REGISTER_BOTTLE_IMAGE,
      status: "inactive",
      updated_at: new Date().toISOString(),
    };

    if (existingListing) {
      const { data, error } = await supabase
        .from("listings")
        .update(listingPayload)
        .eq("id", existingListing.id)
        .select("id, bottle_id, note")
        .single();
      if (error || !data) throw new Error(`Listing update failed for ${externalId}: ${error?.message ?? "unknown error"}`);
      listingByNote.set(note, data);
      updatedListings += 1;
    } else {
      const { data, error } = await supabase
        .from("listings")
        .insert(listingPayload)
        .select("id, bottle_id, note")
        .single();
      if (error || !data) throw new Error(`Listing insert failed for ${externalId}: ${error?.message ?? "unknown error"}`);
      listingByNote.set(note, data);
      createdListings += 1;
    }
  }

  mergedBottleRows = await mergeImportedBottleDuplicates();

  console.log(
    JSON.stringify(
      {
        importedRows: rows.length,
        createdBottles,
        updatedBottles,
        createdListings,
        updatedListings,
        uploadedImages,
        mergedBottleRows,
        fallbackImages,
        fxRate,
      },
      null,
      2,
    ),
  );
}

await main();
