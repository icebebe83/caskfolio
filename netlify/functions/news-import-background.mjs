import {
  createSupabaseAdminClient,
  requireAdminUser,
} from "./_shared/admin-reference-sync.mjs";
import {
  claimNewsImportLock,
  hasQueuedNewsImportEvent,
  recordNewsImportEvent,
  releaseNewsImportLock,
} from "./_shared/news-import-status.mjs";

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? ""),
  );
}

export default async (request) => {
  if (request.method !== "POST") {
    console.warn("[news-import-background] Ignored a non-POST request.");
    return;
  }

  const supabase = createSupabaseAdminClient();
  const auth = await requireAdminUser(request, supabase);
  if (auth.error) {
    console.warn("[news-import-background] Admin authentication failed.");
    return;
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    console.warn("[news-import-background] Invalid request body.");
    return;
  }

  const jobId = String(payload?.jobId ?? "");
  const lockId = String(payload?.lockId ?? "");
  const startedAt = String(payload?.startedAt ?? "");
  if (!isUuid(jobId) || !isUuid(lockId) || !startedAt) {
    console.warn("[news-import-background] Missing or invalid job metadata.");
    return;
  }

  const queued = await hasQueuedNewsImportEvent(supabase, { jobId, lockId });
  if (!queued) {
    console.warn("[news-import-background] Queued status event was not found.");
    return;
  }

  const claimed = await claimNewsImportLock(supabase, { jobId, lockId, startedAt });
  if (!claimed) {
    console.warn("[news-import-background] Lock was already claimed or released.");
    return;
  }

  try {
    const { runNewsImport } = await import("../../scripts/news/import-news.mjs");
    const getEnv = (key) => Netlify.env.get(key) ?? process.env[key] ?? "";
    const result = await runNewsImport({
      env: {
        NEXT_PUBLIC_SUPABASE_URL: getEnv("NEXT_PUBLIC_SUPABASE_URL"),
        NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: getEnv(
          "NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET",
        ),
        SUPABASE_URL: getEnv("SUPABASE_URL"),
        SUPABASE_SERVICE_ROLE_KEY: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
      },
      writeOutputFile: false,
      useLocalThumbnails: false,
    });
    const finishedAt = new Date().toISOString();
    const completionMessage = [
      `News import completed. Saved ${result.saved} new article(s), refreshed ${result.count} item(s).`,
      result.warning,
    ]
      .filter(Boolean)
      .join(" ");

    await recordNewsImportEvent(supabase, {
      status: "succeeded",
      jobId,
      lockId,
      user: auth.user,
      startedAt,
      finishedAt,
      saved: result.saved,
      count: result.count,
      message: completionMessage,
    });
  } catch (error) {
    console.error("[news-import-background] News import failed.", error);
    const message = "News import failed. Please try again.";
    await recordNewsImportEvent(supabase, {
      status: "failed",
      jobId,
      lockId,
      user: auth.user,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: message,
      errorCode: "NEWS_IMPORT_FAILED",
    }).catch(() => undefined);
  } finally {
    await releaseNewsImportLock(supabase, { jobId, lockId }).catch(() => {
      console.error("[news-import-background] Lock release failed.");
    });
  }
};
