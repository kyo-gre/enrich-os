import { randomUUID } from "node:crypto";
import { db } from "../client";

export interface ProcessingLogRow {
  id: string;
  creator_id: string;
  job_id: string | null;
  step: string;
  status: "success" | "skipped" | "failed";
  detail: string | null;
  created_at: number;
}

export function addProcessingLog(input: {
  creatorId: string;
  jobId?: string;
  step: string;
  status: ProcessingLogRow["status"];
  detail?: Record<string, unknown>;
}): void {
  db.prepare(
    `INSERT INTO processing_logs (id, creator_id, job_id, step, status, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    input.creatorId,
    input.jobId ?? null,
    input.step,
    input.status,
    input.detail ? JSON.stringify(input.detail) : null,
    Date.now(),
  );
}

export function listProcessingLogsForCreator(
  creatorId: string,
): ProcessingLogRow[] {
  return db
    .prepare<[string], ProcessingLogRow>(
      "SELECT * FROM processing_logs WHERE creator_id = ? ORDER BY created_at ASC",
    )
    .all(creatorId);
}
