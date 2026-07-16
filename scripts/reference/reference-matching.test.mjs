import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBottleBlueBookQueries,
  buildWineSearcherQueries,
  getBottleBlueBookCandidateConfidence,
  getStrictMatchAssessment,
  isReusableBottleMatch,
  sanitizeReferenceText,
} from "./sync-reference-prices.mjs";

const ballantines12 = {
  name: "Ballantine's 12 Year Old",
  brand: "Ballantine's",
  category: "Whisky",
  line: "",
  age_statement: "12 Years",
  batch: "New Label",
  volume_ml: 1000,
  aliases: [],
};

test("presentation metadata and NAS do not become identity constraints", () => {
  const bottle = {
    name: "Blanton's Gold Edition",
    brand: "Buffalo Trace",
    category: "Bourbon",
    line: "",
    age_statement: "NAS(6~8 years)",
    batch: "2-9-22 / L8 · New Label",
    volume_ml: 700,
    aliases: [],
  };

  const assessment = getStrictMatchAssessment(
    bottle,
    "Blanton's Gold Edition Kentucky Straight Bourbon 700ml",
  );

  assert.equal(assessment.accepted, true);
  for (const query of [...buildWineSearcherQueries(bottle), ...buildBottleBlueBookQueries(bottle)]) {
    assert.doesNotMatch(query, /NAS|New Label|L8/i);
  }
});

test("age, release, batch marker, and volume mismatches remain blocked", () => {
  assert.equal(
    getStrictMatchAssessment(
      ballantines12,
      "Ballantine's 21 Year Old Scotch Whisky 1000ml",
    ).accepted,
    false,
  );

  const stagg = {
    name: "Stagg Jr. Batch 25D (129.2 Proof)",
    brand: "Stagg",
    category: "Bourbon",
    line: "",
    age_statement: "NAS",
    batch: "Batch 25D · New Label",
    volume_ml: 750,
    aliases: [],
  };
  assert.equal(
    getStrictMatchAssessment(stagg, "Stagg Jr Batch 25B 130 Proof 750ml").accepted,
    false,
  );
  assert.equal(
    getStrictMatchAssessment(
      ballantines12,
      "Ballantine's 12 Year Old Scotch Whisky 700ml",
    ).accepted,
    false,
  );
});

test("an exact product name can override a parent-company brand mismatch", () => {
  const bottle = {
    name: "George T. Stagg 2025",
    brand: "Buffalo Trace Distillery",
    category: "Bourbon",
    line: "",
    age_statement: "NAS",
    batch: "2025 · New Label",
    volume_ml: 750,
    aliases: [],
  };

  assert.equal(
    getStrictMatchAssessment(
      bottle,
      "George T Stagg 2025 Kentucky Straight Bourbon Whiskey 750ml",
    ).accepted,
    true,
  );
});

test("verified references are reusable only for the same bottle identity", () => {
  assert.equal(
    isReusableBottleMatch(
      { ...ballantines12, batch: "Old Label" },
      { ...ballantines12, batch: "New Label" },
    ),
    true,
  );
  assert.equal(
    isReusableBottleMatch(
      { ...ballantines12, volume_ml: 1000 },
      { ...ballantines12, volume_ml: 750 },
    ),
    false,
  );
  assert.equal(
    isReusableBottleMatch(
      { ...ballantines12, name: "Macallan 18 Sherry Oak 2017", batch: "2017" },
      { ...ballantines12, name: "Macallan 18 Sherry Oak 2018", batch: "2018" },
    ),
    false,
  );
});

test("presentation text sanitizer keeps the actual product name", () => {
  assert.equal(
    sanitizeReferenceText("Hibiki 17 Year Old New Bottle · Empty Bottle"),
    "Hibiki 17 Year Old",
  );
});

test("common catalog abbreviations and spelling variants normalize for matching", () => {
  const bottle = {
    name: "FourRoses SB",
    brand: "FourRoses",
    category: "Bourbon",
    line: "",
    age_statement: "NAS",
    batch: ".",
    volume_ml: 750,
    aliases: [],
  };

  assert.equal(
    getStrictMatchAssessment(
      bottle,
      "Four Roses Single Barrel Kentucky Straight Bourbon 750ml",
    ).accepted,
    true,
  );
  assert.deepEqual(buildWineSearcherQueries(bottle), ["FourRoses single barrel"]);

  const confidence = getBottleBlueBookCandidateConfidence(bottle, {
    title: "Four Roses Single Barrel",
    text: "Four Roses Single Barrel Bourbon 100 Proof 750 mL",
    proof: 100,
    volumeMl: 750,
    year: "",
    url: "https://bottlebluebook.com/bottle/four-roses-single-barrel",
  });
  assert.equal(confidence.confidence, 1);
});

test("source URL wording still has to identify the same product", () => {
  const glenAllachie = {
    name: "GlenAllachie 15 Year Old Old Bottle",
    brand: "GlenAllachie",
    category: "Whisky",
    line: "",
    age_statement: "15 Years",
    batch: "Old Label",
    volume_ml: 700,
    aliases: [],
  };
  assert.equal(
    getStrictMatchAssessment(
      glenAllachie,
      "find the glen allachie fifteen old single malt scotch whisky speyside scotland",
    ).accepted,
    true,
  );

  const hibiki17 = {
    name: "Hibiki 17 Year Old Old Bottle",
    brand: "Hibiki",
    category: "Whisky",
    line: "",
    age_statement: "17 Years",
    batch: "Old Label",
    volume_ml: 700,
    aliases: [],
  };
  assert.equal(
    getStrictMatchAssessment(
      hibiki17,
      "hibiki japanese harmony 30th anniversary 43 700ml",
    ).accepted,
    false,
  );
});

test("an unexpected product qualifier blocks an otherwise similar title", () => {
  const bottle = {
    name: "Blanton's Gold Edition",
    brand: "Buffalo Trace",
    category: "Bourbon",
    line: "",
    age_statement: "NAS",
    batch: "New Label",
    volume_ml: 700,
    aliases: [],
  };

  assert.equal(
    getStrictMatchAssessment(
      bottle,
      "Blanton's Takara Gold Edition Bourbon 750ml",
      { candidateName: "Blanton's Takara Gold Edition" },
    ).accepted,
    false,
  );
  assert.equal(
    getStrictMatchAssessment(
      bottle,
      "Blanton's Gold Edition Bourbon 700ml",
      { candidateName: "Blanton's Gold Edition" },
    ).accepted,
    true,
  );
});
