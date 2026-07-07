import { randomUUID } from "node:crypto";
import { db } from "../client";
import type {
  ConfidenceSource,
  ProcessingStatus,
  ReviewStatus,
} from "../../../shared/types";

export interface CreatorRow {
  id: string;
  import_id: string;
  row_index: number;

  raw_full_name: string | null;
  raw_username: string | null;
  raw_email: string | null;
  raw_profile_url: string | null;
  raw_platform: string | null;
  raw_payload: string | null;

  resolved_first_name: string | null;
  resolved_last_name: string | null;
  resolved_display_name: string | null;
  resolved_platform: string | null;
  resolved_profile_url: string | null;
  resolved_email: string | null;
  resolved_social_handle: string | null;

  confidence_score: number | null;
  confidence_source: ConfidenceSource | null;
  processing_status: ProcessingStatus;
  pipeline_version: string;

  needs_review: 0 | 1;
  review_status: ReviewStatus;
  notes: string | null;

  identity_cache_id: string | null;
  duplicate_of_creator_id: string | null;

  created_at: number;
  updated_at: number;
}

export interface CreateCreatorInput {
  importId: string;
  rowIndex: number;
  rawFullName?: string;
  rawUsername?: string;
  rawEmail?: string;
  rawProfileUrl?: string;
  rawPlatform?: string;
  rawPayload: Record<string, unknown>;
  pipelineVersion: string;
}

