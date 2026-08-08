import type { AdminServerStatus } from "@/lib/admin/dto";
import { appendAuditLog } from "@/lib/data/audit";
import { supabase } from "@/lib/supabase/client";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase!.auth.getSession();
  const accessToken = data.session?.access_token;
  return accessToken ? { authorization: `Bearer ${accessToken}` } : {};
}

export async function fetchAdminStatus(): Promise<AdminServerStatus | null> {
  try {
    const response = await fetch("/__admin/status", {
      cache: "no-store",
      headers: await getAuthHeaders(),
    });
    if (!response.ok) return null;
    return (await response.json()) as AdminServerStatus;
  } catch {
    return null;
  }
}

export async function fetchNewsImportStatus(): Promise<
  AdminServerStatus["newsImport"] | null
> {
  try {
    const response = await fetch("/__admin/news-import/status", {
      cache: "no-store",
      headers: await getAuthHeaders(),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      newsImport?: AdminServerStatus["newsImport"];
    };
    return data.newsImport ?? null;
  } catch {
    return null;
  }
}

export async function runReferenceSyncAction(): Promise<AdminServerStatus> {
  const response = await fetch("/__admin/reference-sync", {
    method: "POST",
    headers: await getAuthHeaders(),
  });

  if (!response.ok && response.status !== 202) {
    throw new Error("Unable to start reference sync.");
  }

  const data = (await response.json()) as AdminServerStatus;
  await appendAuditLog({
    action: "reference_sync.triggered",
    targetType: "system",
    details: {
      status: data.referenceSync.status,
      running: data.referenceSync.running,
    },
  });
  return data;
}

export async function runNewsImportAction(): Promise<AdminServerStatus> {
  const response = await fetch("/__admin/news-import", {
    method: "POST",
    headers: await getAuthHeaders(),
  });

  if (!response.ok && response.status !== 202) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `Unable to start news import (HTTP ${response.status}).`);
  }

  return (await response.json()) as AdminServerStatus;
}
