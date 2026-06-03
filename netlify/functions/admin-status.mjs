import {
  buildAdminServerStatus,
  createSupabaseAdminClient,
  getReferenceSyncSnapshot,
  requireAdminUser,
} from "./_shared/admin-reference-sync.mjs";

export default async (request) => {
  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const auth = await requireAdminUser(request, supabase);
    if (auth.error) return auth.error;

    const snapshot = await getReferenceSyncSnapshot(supabase);
    return Response.json(
      buildAdminServerStatus({
        status: "idle",
        missingCount: snapshot.missingBottles.length,
        failedCount: snapshot.missingBottles.length,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load admin status.";
    return Response.json(
      buildAdminServerStatus({
        status: "failure",
        lastError: message,
        message,
      }),
      { status: 500 },
    );
  }
};

export const config = {
  path: "/__admin/status",
};
