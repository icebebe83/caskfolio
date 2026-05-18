import { appendAuditLog } from "@/lib/data/audit";
import { toSupabaseError } from "@/lib/data/shared";
import { assertSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { AppUser, CollectorNote, CollectorNoteStatus } from "@/lib/types";

type CollectorNoteRow = Record<string, unknown>;

function isMissingCollectorNotesTable(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");

  return /collector_notes|collector_note_votes/i.test(message) && (/schema cache/i.test(message) || /does not exist/i.test(message));
}

function mapCollectorNoteRow(row: CollectorNoteRow, helpfulByCurrentUser = false): CollectorNote {
  const status = String(row.status ?? "pending");

  return {
    id: String(row.id ?? ""),
    bottleId: String(row.bottle_id ?? ""),
    createdBy: String(row.user_id ?? ""),
    displayName: String(row.display_name ?? "Collector"),
    content: String(row.content ?? ""),
    helpfulCount: Number(row.helpful_count ?? 0),
    status:
      status === "approved" || status === "hidden" || status === "pending"
        ? (status as CollectorNoteStatus)
        : "pending",
    helpfulByCurrentUser,
    createdAt: row.created_at as CollectorNote["createdAt"],
    updatedAt: row.updated_at as CollectorNote["updatedAt"],
  };
}

async function getCurrentUserId(): Promise<string | null> {
  assertSupabaseConfigured();
  const { data, error } = await supabase!.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

export async function fetchCollectorNotes(bottleIds: string[]): Promise<CollectorNote[]> {
  assertSupabaseConfigured();
  const ids = [...new Set(bottleIds.filter(Boolean))];
  if (!ids.length) return [];

  try {
    const { data, error } = await supabase!
      .from("collector_notes")
      .select("*")
      .in("bottle_id", ids)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      if (isMissingCollectorNotesTable(error)) return [];
      throw error;
    }

    const notes = (data ?? []).map((row) => mapCollectorNoteRow(row));
    const userId = await getCurrentUserId();
    if (!userId || !notes.length) return notes;

    const { data: votes, error: voteError } = await supabase!
      .from("collector_note_votes")
      .select("note_id")
      .eq("user_id", userId)
      .in("note_id", notes.map((note) => note.id));
    if (voteError) return notes;

    const votedNoteIds = new Set((votes ?? []).map((vote) => String(vote.note_id ?? "")));
    return notes.map((note) => ({
      ...note,
      helpfulByCurrentUser: votedNoteIds.has(note.id),
    }));
  } catch (error) {
    if (isMissingCollectorNotesTable(error)) return [];
    throw toSupabaseError(error, "Unable to load collector notes.");
  }
}

export async function fetchAdminCollectorNotes(): Promise<CollectorNote[]> {
  assertSupabaseConfigured();

  try {
    const { data, error } = await supabase!
      .from("collector_notes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      if (isMissingCollectorNotesTable(error)) return [];
      throw error;
    }

    return (data ?? []).map((row) => mapCollectorNoteRow(row));
  } catch (error) {
    if (isMissingCollectorNotesTable(error)) return [];
    throw toSupabaseError(error, "Unable to load collector notes.");
  }
}

export async function findCollectorNoteQualifiedBottleId(bottleIds: string[]): Promise<string | null> {
  assertSupabaseConfigured();
  const userId = await getCurrentUserId();
  const ids = [...new Set(bottleIds.filter(Boolean))];
  if (!userId || !ids.length) return null;

  const { data, error } = await supabase!
    .from("public_listings")
    .select("bottle_id")
    .eq("user_id", userId)
    .in("bottle_id", ids)
    .limit(1);
  if (error) return null;

  return String(data?.[0]?.bottle_id ?? "") || null;
}

export async function createCollectorNote(input: {
  bottleId: string;
  content: string;
  user: AppUser;
}): Promise<void> {
  assertSupabaseConfigured();
  const content = input.content.trim();
  if (!content) throw new Error("Collector note cannot be empty.");
  if (content.length > 300) throw new Error("Collector note must be 300 characters or less.");

  let profileDisplayName = "";
  const { data: profile } = await supabase!
    .from("profiles")
    .select("display_name")
    .eq("id", input.user.uid)
    .maybeSingle();
  profileDisplayName = typeof profile?.display_name === "string" ? profile.display_name.trim() : "";

  const displayName =
    profileDisplayName ||
    input.user.displayName?.trim() ||
    [input.user.firstName, input.user.lastName].filter(Boolean).join(" ").trim() ||
    input.user.email.split("@")[0] ||
    "Collector";

  const { error } = await supabase!.from("collector_notes").insert({
    bottle_id: input.bottleId,
    user_id: input.user.uid,
    display_name: displayName,
    content,
    status: "approved",
  });
  if (error) {
    if (isMissingCollectorNotesTable(error)) {
      throw new Error("Collector Notes is not ready yet. Apply supabase/collector_notes.sql first.");
    }
    throw toSupabaseError(error, "Unable to submit collector note.");
  }
}

export async function markCollectorNoteHelpful(noteId: string): Promise<number | null> {
  assertSupabaseConfigured();
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Sign in to mark notes helpful.");

  const { error } = await supabase!.from("collector_note_votes").insert({
    note_id: noteId,
    user_id: userId,
  });
  if (error) {
    const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? "");
    if (/duplicate key|collector_note_votes_pkey/i.test(message)) return null;
    if (isMissingCollectorNotesTable(error)) {
      throw new Error("Collector Notes is not ready yet. Apply supabase/collector_notes.sql first.");
    }
    throw toSupabaseError(error, "Unable to mark note helpful.");
  }

  const { data } = await supabase!
    .from("collector_notes")
    .select("helpful_count")
    .eq("id", noteId)
    .maybeSingle();

  return data ? Number(data.helpful_count ?? 0) : null;
}

