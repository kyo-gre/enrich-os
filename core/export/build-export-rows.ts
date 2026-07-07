import type { FullExportRow, QuickExportRow } from "../../shared/types";

/** Source-agnostic shape the export builders need — callers (server/services/export.service.ts) map a CreatorRow into this. */
export interface ExportableCreator {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  platform?: string;
  profileUrl?: string;
  email?: string;
  socialHandle?: string;
  confidenceScore?: number;
  confidenceSource?: string;
  processingStatus?: string;
  needsReview?: boolean;
  reviewStatus?: string;
  pipelineVersion?: string;
  notes?: string;
}

export function toQuickExportRow(creator: ExportableCreator): QuickExportRow {
  return {
    firstName: creator.firstName,
    email: creator.email,
    socialHandle: creator.socialHandle,
  };
}

export function toFullExportRow(
  creator: ExportableCreator,
  exportedAt: number,
): FullExportRow {
  return {
    ...toQuickExportRow(creator),
    lastName: creator.lastName,
    displayName: creator.displayName,
    platform: creator.platform,
    profileUrl: creator.profileUrl,
    confidenceScore: creator.confidenceScore,
    confidenceSource: creator.confidenceSource,
    processingStatus: creator.processingStatus,
    needsReview: creator.needsReview,
    reviewStatus: creator.reviewStatus as FullExportRow["reviewStatus"],
    pipelineVersion: creator.pipelineVersion,
    exportedAt,
    notes: creator.notes,
  };
}
