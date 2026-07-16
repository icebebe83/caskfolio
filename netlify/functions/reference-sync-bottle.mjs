import { createClient } from "@supabase/supabase-js";

export default async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed." }, { status: 405 });
  }

  const getEnv = (key) => Netlify.env.get(key) ?? process.env[key] ?? "";
  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const apifyApiToken = getEnv("APIFY_API_TOKEN");

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ error: "Reference sync is not configured." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!token) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  let bottleId = "";
  try {
    const body = await request.json();
    bottleId = typeof body?.bottleId === "string" ? body.bottleId.trim() : "";
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!bottleId) {
    return Response.json({ error: "bottleId is required." }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userResult?.user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const { syncBottleReferencePrice } = await import("../../scripts/reference/sync-reference-prices.mjs");
    const result = await syncBottleReferencePrice(supabase, bottleId, {
      apifyApiToken,
      onlyIfMissing: true,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sync reference price.";
    return Response.json({ error: message }, { status: 500 });
  }
};

export const config = {
  path: "/__reference/sync-bottle",
};
