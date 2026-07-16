import {
  buildAdminServerStatus,
  createSupabaseAdminClient,
  getReferenceSyncSnapshot,
  requireAdminUser,
} from "./_shared/admin-reference-sync.mjs";

const DEFAULT_BATCH_LIMIT = 25;
const MAX_BATCH_LIMIT = 50;

function getBatchLimit(request) {
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? DEFAULT_BATCH_LIMIT);
  if (!Number.isFinite(requestedLimit) || requestedLimit <= 0) return DEFAULT_BATCH_LIMIT;
  return Math.min(Math.floor(requestedLimit), MAX_BATCH_LIMIT);
}

export default async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed." }, { status: 405 });
  }

  const startedAt = new Date().toISOString();

  try {
    const supabase = createSupabaseAdminClient();
    const auth = await requireAdminUser(request, supabase);
    if (auth.error) return auth.error;
    const apifyApiToken = Netlify.env.get("APIFY_API_TOKEN") ?? process.env.APIFY_API_TOKEN ?? "";

    const limit = getBatchLimit(request);
    const { missingBottles } = await getReferenceSyncSnapshot(supabase);
    const targets = missingBottles.slice(0, limit);

    if (!targets.length) {
      return Response.json(
        buildAdminServerStatus({
          status: "success",
          lastStartedAt: startedAt,
          missingCount: 0,
          matchedCount: 0,
          failedCount: 0,
          processedCount: 0,
          message: "All eligible bottles already have global reference prices.",
        }),
      );
    }

    const { syncBottleReferencePrice } = await import("../../scripts/reference/sync-reference-prices.mjs");
    const details = [];

    for (const bottle of targets) {
      try {
        const result = await syncBottleReferencePrice(supabase, bottle.id, { apifyApiToken });
        details.push(result);
      } catch (error) {
        details.push({
          matched: false,
          detail: {
            bottleId: bottle.id,
            bottleName: bottle.name,
            source: null,
            referencePriceUsd: null,
            confidenceScore: null,
            matchedName: null,
            matchedVolumeMl: null,
            error: error instanceof Error ? error.message : "Unable to sync reference price.",
          },
        });
      }
    }

    const matchedCount = details.filter((result) => result?.matched).length;
    const failedCount = details.length - matchedCount;
    const remainingMissingCount = Math.max(0, missingBottles.length - details.length + failedCount);

    return Response.json(
      buildAdminServerStatus({
        status: "success",
        lastStartedAt: startedAt,
        missingCount: remainingMissingCount,
        matchedCount,
        failedCount,
        processedCount: details.length,
        message: `Processed ${details.length} missing bottle(s). Matched ${matchedCount}, failed ${failedCount}.`,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run reference sync.";
    return Response.json(
      buildAdminServerStatus({
        status: "failure",
        lastStartedAt: startedAt,
        lastError: message,
        message,
      }),
      { status: 500 },
    );
  }
};

export const config = {
  path: "/__admin/reference-sync",
};
