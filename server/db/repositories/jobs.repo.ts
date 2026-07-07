import { randomUUID } from "node:crypto";
import { db } from "../client";

export interface JobRow {
  id: string;
  import_id: string;
  status: "queued" | "running" | "paused" | "completed" | "failed";
  total_rows: number;
  processed_rows: number;
  last_processed_row_index: number;
  current_creator_id: string | null;
  pipeline_version: string;
  error: string | null;
  started_at: number | null;
  updated_at: number;
  completed_at: number | null;
}

export interface JobItemRow {
  id: string;
  job_id: string;
  creator_id: string;
  row_index: number;
  status: "pending" | "processing" | "done" | "failed" | "skipped_cache_hit";
  attempts: number;
  updated_at: number;
}

export function createJob(input: {
  importId: string;
  totalRows: number;
  pipelineVersion: string;
}): JobRow {
  const now = Date.now();
  const row: JobRow = {
    id: randomUUID(),
    import_id: input.importId,
    status: "queued",
    total_rows: input.totalRows,
    processed_rows: 0,
    last_processed_row_index: -1,
    current_creator_id: null,
    pipeline_version: input.pipelineVersion,
    error: null,
    started_at: null,
    updated_at: now,
    completed_at: null,
  };
  db.prepare(
    `INSERT INTO jobs (
      id, import_id, status, total_rows, processed_rows, last_processed_row_index,
      current_creator_id, pipeline_version, error, started_at, updated_at, completed_at
    ) VALUES (
      @id, @import_id, @status, @total_rows, @processed_rows, @last_processed_row_index,
      @current_creator_id, @pipeline_version, @error, @started_at, @updated_at, @completed_at
    )`,
  ).run(row);
  return row;
}

export function getJob(id: string): JobRow | undefined {
  return db.prepare<[string], JobRow>("SELECT * FROM jobs WHERE id = ?").get(id);
}

export function createJobItem(input: {
  jobId: string;
  creatorId: string;
  rowIndex: number;
}): JobItemRow {
  const now = Date.now();
  const row: JobItemRow = {
    id: randomUUID(),
    job_id: input.jobId,
    creator_id: input.creatorId,
    row_index: input.rowIndex,
    status: "pending",
    attempts: 0,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO job_items (id, job_id, creator_id, row_index, status, attempts, updated_at)
     VALUES (@id, @job_id, @creator_id, @row_index, @status, @attempts, @updated_at)`,
  ).run(row);
  return row;
}

/** Resume checkpoint: next unfinished row in job order. */
export function nextPendingJobItem(jobId: string): JobItemRow | undefined {
  return db
    .prepare<[string], JobItemRow>(
      `SELECT * FROM job_items WHERE job_id = ? AND status IN ('pending', 'failed') ORDER BY row_index ASC LIMIT 1`,
    )
    .get(jobId);
}

export function updateJobItemStatus(
  id: string,
  status: JobItemRow["status"],
): void {
  db.prepare(
    "UPDATE job_items SET status = ?, attempts = attempts + 1, updated_at = ? WHERE id = ?",
  ).run(status, Date.now(), id);
}

export function advanceJobProgress(
  jobId: string,
  processedRows: number,
  lastProcessedRowIndex: number,
  currentCreatorId: string | null,
): void {
  db.prepare(
    `UPDATE jobs SET processed_rows = ?, last_processed_row_index = ?, current_creator_id = ?, updated_at = ? WHERE id = ?`,
  ).run(processedRows, lastProcessedRowIndex, currentCreatorId, Date.now(), jobId);
}

export function setJobStatus(
  id: string,
  status: JobRow["status"],
  error?: string,
): void {
  const now = Date.now();
  db.prepare(
    `UPDATE jobs SET
      status = ?,
      error = ?,
      started_at = CASE WHEN ? = 'running' AND started_at IS NULL THEN ? ELSE started_at END,
      completed_at = CASE WHEN ? IN ('completed','failed') THEN ? ELSE completed_at END,
      updated_at = ?
     WHERE id = ?`,
  ).run(status, error ?? null, status, now, status, now, now, id);
}
