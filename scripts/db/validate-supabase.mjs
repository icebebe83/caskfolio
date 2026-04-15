import { createClient } from "@supabase/supabase-js";
import { loadProjectEnv } from "../shared/load-env.mjs";

loadProjectEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function assertEnv(name, value) {
  if (!value || value.includes("...")) {
    throw new Error(`Missing required env: ${name}`);
  }
}

function createSupabaseClient(key) {
  return createClient(SUPABASE_URL, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function checkTableReadable(client, table, columns = "*") {
  const { data, error } = await client.from(table).select(columns).limit(1);
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
  return Array.isArray(data) ? data.length : 0;
}

async function checkTableWritable(client, table, payload, cleanupColumn = "id") {
  const { data, error } = await client.from(table).insert(payload).select(cleanupColumn).single();
  if (error) {
    throw new Error(`${table} write: ${error.message}`);
  }

  if (data?.[cleanupColumn]) {
    await client.from(table).delete().eq(cleanupColumn, data[cleanupColumn]);
  }
}

async function main() {
  assertEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  assertEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);

  const anon = createSupabaseClient(SUPABASE_ANON_KEY);
  console.log("Checking anon-readable tables...");

  for (const table of ["bottles", "listings", "news", "fx_rates"]) {
    const count = await checkTableReadable(anon, table);
    console.log(`  OK read ${table} (sample count: ${count})`);
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.log("Skipping admin/write validation because SUPABASE_SERVICE_ROLE_KEY is not set.");
    return;
  }

  const admin = createSupabaseClient(SUPABASE_SERVICE_ROLE_KEY);
  console.log("Checking admin-readable tables...");

  for (const table of ["profiles", "admins", "reports"]) {
    const count = await checkTableReadable(admin, table);
    console.log(`  OK read ${table} (sample count: ${count})`);
  }

  console.log("Checking admin write permissions with ephemeral rows...");
  const marker = `codex-validation-${Date.now()}`;

  await checkTableWritable(
    admin,
    "news",
    {
      id: marker,
      title: "Codex validation row",
      summary: "Validation row for Supabase migration readiness.",
      source: "codex",
      url: `https://example.com/${marker}`,
      image_url: "/news-fallback.png",
      published_at: new Date().toISOString(),
      category: "whisky",
      external: true,
    },
    "id",
  );
  console.log("  OK write news");
}

main().catch((error) => {
  console.error("Supabase validation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
