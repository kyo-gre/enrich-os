import pipelineVersionConfig from "../../config/pipeline-version.json";
import { parseImportFile } from "../../core/import/file-parser";
import {
  mapRowToCreatorInput,
  suggestColumnMapping,
} from "../../core/import/column-mapper";
import { normalizeCreator } from "../../core/normalization/normalize";
import type { ColumnMapping } from "../../shared/types";
import { createImport, updateImportMapping } from "../db/repositories/imports.repo";
import {
  createCreator,
  listCreatorsByImport,
  setRawMappedFields,
} from "../db/repositories/creators.repo";

const PIPELINE_VERSION = pipelineVersionConfig.version;
const PREVIEW_LIMIT = 20;

export interface IngestFileResult {
  importId: string;
  headers: string[];
  suggestedMapping: ColumnMapping;
  previewRows: Record<string, unknown>[];
  rowCount: number;
}

export function ingestFile(
  fileName: string,
  fileType: "csv" | "xlsx",
  buffer: Buffer,
): IngestFileResult {
  const { headers, rows } = parseImportFile(buffer, fileType);
  const importRow = createImport({ fileName, fileType });

  rows.forEach((row, index) => {
    createCreator({
      importId: importRow.id,
      rowIndex: index,
      rawPayload: row,
      pipelineVersion: PIPELINE_VERSION,
    });
  });

  return {
    importId: importRow.id,
    headers,
    suggestedMapping: suggestColumnMapping(headers),
    previewRows: rows.slice(0, PREVIEW_LIMIT),
    rowCount: rows.length,
  };
}

export interface ConfirmColumnMappingResult {
  rowCount: number;
  previewRows: Array<ReturnType<typeof normalizeCreator>>;
}

export function confirmColumnMapping(
  importId: string,
  mapping: ColumnMapping,
): ConfirmColumnMappingResult {
  const creators = listCreatorsByImport(importId);

  const previewRows: Array<ReturnType<typeof normalizeCreator>> = [];
  for (const creator of creators) {
    const rawPayload = creator.raw_payload
      ? (JSON.parse(creator.raw_payload) as Record<string, unknown>)
      : {};
    const mapped = mapRowToCreatorInput(rawPayload, mapping);
    setRawMappedFields(creator.id, {
      rawFullName: mapped.rawFullName,
      rawUsername: mapped.rawUsername,
      rawEmail: mapped.rawEmail,
      rawProfileUrl: mapped.rawProfileUrl,
      rawPlatform: mapped.rawPlatform,
    });

    if (previewRows.length < PREVIEW_LIMIT) {
      previewRows.push(normalizeCreator(mapped));
    }
  }

  updateImportMapping(importId, mapping, creators.length);

  return { rowCount: creators.length, previewRows };
}
