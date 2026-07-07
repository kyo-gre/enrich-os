import Papa from "papaparse";
import { toFullExportRow, toQuickExportRow } from "../../core/export/build-export-rows";
import { listCreatorsByImport, type CreatorRow } from "../db/repositories/creators.repo";
import { recordExport } from "../db/repositories/exports.repo";
import type { ExportType } from "../../shared/types";

/**
 * Ignored records (reviewer marked as junk) and merged duplicates are
 * excluded — everything else, including needs_review rows, is included so
 * a full export reflects the true state of the pipeline rather than only
 * "clean" rows.
 *
 * "Merged duplicate" here means duplicate_of_creator_id is set, which only
 * happens via mergeDuplicateCreators (a human confirming a merge in the
 * review UI). findDuplicateCandidates (automated detection) never writes
 * that field — it only returns candidate groups for a reviewer to act on.
 * So a record flagged as a possible duplicate but not yet merged is NOT
 * excluded here; it still exports normally until a human confirms the
 * merge. Only records whose canonical data now lives on another (merge
 * target) record are dropped.
 */
function isExportable(creator: CreatorRow): boolean {
  return creator.review_status !== "ignored" && !creator.duplicate_of_creator_id;
}

export interface ExportResult {
  csv: string;
  fileName: string;
  rowCount: number;
}

export async function exportCreators(
  importId: string,
  type: ExportType,
): Promise<ExportResult> {
  const creators = (await listCreatorsByImport(importId)).filter(isExportable);
  const exportedAt = Date.now();

  const rows = creators.map((creator) => {
    const exportable = {
      firstName: creator.resolved_first_name ?? undefined,
      lastName: creator.resolved_last_name ?? undefined,
      displayName: creator.resolved_display_name ?? undefined,
      platform: creator.resolved_platform ?? undefined,
      profileUrl: creator.resolved_profile_url ?? undefined,
      email: creator.resolved_email ?? undefined,
      socialHandle: creator.resolved_social_handle ?? undefined,
      confidenceScore: creator.confidence_score ?? undefined,
      confidenceSource: creator.confidence_source ?? undefined,
      processingStatus: creator.processing_status,
      needsReview: Boolean(creator.needs_review),
      reviewStatus: creator.review_status,
      pipelineVersion: creator.pipeline_version,
      notes: creator.notes ?? undefined,
    };
    return type === "quick"
      ? toQuickExportRow(exportable)
      : toFullExportRow(exportable, exportedAt);
  });

  const csv = Papa.unparse(rows);
  const fileName = `export-${type}-${importId}-${exportedAt}.csv`;

  await recordExport({ importId, exportType: type, fileName, rowCount: rows.length });

  return { csv, fileName, rowCount: rows.length };
}