export function createCreator(input: CreateCreatorInput): CreatorRow {
  const now = Date.now();
  const row: CreatorRow = {
    id: randomUUID(),
    import_id: input.importId,
    row_index: input.rowIndex,
    raw_full_name: input.rawFullName ?? null,
    raw_username: input.rawUsername ?? null,
    raw_email: input.rawEmail ?? null,
    raw_profile_url: input.rawProfileUrl ?? null,
    raw_platform: input.rawPlatform ?? null,
    raw_payload: JSON.stringify(input.rawPayload),
    resolved_first_name: null,
    resolved_last_name: null,
    resolved_display_name: null,
    resolved_platform: null,
    resolved_profile_url: null,
    resolved_email: null,
    resolved_social_handle: null,
    confidence_score: null,
    confidence_source: null,
    processing_status: "failed",
    pipeline_version: input.pipelineVersion,
    needs_review: 0,
    review_status: "pending",
    notes: null,
    identity_cache_id: null,
    duplicate_of_creator_id: null,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO creators (
      id, import_id, row_index, raw_full_name, raw_username, raw_email, raw_profile_url, raw_platform, raw_payload,
      resolved_first_name, resolved_last_name, resolved_display_name, resolved_platform, resolved_profile_url,
      resolved_email, resolved_social_handle, confidence_score, confidence_source, processing_status,
      pipeline_version, needs_review, review_status, notes, identity_cache_id, duplicate_of_creator_id,
      created_at, updated_at
    ) VALUES (
      @id, @import_id, @row_index, @raw_full_name, @raw_username, @raw_email, @raw_profile_url, @raw_platform, @raw_payload,
      @resolved_first_name, @resolved_last_name, @resolved_display_name, @resolved_platform, @resolved_profile_url,
      @resolved_email, @resolved_social_handle, @confidence_score, @confidence_source, @processing_status,
      @pipeline_version, @needs_review, @review_status, @notes, @identity_cache_id, @duplicate_of_creator_id,
      @created_at, @updated_at
    )`,
  ).run(row);
  return row;
}

export function getCreator(id: string): CreatorRow | undefined {
  return db
    .prepare<[string], CreatorRow>("SELECT * FROM creators WHERE id = ?")
    .get(id);
}

export function listCreatorsByImport(importId: string): CreatorRow[] {
  return db
    .prepare<[string], CreatorRow>(
      "SELECT * FROM creators WHERE import_id = ? ORDER BY row_index ASC",
    )
    .all(importId);
}

export interface CreatorStats {
  processed: number;
  needsReview: number;
  cacheHits: number;
  duplicates: number;
}

export function getCreatorStats(importId: string): CreatorStats {
  const row = db
    .prepare<
      [string],
      {
        processed: number;
        needs_review: number | null;
        cache_hits: number | null;
        duplicates: number | null;
      }
    >(
      `SELECT
        COUNT(*) AS processed,
        SUM(CASE WHEN needs_review = 1 THEN 1 ELSE 0 END) AS needs_review,
        SUM(CASE WHEN processing_status = 'cache_hit' THEN 1 ELSE 0 END) AS cache_hits,
        SUM(CASE WHEN duplicate_of_creator_id IS NOT NULL THEN 1 ELSE 0 END) AS duplicates
       FROM creators WHERE import_id = ?`,
    )
    .get(importId)!;

  return {
    processed: row.processed,
    needsReview: row.needs_review ?? 0,
    cacheHits: row.cache_hits ?? 0,
    duplicates: row.duplicates ?? 0,
  };
}

export interface ResolvedIdentityUpdate {
  resolvedFirstName?: string;
  resolvedLastName?: string;
  resolvedDisplayName?: string;
  resolvedPlatform?: string;
  resolvedProfileUrl?: string;
  resolvedEmail?: string;
  resolvedSocialHandle?: string;
  confidenceScore: number;
  // Absent only when processingStatus is "failed" (no candidate found at all).
  confidenceSource?: ConfidenceSource;
  processingStatus: ProcessingStatus;
  pipelineVersion: string;
  needsReview: boolean;
  identityCacheId?: string;
}

export function applyResolvedIdentity(
  id: string,
  update: ResolvedIdentityUpdate,
): void {
  db.prepare(
    `UPDATE creators SET
      resolved_first_name = @resolved_first_name,
      resolved_last_name = @resolved_last_name,
      resolved_display_name = @resolved_display_name,
      resolved_platform = @resolved_platform,
      resolved_profile_url = @resolved_profile_url,
      resolved_email = @resolved_email,
      resolved_social_handle = @resolved_social_handle,
      confidence_score = @confidence_score,
      confidence_source = @confidence_source,
      processing_status = @processing_status,
      pipeline_version = @pipeline_version,
      needs_review = @needs_review,
      identity_cache_id = COALESCE(@identity_cache_id, identity_cache_id),
      updated_at = @updated_at
     WHERE id = @id`,
  ).run({
    id,
    resolved_first_name: update.resolvedFirstName ?? null,
    resolved_last_name: update.resolvedLastName ?? null,
    resolved_display_name: update.resolvedDisplayName ?? null,
    resolved_platform: update.resolvedPlatform ?? null,
    resolved_profile_url: update.resolvedProfileUrl ?? null,
    resolved_email: update.resolvedEmail ?? null,
    resolved_social_handle: update.resolvedSocialHandle ?? null,
    confidence_score: update.confidenceScore,
    confidence_source: update.confidenceSource ?? null,
    processing_status: update.processingStatus,
    pipeline_version: update.pipelineVersion,
    needs_review: update.needsReview ? 1 : 0,
    identity_cache_id: update.identityCacheId ?? null,
    updated_at: Date.now(),
  });
}

export interface RawMappedFields {
  rawFullName?: string;
  rawUsername?: string;
  rawEmail?: string;
  rawProfileUrl?: string;
  rawPlatform?: string;
}

/** Fills in raw_* columns from a confirmed column mapping, applied after raw_payload was already stored at upload time. */
export function setRawMappedFields(id: string, fields: RawMappedFields): void {
  db.prepare(
    `UPDATE creators SET
      raw_full_name = @raw_full_name,
      raw_username = @raw_username,
      raw_email = @raw_email,
      raw_profile_url = @raw_profile_url,
      raw_platform = @raw_platform,
      updated_at = @updated_at
     WHERE id = @id`,
  ).run({
    id,
    raw_full_name: fields.rawFullName ?? null,
    raw_username: fields.rawUsername ?? null,
    raw_email: fields.rawEmail ?? null,
    raw_profile_url: fields.rawProfileUrl ?? null,
    raw_platform: fields.rawPlatform ?? null,
    updated_at: Date.now(),
  });
}

export function setReviewStatus(id: string, status: ReviewStatus): void {
  db.prepare(
    "UPDATE creators SET review_status = ?, updated_at = ? WHERE id = ?",
  ).run(status, Date.now(), id);
}

export function markDuplicateOf(id: string, targetCreatorId: string): void {
  db.prepare(
    "UPDATE creators SET duplicate_of_creator_id = ?, updated_at = ? WHERE id = ?",
  ).run(targetCreatorId, Date.now(), id);
}

export function clearDuplicateOf(id: string): void {
  db.prepare(
    "UPDATE creators SET duplicate_of_creator_id = NULL, updated_at = ? WHERE id = ?",
  ).run(Date.now(), id);
}
