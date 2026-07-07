import { randomUUID } from "node:crypto";
import type { InArgs } from "@libsql/client";
import { libsqlClient } from "../libsql-client";
import type { ExportType } from "../../../shared/types";

export interface ExportHistoryRow {
  id: string;
  import_id: string | null;
  export_type: ExportType;
  filter_snapshot: string | null;
  file_name: string;
  row_count: number;
  created_at: number;
}

export async function recordExport(input: {
  importId?: string;
  exportType: ExportType;
  filterSnapshot?: Record<string, unknown>;
  fileName: string;
  rowCount: number;
}): Promise<ExportHistoryRow> {
  const row: ExportHistoryRow = {
    id: randomUUID(),
    import_id: input.importId ?? null,
    export_type: input.exportType,
    filter_snapshot: input.filterSnapshot
      ? JSON.stringify(input.filterSnapshot)
      : null,
    file_name: input.fileName,
    row_count: input.rowCount,
    created_at: Date.now(),
  };
  await libsqlClient.execute({
    sql: `INSERT INTO export_history (id, import_id, export_type, filter_snapshot, file_name, row_count, created_at)
     VALUES (:id, :import_id, :export_type, :filter_snapshot, :file_name, :row_count, :created_at)`,
    args: row as unknown as InArgs,
  });
  return row;
}

export async function listExports(limit = 50): Promise<ExportHistoryRow[]> {
  const result = await libsqlClient.execute({
    sql: "SELECT * FROM export_history ORDER BY created_at DESC LIMIT ?",
    args: [limit],
  });
  return result.rows as unknown as ExportHistoryRow[];
}
