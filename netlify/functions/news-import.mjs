export default async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    const { runNewsImport } = await import("../../scripts/news/import-news.mjs");
    const startedAt = new Date().toISOString();
    const getEnv = (key) => Netlify.env.get(key) ?? process.env[key] ?? "";
    const result = await runNewsImport({
      env: {
        NEXT_PUBLIC_SUPABASE_URL: getEnv("NEXT_PUBLIC_SUPABASE_URL"),
        SUPABASE_URL: getEnv("SUPABASE_URL"),
        SUPABASE_SERVICE_ROLE_KEY: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
      },
      writeOutputFile: false,
      useLocalThumbnails: false,
    });
    const finishedAt = new Date().toISOString();

    return Response.json({
      referenceSync: {
        running: false,
        status: "idle",
        lastStartedAt: null,
        lastFinishedAt: null,
        lastSuccessAt: null,
        lastError: null,
        message: "",
        matchedCount: null,
        failedCount: null,
      },
      newsImport: {
        running: false,
        status: "success",
        lastStartedAt: startedAt,
        lastFinishedAt: finishedAt,
        lastSuccessAt: finishedAt,
        lastError: null,
        message: `News import completed. Saved ${result.saved} new article(s), refreshed ${result.count} item(s).`,
      },
      settings: {
        googleOAuth: { configured: true, label: "Configured" },
        rssSources: [],
        referenceSyncSchedule: "Monthly · 1st and 15th",
        lastSyncTime: null,
        newsIngestion: {
          available: true,
          count: result.count,
          lastUpdatedAt: finishedAt,
          label: "Available",
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run news import.";
    return Response.json(
      {
        error: message,
        referenceSync: {
          running: false,
          status: "idle",
          lastStartedAt: null,
          lastFinishedAt: null,
          lastSuccessAt: null,
          lastError: null,
          message: "",
          matchedCount: null,
          failedCount: null,
        },
        newsImport: {
          running: false,
          status: "failure",
          lastStartedAt: null,
          lastFinishedAt: new Date().toISOString(),
          lastSuccessAt: null,
          lastError: message,
          message: "",
        },
        settings: {
          googleOAuth: { configured: false, label: "Unknown" },
          rssSources: [],
          referenceSyncSchedule: "Monthly · 1st and 15th",
          lastSyncTime: null,
          newsIngestion: {
            available: false,
            count: 0,
            lastUpdatedAt: null,
            label: "Unavailable",
          },
        },
      },
      { status: 500 },
    );
  }
};

export const config = {
  path: "/__admin/news-import",
};
