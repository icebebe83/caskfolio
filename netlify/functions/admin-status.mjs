import {
  buildAdminServerStatus,
  createSupabaseAdminClient,
  getReferenceSyncSnapshot,
  requireAdminUser,
} from "./_shared/admin-reference-sync.mjs";
import {
  createFailedNewsImportStatus,
  getNewsImportStatus,
} from "./_shared/news-import-status.mjs";

export default async (request) => {
  if (request.method !== "GET") {
    return Response.json(
      { error: "Method not allowed." },
      { status: 405, headers: { allow: "GET", "cache-control": "no-store" } },
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    const auth = await requireAdminUser(request, supabase);
    if (auth.error) return auth.error;

    const [snapshot, newsImport] = await Promise.all([
      getReferenceSyncSnapshot(supabase),
      getNewsImportStatus(supabase),
    ]);
    return Response.json(
      buildAdminServerStatus({
        status: "idle",
        missingCount: snapshot.missingBottles.length,
        failedCount: snapshot.missingBottles.length,
        newsImport,
      }),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[admin-status] Unable to load admin status.", error);
    const message = "Unable to load admin status.";
    return Response.json(
      buildAdminServerStatus({
        status: "failure",
        lastError: message,
        message,
        newsImport: createFailedNewsImportStatus(message),
      }),
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
};
