import {
  createSupabaseAdminClient,
  requireAdminUser,
} from "./_shared/admin-reference-sync.mjs";
import { getNewsImportStatus } from "./_shared/news-import-status.mjs";

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

    const newsImport = await getNewsImportStatus(supabase);
    return Response.json(
      { newsImport },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[news-import-status] Unable to load news import status.", error);
    const message = "Unable to load news import status.";
    return Response.json(
      { error: message },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
};
