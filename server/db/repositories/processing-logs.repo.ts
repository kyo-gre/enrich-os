import { randomUUID } from "node:crypto";
import type { InArgs } from "@libsql/client";
import { libsqlClient } from "../libsql-client";

export interface ProcessingLogRow {
  id: string;
  creator_id: string;
  job_id: string | null;
  step: string;
  status: "success" | "skipped" | "failed";
  detail: string | null;
  created_at: number;
}

export async function addProcessingLog(input: {
  creatorId: string;
  jobId?: string;
  step: string;
  status: ProcessingLogRow["status"];
  detail?: Record<string, unknown>;
}): Promise<void> {
  await libsqlClient.execute({
    sql: `INSERT INTO processing_logs (id, creator_id, job_id, step, status, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      randomUUID(),
      input.creatorId,
      input.jobId ?? null,
      input.step,
      input.status,
      input.detail ? JSON.stringify(input.detail) : null,
      Date.now(),
    ] as InArgs,
  });
}

export async function listProcessingLogsForCreator(
  creatorId: string,
): Promise<ProcessingLogRow[]> {
  const result = await libsqlClient.execute({
    sql: "SELECT * FROM processing_logs WHERE creator_id = ? ORDER BY created_at ASC",
    args: [creatorId],
  });
  return result.rows as unknown as ProcessingLogRow[];
}
