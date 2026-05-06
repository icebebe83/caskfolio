import type { Bottle, SpiritCategory } from "@/lib/types";

type BottleIdentityFields = {
  category?: SpiritCategory | string;
  name?: string;
  brand?: string;
  batch?: string;
  ageStatement?: string;
  abv?: number | string;
  volumeMl?: number | string;
};

export function normalizeBottleIdentityText(value?: string | null): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBottleIdentityNumber(value?: number | string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return Number(numeric.toFixed(1)).toString();
}

export function getBottleIdentityKey(fields: BottleIdentityFields): string {
  return [...getBottleBaseIdentityParts(fields), normalizeBottleIdentityText(fields.batch)].join("|");
}

function getBottleBaseIdentityParts(fields: BottleIdentityFields): string[] {
  return [
    normalizeBottleIdentityText(fields.category),
    normalizeBottleIdentityText(fields.brand),
    normalizeBottleIdentityText(fields.name),
    normalizeBottleIdentityText(fields.ageStatement),
    normalizeBottleIdentityNumber(fields.abv),
    normalizeBottleIdentityNumber(fields.volumeMl),
  ];
}

export function getBottleBaseIdentityKey(fields: BottleIdentityFields): string {
  return getBottleBaseIdentityParts(fields).join("|");
}

export function getBottleBatchIdentityPart(fields: BottleIdentityFields): string {
  return normalizeBottleIdentityText(fields.batch);
}

export function getBottleCanonicalKey(bottle: Bottle): string {
  return getBottleIdentityKey({
    category: bottle.category,
    brand: bottle.brand,
    name: bottle.name,
    batch: bottle.batch,
    ageStatement: bottle.ageStatement,
    abv: bottle.abv,
    volumeMl: bottle.volumeMl,
  });
}

export function getEquivalentBottleGroup(bottles: Bottle[], target: Bottle): Bottle[] {
  const baseKey = getBottleBaseIdentityKey(target);
  const sameBaseBottles = bottles.filter((bottle) => getBottleBaseIdentityKey(bottle) === baseKey);
  const nonBlankBatches = new Set(
    sameBaseBottles.map(getBottleBatchIdentityPart).filter(Boolean),
  );

  if (nonBlankBatches.size <= 1) {
    return sameBaseBottles;
  }

  const targetBatch = getBottleBatchIdentityPart(target);
  return sameBaseBottles.filter((bottle) => getBottleBatchIdentityPart(bottle) === targetBatch);
}

export function isSameBottleIdentity(left: BottleIdentityFields, right: BottleIdentityFields): boolean {
  return getBottleIdentityKey(left) === getBottleIdentityKey(right);
}
