import type { ConfidenceSource, ProcessingStatus, ReviewStatus } from "../../shared/types";

/** Matches the existing GET /api/creators response shape — no contract change. */
export interface ReviewCreator {
  id: string;
  firstName: string | null;
  lastName: string | null;
  confidenceScore: number | null;
  confidenceSource: ConfidenceSource | null;
  processingStatus: ProcessingStatus;
  needsReview: boolean;
  reviewStatus: ReviewStatus;
  duplicateOfCreatorId: string | null;
}

/** Matches the existing GET /api/creators/[id] response shape. */
export interface ReviewCreatorDetail extends ReviewCreator {
  displayName: string | null;
  platform: string | null;
  profileUrl: string | null;
  email: string | null;
  socialHandle: string | null;
  notes: string | null;
  identityCacheId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProcessingLogEntry {
  id: string;
  step: string;
  status: "success" | "skipped" | "failed";
  detail: Record<string, unknown> | null;
  createdAt: number;
}

export interface ProfileSnapshotEntry {
  id: string;
  platform: string;
  fetchedVia: "static" | "browser";
  rawSnapshot: Record<string, unknown>;
  fetchedAt: number;
}