export async function updateCollectorNoteContent(noteId: string, content: string): Promise<CollectorNote> {
  assertSupabaseConfigured();
  const normalizedContent = content.trim();
  if (!normalizedContent) throw new Error("Collector note cannot be empty.");
  if (normalizedContent.length > 300) throw new Error("Collector note must be 300 characters or less.");

  const { data, error } = await supabase!
    .from("collector_notes")
    .update({ content: normalizedContent, updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .select("*")
    .maybeSingle();

  if (error) throw toSupabaseError(error, "Unable to update collector note.");
  if (!data) throw new Error("Collector note was not updated.");

  await appendAuditLog({
    action: "collector_note.content_updated",
    targetType: "collector_note",
    targetId: noteId,
  });

  return mapCollectorNoteRow(data);
}

export async function hideOwnCollectorNote(noteId: string): Promise<void> {
  assertSupabaseConfigured();
  const { error } = await supabase!
    .from("collector_notes")
    .update({ status: "hidden", updated_at: new Date().toISOString() })
    .eq("id", noteId);

  if (error) throw toSupabaseError(error, "Unable to delete collector note.");
}

export async function deleteCollectorNote(noteId: string): Promise<void> {
  assertSupabaseConfigured();
  const { error } = await supabase!.from("collector_notes").delete().eq("id", noteId);
  if (error) throw toSupabaseError(error, "Unable to delete collector note.");

  await appendAuditLog({
    action: "collector_note.deleted",
    targetType: "collector_note",
    targetId: noteId,
  });
}

export async function updateCollectorNoteStatus(
  noteId: string,
  status: CollectorNoteStatus,
): Promise<void> {
  assertSupabaseConfigured();
  const { error } = await supabase!
    .from("collector_notes")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", noteId);
  if (error) throw toSupabaseError(error, "Unable to update collector note.");
  await appendAuditLog({
    action: "collector_note.status_updated",
    targetType: "collector_note",
    targetId: noteId,
    details: { status },
  });
}
