import { randomUUID } from "node:crypto";
import { db } from "../client";

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

export function createImport(input: {
  fileName: string;
  fileType: "csv" | "xlsx";
}): ImportHistoryRow {
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
  db.prepare(
    `INSERT INTO import_history (id, file_name, file_type, row_count, column_mapping, status, job_id, created_at, completed_at)
     VALUES (@id, @file_name, @file_type, @row_count, @column_mapping, @status, @job_id, @created_at, @completed_at)`,
  ).run(row);
  return row;
}

export function getImport(id: string): ImportHistoryRow | undefined {
  return db
    .prepare<[string], ImportHistoryRow>(
      "SELECT * FROM import_history WHERE id = ?",
    )
    .get(id);
}

export function listImports(limit = 50): ImportHistoryRow[] {
  return db
    .prepare<[number], ImportHistoryRow>(
      "SELECT * FROM import_history ORDER BY created_at DESC LIMIT ?",
    )
    .all(limit);
}

export function updateImportMapping(
  id: string,
  columnMapping: Record<string, string>,
  rowCount: number,
): void {
  db.prepare(
    `UPDATE import_history SET column_mapping = ?, row_count = ?, status = 'mapped' WHERE id = ?`,
  ).run(JSON.stringify(columnMapping), rowCount, id);
}

export function updateImportStatus(
  id: string,
  status: ImportHistoryRow["status"],
  jobId?: string,
): void {
  db.prepare(
    `UPDATE import_history
     SET status = ?, job_id = COALESCE(?, job_id), completed_at = CASE WHEN ? IN ('completed','failed') THEN ? ELSE completed_at END
     WHERE id = ?`,
  ).run(status, jobId ?? null, status, Date.now(), id);
}
