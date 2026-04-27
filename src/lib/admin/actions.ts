import type { AdminServerStatus } from "@/lib/admin/dto";
import { appendAuditLog } from "@/lib/data/audit";

export async function fetchAdminStatus(): Promise<AdminServerStatus | null> {
  try {
    const response = await fetch("/__admin/status", { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as AdminServerStatus;
  } catch {
    return null;
  }
}

export async function runReferenceSyncAction(): Promise<AdminServerStatus> {
  const response = await fetch("/__admin/reference-sync", {
    method: "POST",
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
  });

  if (!response.ok && response.status !== 202) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || "Unable to start news import.");
  }

  const data = (await response.json()) as AdminServerStatus;
  await appendAuditLog({
    action: "news_import.triggered",
    targetType: "system",
    details: {
      status: data.newsImport.status,
      running: data.newsImport.running,
    },
  });
  return data;
}
