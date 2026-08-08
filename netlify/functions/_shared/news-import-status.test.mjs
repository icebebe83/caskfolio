import assert from "node:assert/strict";
import test from "node:test";

import {
  NEWS_IMPORT_ACTIONS,
  createNewsImportLockId,
  deriveNewsImportStatus,
} from "./news-import-status.mjs";

const STARTED_AT = "2026-08-08T00:00:00.000Z";

test("news import lock id is stable inside a 15 minute bucket", () => {
  const first = createNewsImportLockId(new Date(STARTED_AT).getTime());
  const sameBucket = createNewsImportLockId(new Date("2026-08-08T00:14:59.000Z").getTime());
  const nextBucket = createNewsImportLockId(new Date("2026-08-08T00:15:00.000Z").getTime());

  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first, sameBucket);
  assert.notEqual(first, nextBucket);
});

test("latest started event reports running", () => {
  const status = deriveNewsImportStatus(
    [
      {
        action: NEWS_IMPORT_ACTIONS.started,
        target_id: "job-1",
        details: { startedAt: STARTED_AT },
        created_at: STARTED_AT,
      },
    ],
    { now: new Date("2026-08-08T00:05:00.000Z").getTime() },
  );

  assert.equal(status.status, "running");
  assert.equal(status.running, true);
  assert.equal(status.jobId, "job-1");
});

test("terminal event for the latest job reports success", () => {
  const status = deriveNewsImportStatus([
    {
      action: NEWS_IMPORT_ACTIONS.succeeded,
      target_id: "job-1",
      details: {
        startedAt: STARTED_AT,
        finishedAt: "2026-08-08T00:03:00.000Z",
        message: "News import completed.",
        count: 12,
      },
      created_at: "2026-08-08T00:03:00.000Z",
    },
    {
      action: NEWS_IMPORT_ACTIONS.started,
      target_id: "job-1",
      details: { startedAt: STARTED_AT },
      created_at: STARTED_AT,
    },
  ]);

  assert.equal(status.status, "success");
  assert.equal(status.running, false);
  assert.equal(status.count, 12);
  assert.equal(status.lastSuccessAt, "2026-08-08T00:03:00.000Z");
});

test("a stale started event reports failure and allows a later retry", () => {
  const status = deriveNewsImportStatus(
    [
      {
        action: NEWS_IMPORT_ACTIONS.started,
        target_id: "job-stale",
        details: { startedAt: STARTED_AT },
        created_at: STARTED_AT,
      },
    ],
    { now: new Date("2026-08-08T00:17:00.000Z").getTime() },
  );

  assert.equal(status.status, "failure");
  assert.equal(status.running, false);
  assert.match(status.lastError, /did not finish/i);
});

test("an older job completion does not hide a newer running job", () => {
  const status = deriveNewsImportStatus(
    [
      {
        action: NEWS_IMPORT_ACTIONS.succeeded,
        target_id: "job-old",
        details: { finishedAt: "2026-08-08T00:06:00.000Z" },
        created_at: "2026-08-08T00:06:00.000Z",
      },
      {
        action: NEWS_IMPORT_ACTIONS.started,
        target_id: "job-new",
        details: { startedAt: "2026-08-08T00:05:00.000Z" },
        created_at: "2026-08-08T00:05:00.000Z",
      },
      {
        action: NEWS_IMPORT_ACTIONS.started,
        target_id: "job-old",
        details: { startedAt: STARTED_AT },
        created_at: STARTED_AT,
      },
    ],
    { now: new Date("2026-08-08T00:07:00.000Z").getTime() },
  );

  assert.equal(status.status, "running");
  assert.equal(status.jobId, "job-new");
});

test("equal timestamps use the audit id as a deterministic tie-break", () => {
  const status = deriveNewsImportStatus(
    [
      {
        id: "00000000-0000-4000-8000-000000000001",
        action: NEWS_IMPORT_ACTIONS.started,
        target_id: "job-a",
        details: { startedAt: STARTED_AT },
        created_at: STARTED_AT,
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        action: NEWS_IMPORT_ACTIONS.started,
        target_id: "job-b",
        details: { startedAt: STARTED_AT },
        created_at: STARTED_AT,
      },
    ],
    { now: new Date("2026-08-08T00:05:00.000Z").getTime() },
  );

  assert.equal(status.status, "running");
  assert.equal(status.jobId, "job-b");
});
