import { randomUUID } from "node:crypto";

import {
  buildAdminServerStatus,
  createSupabaseAdminClient,
  requireAdminUser,
} from "./_shared/admin-reference-sync.mjs";
import {
  acquireNewsImportLock,
  createFailedNewsImportStatus,
  createNewsImportLockId,
  createQueuedNewsImportStatus,
  getNewsImportStatus,
  recordNewsImportEvent,
  releaseNewsImportLock,
} from "./_shared/news-import-status.mjs";

function json(body, status = 200, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

export default async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, { allow: "POST" });
  }

  let supabase;
  let user;
  let jobId = "";
  let lockId = "";
  let startedAt = "";
  let lockAcquired = false;

  try {
    supabase = createSupabaseAdminClient();
    const auth = await requireAdminUser(request, supabase);
    if (auth.error) return auth.error;
    user = auth.user;

    const currentStatus = await getNewsImportStatus(supabase);
    if (currentStatus.running) {
      return json(buildAdminServerStatus({ newsImport: currentStatus }), 202, {
        "retry-after": "5",
      });
    }

    startedAt = new Date().toISOString();
    jobId = randomUUID();
    lockId = createNewsImportLockId(new Date(startedAt).getTime());
    lockAcquired = await acquireNewsImportLock(supabase, {
      jobId,
      lockId,
      user,
      startedAt,
    });

    if (!lockAcquired) {
      const lockedStatus = await getNewsImportStatus(supabase);
      const newsImport = lockedStatus.running
        ? lockedStatus
        : createQueuedNewsImportStatus({
            jobId: lockedStatus.jobId,
            startedAt,
            message: "A news import request is already queued.",
          });
      return json(buildAdminServerStatus({ newsImport }), 202, { "retry-after": "5" });
    }

    await recordNewsImportEvent(supabase, {
      status: "started",
      jobId,
      lockId,
      user,
      startedAt,
      message: "News import is queued and will start shortly.",
    });

    const authorization = request.headers.get("authorization") ?? "";
    const backgroundUrl = new URL("/.netlify/functions/news-import-background", request.url);
    const backgroundResponse = await fetch(backgroundUrl, {
      method: "POST",
      headers: {
        authorization,
        "content-type": "application/json",
      },
      body: JSON.stringify({ jobId, lockId, startedAt }),
    });

    if (backgroundResponse.status !== 202) {
      throw new Error(`Unable to queue news import worker (${backgroundResponse.status}).`);
    }

    const newsImport = createQueuedNewsImportStatus({ jobId, startedAt });
    return json(buildAdminServerStatus({ newsImport }), 202, { "retry-after": "5" });
  } catch (error) {
    console.error("[news-import] Unable to start news import.", error);
    const message = "Unable to start news import.";
    const finishedAt = new Date().toISOString();

    if (supabase && user && jobId && lockId) {
      await recordNewsImportEvent(supabase, {
        status: "failed",
        jobId,
        lockId,
        user,
        startedAt,
        finishedAt,
        error: message,
        errorCode: "NEWS_IMPORT_TRIGGER_FAILED",
      }).catch(() => undefined);
    }
    if (supabase && lockAcquired && jobId && lockId) {
      await releaseNewsImportLock(supabase, { jobId, lockId }).catch(() => undefined);
    }

    const newsImport = createFailedNewsImportStatus(message, {
      jobId,
      startedAt,
      finishedAt,
    });
    return json({ error: message, ...buildAdminServerStatus({ newsImport }) }, 500);
  }
};
