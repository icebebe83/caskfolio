import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {
  assertSafeRemoteUrl,
  collectArticles,
  fetchExistingUrls,
  fetchPublishedArticles,
  fetchRemoteBytes,
  isAllowedRasterContentType,
  mapWithConcurrency,
} from "./import-news.mjs";

test("production core does not statically import CLI filesystem or environment helpers", async () => {
  const source = await fs.readFile(new URL("./import-news.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(
    source,
    /node:(?:fs|path|url)|load-env|news-image-utils|public\/news-thumbs|\.env\.local/,
  );
});

test("assertSafeRemoteUrl accepts public HTTP URLs", () => {
  assert.equal(assertSafeRemoteUrl("https://example.com/news").toString(), "https://example.com/news");
});

test("assertSafeRemoteUrl rejects local, private, credentialed, and non-HTTP URLs", () => {
  for (const value of [
    "http://localhost/admin",
    "http://localhost./admin",
    "http://service.localdomain/admin",
    "http://127.0.0.1/admin",
    "http://10.0.0.8/admin",
    "http://172.16.1.2/admin",
    "http://192.168.1.2/admin",
    "http://[::1]/admin",
    "http://[fec0::1]/admin",
    "http://[ff02::1]/admin",
    "https://user:secret@example.com/news",
    "file:///etc/passwd",
  ]) {
    assert.throws(() => assertSafeRemoteUrl(value), value);
  }
});

test("fetchRemoteBytes blocks redirects to private literal addresses", async () => {
  let fetchCount = 0;
  await assert.rejects(
    fetchRemoteBytes("https://example.com/image.jpg", {
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data" },
        });
      },
      headers: {},
      maxBytes: 1024,
      timeoutMs: 100,
    }),
    /private or local address/,
  );
  assert.equal(fetchCount, 1);
});

test("fetchRemoteBytes rejects streamed responses above the byte limit", async () => {
  await assert.rejects(
    fetchRemoteBytes("https://example.com/oversized", {
      fetchImpl: async () => new Response(new Uint8Array(9)),
      headers: {},
      maxBytes: 8,
      timeoutMs: 100,
    }),
    /exceeds the 8-byte limit/,
  );
});

test("fetchRemoteBytes aborts requests at the configured timeout", async () => {
  await assert.rejects(
    fetchRemoteBytes("https://example.com/slow", {
      fetchImpl: (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
      headers: {},
      maxBytes: 1024,
      timeoutMs: 10,
    }),
    /timed out after 10ms/,
  );
});

test("remote thumbnail MIME policy accepts raster formats and rejects SVG", () => {
  for (const value of [
    "image/avif",
    "image/gif",
    "image/jpeg; charset=binary",
    "IMAGE/PNG",
    "image/webp",
  ]) {
    assert.equal(isAllowedRasterContentType(value), true, value);
  }

  for (const value of ["", "image/svg+xml", "image/bmp", "text/html"]) {
    assert.equal(isAllowedRasterContentType(value), false, value);
  }
});

test("Supabase news read failures are not treated as empty results", async () => {
  const existingUrlsClient = {
    from: () => ({
      select: () => ({
        limit: async () => ({ data: null, error: { message: "database unavailable" } }),
      }),
    }),
  };
  const publishedArticlesClient = {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: async () => ({ data: null, error: { message: "database unavailable" } }),
        }),
      }),
    }),
  };

  await assert.rejects(fetchExistingUrls(existingUrlsClient), /Unable to read existing news URLs/);
  await assert.rejects(
    fetchPublishedArticles(publishedArticlesClient),
    /Unable to read published news articles/,
  );
});

test("an import fails instead of reporting success when every source is unavailable", async () => {
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    await assert.rejects(
      collectArticles(
        {
          fetchImpl: async () => {
            throw new Error("source unavailable");
          },
          textResponseLimitBytes: 1024,
          timeoutMs: 100,
        },
        2,
      ),
      /Unable to fetch any configured news source/,
    );
  } finally {
    console.warn = originalWarn;
  }
});

test("mapWithConcurrency preserves order and respects its worker limit", async () => {
  let active = 0;
  let peak = 0;
  const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 10;
  });

  assert.deepEqual(result, [10, 20, 30, 40, 50]);
  assert.equal(peak, 2);
});

test("mapWithConcurrency propagates falsy rejection reasons", async () => {
  await assert.rejects(
    mapWithConcurrency([1], 1, () => Promise.reject(undefined)),
    (error) => error === undefined,
  );
});
