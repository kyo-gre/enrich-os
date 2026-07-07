import { randomUUID } from "node:crypto";
import type { InArgs } from "@libsql/client";
import { libsqlClient } from "../libsql-client";

export interface ImportHistoryRow {
  id: string;
  file_name: string;
  file_type: "csv" | "xlsx";
  row_count: number;
  column_mapping: string | null;
  status: "uploaded" | "mapped" | "processing" | "completed" | "failed";
  job_id: string | null;
  created_at: number;
  completed_at: number | null;
}

export async function createImport(input: {
  fileName: string;
  fileType: "csv" | "xlsx";
}): Promise<ImportHistoryRow> {
  const row: ImportHistoryRow = {
    id: randomUUID(),
    file_name: input.fileName,
    file_type: input.fileType,
    row_count: 0,
    column_mapping: null,
    status: "uploaded",
    job_id: null,
    created_at: Date.now(),
    completed_at: null,
  };
  await libsqlClient.execute({
    sql: `INSERT INTO import_history (id, file_name, file_type, row_count, column_mapping, status, job_id, created_at, completed_at)
     VALUES (:id, :file_name, :file_type, :row_count, :column_mapping, :status, :job_id, :created_at, :completed_at)`,
    args: row as unknown as InArgs,
  });
  return row;
}

export async function getImport(
  id: string,
): Promise<ImportHistoryRow | undefined> {
  const result = await libsqlClient.execute({
    sql: "SELECT * FROM import_history WHERE id = ?",
    args: [id],
  });
  return result.rows[0] as unknown as ImportHistoryRow | undefined;
}

export async function listImports(limit = 50): Promise<ImportHistoryRow[]> {
  const result = await libsqlClient.execute({
    sql: "SELECT * FROM import_history ORDER BY created_at DESC LIMIT ?",
    args: [limit],
  });
  return result.rows as unknown as ImportHistoryRow[];
}

export async function updateImportMapping(
  id: string,
  columnMapping: Record<string, string>,
  rowCount: number,
): Promise<void> {
  await libsqlClient.execute({
    sql: `UPDATE import_history SET column_mapping = ?, row_count = ?, status = 'mapped' WHERE id = ?`,
    args: [JSON.stringify(columnMapping), rowCount, id],
  });
}

export async function updateImportStatus(
  id: string,
  status: ImportHistoryRow["status"],
  jobId?: string,
): Promise<void> {
  await libsqlClient.execute({
    sql: `UPDATE import_history
     SET status = ?, job_id = COALESCE(?, job_id), completed_at = CASE WHEN ? IN ('completed','failed') THEN ? ELSE completed_at END
     WHERE id = ?`,
    args: [status, jobId ?? null, status, Date.now(), id],
  });
}
