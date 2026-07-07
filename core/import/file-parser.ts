import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { RawImportRow } from "../../shared/types";

export interface ParsedFile {
  headers: string[];
  rows: RawImportRow[];
}

export function parseCsv(content: string): ParsedFile {
  const result = Papa.parse<RawImportRow>(content, {
    header: true,
    skipEmptyLines: true,
  });
  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
  };
}

export function parseXlsx(buffer: Buffer): ParsedFile {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<RawImportRow>(sheet, { defval: "" });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

export function parseImportFile(
  buffer: Buffer,
  fileType: "csv" | "xlsx",
): ParsedFile {
  if (fileType === "csv") {
    return parseCsv(buffer.toString("utf-8"));
  }
  return parseXlsx(buffer);
}
