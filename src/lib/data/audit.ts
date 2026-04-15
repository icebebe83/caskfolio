import { assertSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { AuditLogEntry } from "@/lib/types";
import { sortByCreatedAtDesc } from "@/lib/data/shared";

type AuditLogRow = Record<string, unknown>;

function mapAuditLogRow(row: AuditLogRow): AuditLogEntry {
  return {
    id: String(row.id ?? ""),
    actorUserId: typeof row.actor_user_id === "string" ? row.actor_user_id : "",
    actorEmail: typeof row.actor_email === "string" ? row.actor_email : "",
    action: String(row.action ?? ""),
    targetType: String(row.target_type ?? ""),
    targetId: typeof row.target_id === "string" ? row.target_id : "",
    details:
      row.details && typeof row.details === "object" && !Array.isArray(row.details)
        ? (row.details as Record<string, unknown>)
        : {},
    createdAt:
      row.created_at instanceof Date || typeof row.created_at === "string"
        ? row.created_at
        : new Date().toISOString(),
  };
}

export async function appendAuditLog(input: {
  action: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  assertSupabaseConfigured();

  try {
    const {
      data: { user },
    } = await supabase!.auth.getUser();

    if (!user) return;

    const { error } = await supabase!.from("audit_logs").insert({
      actor_user_id: user.id,
      actor_email: user.email ?? "",
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId ?? "",
      details: input.details ?? {},
    });

    if (error) {
      console.warn("Audit log insert failed:", error.message);
    }
  } catch (error) {
    console.warn("Audit log insert failed:", error);
  }
}

export async function fetchAuditLogs(limit = 20): Promise<AuditLogEntry[]> {
  assertSupabaseConfigured();

  try {
    const { data, error } = await supabase!
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return sortByCreatedAtDesc((data ?? []).map(mapAuditLogRow));
  } catch {
    return [];
  }
}
