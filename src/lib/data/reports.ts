import { assertSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { AppUser, Report, ReportStatus } from "@/lib/types";
import { appendAuditLog } from "@/lib/data/audit";
import { mapReportRow, sortByCreatedAtDesc, toSupabaseError } from "@/lib/data/shared";

export async function fetchReports(): Promise<Report[]> {
  assertSupabaseConfigured();
  const { data, error } = await supabase!
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw toSupabaseError(error, "Unable to load reports.");
  return sortByCreatedAtDesc((data ?? []).map(mapReportRow));
}

export async function createReport(
  listingId: string,
  reason: string,
  note: string,
  user: AppUser,
): Promise<void> {
  assertSupabaseConfigured();
  const { error } = await supabase!.from("reports").insert({
    listing_id: listingId,
    reason,
    note: note.trim(),
    user_id: user.uid,
    status: "open",
  });
  if (error) throw toSupabaseError(error, "Unable to create report.");
}

export async function updateReportStatus(
  reportId: string,
  status: ReportStatus,
): Promise<void> {
  assertSupabaseConfigured();
  const { error } = await supabase!
    .from("reports")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", reportId);
  if (error) throw toSupabaseError(error, "Unable to update report status.");
  await appendAuditLog({
    action: "report.status_updated",
    targetType: "report",
    targetId: reportId,
    details: { status },
  });
}
