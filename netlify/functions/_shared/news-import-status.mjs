import { createHash } from "node:crypto";

export const NEWS_IMPORT_ACTIONS = {
  lock: "news_import.lock",
  claimed: "news_import.claimed",
  started: "news_import.started",
  succeeded: "news_import.succeeded",
  failed: "news_import.failed",
};

const LOCK_BUCKET_MS = 15 * 60 * 1000;
const RUNNING_STALE_MS = 16 * 60 * 1000;
const STATUS_ACTIONS = [
  NEWS_IMPORT_ACTIONS.started,
  NEWS_IMPORT_ACTIONS.succeeded,
  NEWS_IMPORT_ACTIONS.failed,
];

function asDetails(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asIsoString(value, fallback = null) {
  if (typeof value !== "string" || !value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function asFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rowTime(row) {
  return new Date(row?.created_at ?? 0).getTime() || 0;
}

function rowId(row) {
  return String(row?.id ?? "");
}

function rowJobId(row) {
  const details = asDetails(row?.details);
  return String(row?.target_id ?? details.jobId ?? "");
}

export function createNewsImportLockId(timestamp = Date.now()) {
  const bucket = Math.floor(Number(timestamp) / LOCK_BUCKET_MS);
  const hex = createHash("sha256")
    .update(`caskfolio:news-import:${bucket}`)
    .digest("hex")
    .slice(0, 32)
    .split("");

  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function createIdleNewsImportStatus() {
  return {
    jobId: "",
    running: false,
    status: "idle",
    lastStartedAt: null,
    lastFinishedAt: null,
    lastSuccessAt: null,
    lastError: null,
    message: "",
    count: 0,
  };
}

export function createQueuedNewsImportStatus({ jobId, startedAt, message } = {}) {
  return {
    jobId: String(jobId ?? ""),
    running: true,
    status: "running",
    lastStartedAt: asIsoString(startedAt, new Date().toISOString()),
    lastFinishedAt: null,
    lastSuccessAt: null,
    lastError: null,
    message: String(message ?? "News import is queued and will start shortly."),
    count: 0,
  };
}

export function createFailedNewsImportStatus(message, input = {}) {
  const finishedAt = asIsoString(input.finishedAt, new Date().toISOString());
  return {
    jobId: String(input.jobId ?? ""),
    running: false,
    status: "failure",
    lastStartedAt: asIsoString(input.startedAt),
    lastFinishedAt: finishedAt,
    lastSuccessAt: null,
    lastError: String(message || "Unable to run news import."),
    message: "",
    count: asFiniteNumber(input.count),
  };
}

export function deriveNewsImportStatus(rows, { now = Date.now() } = {}) {
  const orderedRows = [...(Array.isArray(rows) ? rows : [])]
    .filter((row) => STATUS_ACTIONS.includes(String(row?.action ?? "")))
    .sort(
      (left, right) =>
        rowTime(right) - rowTime(left) || rowId(right).localeCompare(rowId(left)),
    );
  const latestStart = orderedRows.find(
    (row) => String(row.action) === NEWS_IMPORT_ACTIONS.started,
  );

  if (!latestStart) {
    const latestTerminal = orderedRows[0];
    if (!latestTerminal) return createIdleNewsImportStatus();
    const details = asDetails(latestTerminal.details);
    const finishedAt = asIsoString(details.finishedAt, asIsoString(latestTerminal.created_at));

    if (latestTerminal.action === NEWS_IMPORT_ACTIONS.succeeded) {
      return {
        jobId: rowJobId(latestTerminal),
        running: false,
        status: "success",
        lastStartedAt: asIsoString(details.startedAt),
        lastFinishedAt: finishedAt,
        lastSuccessAt: finishedAt,
        lastError: null,
        message: String(details.message ?? "News import completed."),
        count: asFiniteNumber(details.count),
      };
    }

    return createFailedNewsImportStatus(details.error ?? details.message, {
      jobId: rowJobId(latestTerminal),
      startedAt: details.startedAt,
      finishedAt,
      count: details.count,
    });
  }

  const jobId = rowJobId(latestStart);
  const startDetails = asDetails(latestStart.details);
  const startedAt = asIsoString(startDetails.startedAt, asIsoString(latestStart.created_at));
  const terminal = orderedRows.find(
    (row) =>
      rowJobId(row) === jobId &&
      (row.action === NEWS_IMPORT_ACTIONS.succeeded ||
        row.action === NEWS_IMPORT_ACTIONS.failed) &&
      rowTime(row) >= rowTime(latestStart),
  );

  if (terminal) {
    const details = asDetails(terminal.details);
    const finishedAt = asIsoString(details.finishedAt, asIsoString(terminal.created_at));
    if (terminal.action === NEWS_IMPORT_ACTIONS.succeeded) {
      return {
        jobId,
        running: false,
        status: "success",
        lastStartedAt: startedAt,
        lastFinishedAt: finishedAt,
        lastSuccessAt: finishedAt,
        lastError: null,
        message: String(details.message ?? "News import completed."),
        count: asFiniteNumber(details.count),
      };
    }

    return createFailedNewsImportStatus(details.error ?? details.message, {
      jobId,
      startedAt,
      finishedAt,
      count: details.count,
    });
  }

  if (startedAt && Number(now) - new Date(startedAt).getTime() > RUNNING_STALE_MS) {
    return createFailedNewsImportStatus(
      "The previous news import did not finish within the background worker window.",
      { jobId, startedAt },
    );
  }

  return createQueuedNewsImportStatus({
    jobId,
    startedAt,
    message: startDetails.message,
  });
}

export async function getNewsImportStatus(supabase) {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id,action,target_id,details,created_at")
    .in("action", STATUS_ACTIONS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Unable to load news import status: ${error.message}`);
  }

  return deriveNewsImportStatus(data ?? []);
}

export async function acquireNewsImportLock(supabase, { jobId, lockId, user, startedAt }) {
  const { error } = await supabase.from("audit_logs").insert({
    id: lockId,
    actor_user_id: user.id,
    actor_email: user.email ?? "",
    action: NEWS_IMPORT_ACTIONS.lock,
    target_type: "system",
    target_id: jobId,
    details: {
      jobId,
      lockId,
      status: "queued",
      startedAt,
    },
  });

  if (!error) return true;
  if (String(error.code ?? "") === "23505") return false;
  throw new Error(`Unable to acquire news import lock: ${error.message}`);
}

export async function recordNewsImportEvent(
  supabase,
  {
    status,
    jobId,
    lockId,
    user,
    startedAt,
    finishedAt,
    message,
    error,
    errorCode,
    saved,
    count,
  },
) {
  const action =
    status === "started"
      ? NEWS_IMPORT_ACTIONS.started
      : status === "succeeded"
        ? NEWS_IMPORT_ACTIONS.succeeded
        : NEWS_IMPORT_ACTIONS.failed;
  const { error: insertError } = await supabase.from("audit_logs").insert({
    actor_user_id: user.id,
    actor_email: user.email ?? "",
    action,
    target_type: "system",
    target_id: jobId,
    details: {
      jobId,
      lockId,
      status,
      startedAt,
      finishedAt: finishedAt ?? null,
      message: message ?? "",
      error: error ?? null,
      errorCode: errorCode ?? null,
      saved: saved ?? null,
      count: count ?? null,
    },
  });

  if (insertError) {
    throw new Error(`Unable to record news import status: ${insertError.message}`);
  }
}

export async function hasQueuedNewsImportEvent(supabase, { jobId, lockId }) {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("details")
    .eq("action", NEWS_IMPORT_ACTIONS.started)
    .eq("target_id", jobId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    throw new Error(`Unable to verify queued news import: ${error.message}`);
  }

  return (data ?? []).some((row) => String(asDetails(row.details).lockId ?? "") === lockId);
}

export async function claimNewsImportLock(supabase, { jobId, lockId, startedAt }) {
  const claimedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("audit_logs")
    .update({
      action: NEWS_IMPORT_ACTIONS.claimed,
      details: {
        jobId,
        lockId,
        status: "running",
        startedAt,
        claimedAt,
      },
    })
    .eq("id", lockId)
    .eq("target_id", jobId)
    .eq("action", NEWS_IMPORT_ACTIONS.lock)
    .select("id");

  if (error) {
    throw new Error(`Unable to claim news import lock: ${error.message}`);
  }

  return Boolean(data?.length);
}

export async function releaseNewsImportLock(supabase, { jobId, lockId }) {
  const { error } = await supabase
    .from("audit_logs")
    .delete()
    .eq("id", lockId)
    .eq("target_id", jobId)
    .in("action", [NEWS_IMPORT_ACTIONS.lock, NEWS_IMPORT_ACTIONS.claimed]);

  if (error) {
    throw new Error(`Unable to release news import lock: ${error.message}`);
  }
}
