import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdminEnv() {
  const getEnv = (key) => Netlify.env.get(key) ?? process.env[key] ?? "";
  return {
    supabaseUrl: getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    serviceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function createSupabaseAdminClient() {
  const { supabaseUrl, serviceRoleKey } = getSupabaseAdminEnv();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin environment is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireAdminUser(request, supabase) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!token) {
    return { error: Response.json({ error: "Authentication required." }, { status: 401 }) };
  }

  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  const user = userResult?.user;
  if (userError || !user) {
    return { error: Response.json({ error: "Authentication required." }, { status: 401 }) };
  }

  const { data: adminRow, error: adminError } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError || !adminRow) {
    return { error: Response.json({ error: "Admin access required." }, { status: 403 }) };
  }

  return { user };
}

export async function getReferenceSyncSnapshot(supabase) {
  const [{ data: bottles, error: bottlesError }, { data: references, error: referencesError }] =
    await Promise.all([
      supabase.from("bottles").select("*").order("created_at", { ascending: true }).limit(5000),
      supabase.from("bottle_reference_prices").select("bottle_id").limit(5000),
    ]);

  if (bottlesError) {
    throw new Error(`Unable to load bottles: ${bottlesError.message}`);
  }

  if (referencesError) {
    throw new Error(`Unable to load reference prices: ${referencesError.message}`);
  }

  const referenceBottleIds = new Set((references ?? []).map((row) => String(row.bottle_id)));
  const missingBottles = (bottles ?? []).filter((bottle) => !referenceBottleIds.has(String(bottle.id)));

  return {
    bottles: bottles ?? [],
    references: references ?? [],
    missingBottles,
  };
}

export function buildAdminServerStatus(input = {}) {
  const now = new Date().toISOString();
  const missingCount = Number(input.missingCount ?? 0);
  const matchedCount = Number(input.matchedCount ?? 0);
  const failedCount = Number(input.failedCount ?? missingCount);
  const processedCount = Number(input.processedCount ?? 0);
  const status = input.status ?? "idle";

  return {
    referenceSync: {
      running: false,
      status,
      lastStartedAt: input.lastStartedAt ?? null,
      lastFinishedAt: input.lastFinishedAt ?? (status === "idle" ? null : now),
      lastSuccessAt: status === "success" ? now : null,
      lastError: input.lastError ?? null,
      message:
        input.message ??
        (missingCount
          ? `${missingCount} bottle(s) are missing global reference prices.`
          : "All eligible bottles already have global reference prices."),
      matchedCount,
      failedCount,
    },
    newsImport: {
      running: false,
      status: "idle",
      lastStartedAt: null,
      lastFinishedAt: null,
      lastSuccessAt: null,
      lastError: null,
      message: "",
    },
    settings: {
      googleOAuth: { configured: true, label: "Configured" },
      rssSources: [],
      referenceSyncSchedule: "Manual · missing bottles only",
      lastSyncTime: status === "success" ? now : null,
      newsIngestion: {
        available: true,
        count: null,
        lastUpdatedAt: null,
        label: "Available",
      },
      processedCount,
      missingReferenceCount: missingCount,
    },
  };
}
