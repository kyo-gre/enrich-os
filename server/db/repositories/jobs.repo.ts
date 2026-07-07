import { randomUUID } from "node:crypto";
import type { InArgs } from "@libsql/client";
import { libsqlClient } from "../libsql-client";

/**
 * First repository migrated to the libSQL connection path (Phase 2 of the
 * deployment hardening effort — see docs/DEPLOYMENT_HARDENING.md). Chosen
 * because it has zero callers today (unused scaffold, see commit
 * `28ad12a`), so this migration changes no observable application
 * behavior. Same SQL text and parameter binding as before; only the
 * client API and `async`/`await` changed.
 */

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

export async function createJob(input: {
  importId: string;
  totalRows: number;
  pipelineVersion: string;
}): Promise<JobRow> {
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
  await libsqlClient.execute({
    sql: `INSERT INTO jobs (
      id, import_id, status, total_rows, processed_rows, last_processed_row_index,
      current_creator_id, pipeline_version, error, started_at, updated_at, completed_at
    ) VALUES (
      :id, :import_id, :status, :total_rows, :processed_rows, :last_processed_row_index,
      :current_creator_id, :pipeline_version, :error, :started_at, :updated_at, :completed_at
    )`,
    args: row as unknown as InArgs,
  });
  return row;
}

export async function getJob(id: string): Promise<JobRow | undefined> {
  const result = await libsqlClient.execute({
    sql: "SELECT * FROM jobs WHERE id = ?",
    args: [id],
  });
  return result.rows[0] as unknown as JobRow | undefined;
}

export async function createJobItem(input: {
  jobId: string;
  creatorId: string;
  rowIndex: number;
}): Promise<JobItemRow> {
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
  await libsqlClient.execute({
    sql: `INSERT INTO job_items (id, job_id, creator_id, row_index, status, attempts, updated_at)
     VALUES (:id, :job_id, :creator_id, :row_index, :status, :attempts, :updated_at)`,
    args: row as unknown as InArgs,
  });
  return row;
}

/** Resume checkpoint: next unfinished row in job order. */
export async function nextPendingJobItem(
  jobId: string,
): Promise<JobItemRow | undefined> {
  const result = await libsqlClient.execute({
    sql: `SELECT * FROM job_items WHERE job_id = ? AND status IN ('pending', 'failed') ORDER BY row_index ASC LIMIT 1`,
    args: [jobId],
  });
  return result.rows[0] as unknown as JobItemRow | undefined;
}

export async function updateJobItemStatus(
  id: string,
  status: JobItemRow["status"],
): Promise<void> {
  await libsqlClient.execute({
    sql: "UPDATE job_items SET status = ?, attempts = attempts + 1, updated_at = ? WHERE id = ?",
    args: [status, Date.now(), id],
  });
}

export async function advanceJobProgress(
  jobId: string,
  processedRows: number,
  lastProcessedRowIndex: number,
  currentCreatorId: string | null,
): Promise<void> {
  await libsqlClient.execute({
    sql: `UPDATE jobs SET processed_rows = ?, last_processed_row_index = ?, current_creator_id = ?, updated_at = ? WHERE id = ?`,
    args: [processedRows, lastProcessedRowIndex, currentCreatorId, Date.now(), jobId],
  });
}

export async function setJobStatus(
  id: string,
  status: JobRow["status"],
  error?: string,
): Promise<void> {
  const now = Date.now();
  await libsqlClient.execute({
    sql: `UPDATE jobs SET
      status = ?,
      error = ?,
      started_at = CASE WHEN ? = 'running' AND started_at IS NULL THEN ? ELSE started_at END,
      completed_at = CASE WHEN ? IN ('completed','failed') THEN ? ELSE completed_at END,
      updated_at = ?
     WHERE id = ?`,
    args: [status, error ?? null, status, now, status, now, now, id],
  });
}
