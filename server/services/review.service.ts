import pipelineVersionConfig from "../../config/pipeline-version.json";
import { buildIdentityKeys } from "../../core/dedupe/canonicalize-key";
import {
  applyResolvedIdentity,
  clearDuplicateOf,
  getCreator,
  markDuplicateOf,
  setReviewStatus,
  type CreatorRow,
} from "../db/repositories/creators.repo";
import {
  applyManualOverride,
  createIdentityCache,
} from "../db/repositories/identity-cache.repo";
import {
  addProcessingLog,
  listProcessingLogsForCreator,
} from "../db/repositories/processing-logs.repo";
import type { ConfidenceSource, ProcessingStatus, ReviewStatus } from "../../shared/types";

const PIPELINE_VERSION = pipelineVersionConfig.version;

export const OVERRIDABLE_FIELDS = [
  "firstName",
  "lastName",
  "displayName",
  "platform",
  "profileUrl",
  "email",
  "socialHandle",
] as const;
export type OverridableField = (typeof OVERRIDABLE_FIELDS)[number];

function getResolvedFieldValue(
  creator: CreatorRow,
  field: OverridableField,
): string | null {
  switch (field) {
    case "firstName":
      return creator.resolved_first_name;
    case "lastName":
      return creator.resolved_last_name;
    case "displayName":
      return creator.resolved_display_name;
    case "platform":
      return creator.resolved_platform;
    case "profileUrl":
      return creator.resolved_profile_url;
    case "email":
      return creator.resolved_email;
    case "socialHandle":
      return creator.resolved_social_handle;
  }
}

/** Builds a full resolvedFirstName/.../resolvedEmail field set from `creator`, with `field` swapped for `newValue`. */
function fieldsWithOverride(
  creator: CreatorRow,
  field: OverridableField,
  newValue: string,
) {
  return {
    resolvedFirstName:
      field === "firstName" ? newValue : creator.resolved_first_name ?? undefined,
    resolvedLastName:
      field === "lastName" ? newValue : creator.resolved_last_name ?? undefined,
    resolvedDisplayName:
      field === "displayName" ? newValue : creator.resolved_display_name ?? undefined,
    resolvedPlatform:
      field === "platform" ? newValue : creator.resolved_platform ?? undefined,
    resolvedProfileUrl:
      field === "profileUrl" ? newValue : creator.resolved_profile_url ?? undefined,
    resolvedSocialHandle:
      field === "socialHandle" ? newValue : creator.resolved_social_handle ?? undefined,
    resolvedEmail:
      field === "email" ? newValue : creator.resolved_email ?? undefined,
  };
}

export function approveCreator(creatorId: string): void {
  setReviewStatus(creatorId, "approved");
  addProcessingLog({ creatorId, step: "review_approved", status: "success" });
}

export function ignoreCreator(creatorId: string): void {
  setReviewStatus(creatorId, "ignored");
  addProcessingLog({ creatorId, step: "review_ignored", status: "success" });
}

/** Creates a bare identity_cache entry from a creator's current fields, for a record that was never cached (e.g. it needed review). */
function createFallbackIdentityCache(creator: CreatorRow): string {
  const keys = buildIdentityKeys({
    email: creator.resolved_email ?? creator.raw_email ?? undefined,
    username: creator.resolved_social_handle ?? creator.raw_username ?? undefined,
    profileUrl: creator.resolved_profile_url ?? creator.raw_profile_url ?? undefined,
  });
  const row = createIdentityCache({
    firstName: creator.resolved_first_name ?? undefined,
    lastName: creator.resolved_last_name ?? undefined,
    displayName: creator.resolved_display_name ?? undefined,
    platform: creator.resolved_platform ?? undefined,
    profileUrl: creator.resolved_profile_url ?? undefined,
    email: creator.resolved_email ?? undefined,
    socialHandle: creator.resolved_social_handle ?? undefined,
    confidenceScore: creator.confidence_score ?? 0,
    confidenceSource: creator.confidence_source ?? "manual_override",
    pipelineVersion: PIPELINE_VERSION,
    keys,
  });
  return row.id;
}

/**
 * Applies a human correction for a single field. A manual override always
 * wins going forward: confidence is set to 100 with source
 * "manual_override" and the record no longer needs review.
 *
 * The correction is written to both the creator record (reflected
 * immediately) and its identity_cache entry (creating one first if this
 * record was never cached — e.g. it previously needed review), so the same
 * correction benefits every future record sharing one of this identity's
 * keys, and so it's protected from being silently overwritten later by
 * upsertIdentityCache (which never touches an existing cache row's fields).
 */
export function applyCreatorOverride(
  creatorId: string,
  field: OverridableField,
  newValue: string,
  reason?: string,
): CreatorRow {
  const creator = getCreator(creatorId);
  if (!creator) throw new Error(`Creator not found: ${creatorId}`);

  const oldValue = getResolvedFieldValue(creator, field);
  const identityCacheId =
    creator.identity_cache_id ?? createFallbackIdentityCache(creator);

  applyManualOverride(identityCacheId, field, oldValue, newValue, reason);

  applyResolvedIdentity(creatorId, {
    ...fieldsWithOverride(creator, field, newValue),
    confidenceScore: 100,
    confidenceSource: "manual_override",
    processingStatus: "enriched",
    pipelineVersion: PIPELINE_VERSION,
    needsReview: false,
    identityCacheId,
  });
  setReviewStatus(creatorId, "approved");

  addProcessingLog({
    creatorId,
    step: "manual_override",
    status: "success",
    detail: { field, oldValue, newValue, reason },
  });

  return getCreator(creatorId)!;
}

interface CreatorIdentitySnapshot {
  resolvedFirstName?: string;
  resolvedLastName?: string;
  resolvedDisplayName?: string;
  resolvedPlatform?: string;
  resolvedProfileUrl?: string;
  resolvedSocialHandle?: string;
  resolvedEmail?: string;
  confidenceScore: number;
  confidenceSource?: string;
  processingStatus: string;
  pipelineVersion: string;
  needsReview: boolean;
  reviewStatus: ReviewStatus;
  identityCacheId?: string;
}

function snapshotIdentity(creator: CreatorRow): CreatorIdentitySnapshot {
  return {
    resolvedFirstName: creator.resolved_first_name ?? undefined,
    resolvedLastName: creator.resolved_last_name ?? undefined,
    resolvedDisplayName: creator.resolved_display_name ?? undefined,
    resolvedPlatform: creator.resolved_platform ?? undefined,
    resolvedProfileUrl: creator.resolved_profile_url ?? undefined,
    resolvedSocialHandle: creator.resolved_social_handle ?? undefined,
    resolvedEmail: creator.resolved_email ?? undefined,
    confidenceScore: creator.confidence_score ?? 0,
    confidenceSource: creator.confidence_source ?? undefined,
    processingStatus: creator.processing_status,
    pipelineVersion: creator.pipeline_version,
    needsReview: Boolean(creator.needs_review),
    reviewStatus: creator.review_status,
    identityCacheId: creator.identity_cache_id ?? undefined,
  };
}

/**
 * Merges ARE reversible (documented decision, ahead of automated duplicate
 * detection landing): before overwriting the source's resolved identity,
 * a full snapshot of its pre-merge state is stored in the "merged_duplicate"
 * processing log entry. unmergeCreator() reads that snapshot back and
 * restores it exactly, clearing the duplicate link.
 *
 * This mirrors the audit trail applyManualOverride already keeps
 * (old/new value per field) and the "never destroy evidence" principle the
 * cache and confidence layers follow — a merge is itself a strong claim
 * (identity A == identity B) and, like any other candidate evidence, it
 * shouldn't be irrecoverable if it turns out to be wrong. This matters more
 * once duplicate *suggestions* are automated: false positives there will be
 * more common than in manual merges, so an unmerge path needs to already
 * exist rather than being retrofitted after bad auto-merges have landed.
 *
 * Only the most recent merge per creator is unmergeable (a creator merged,
 * unmerged, then merged again only keeps the latest snapshot) — chained/
 * repeated merge-unmerge history is not tracked beyond that.
 */
export function mergeDuplicateCreators(sourceId: string, targetId: string): void {
  if (sourceId === targetId) {
    throw new Error("Cannot merge a creator into itself");
  }
  const source = getCreator(sourceId);
  if (!source) throw new Error(`Creator not found: ${sourceId}`);
  const target = getCreator(targetId);
  if (!target) throw new Error(`Target creator not found: ${targetId}`);

  const preMergeSnapshot = snapshotIdentity(source);

  markDuplicateOf(sourceId, targetId);
  applyResolvedIdentity(sourceId, {
    resolvedFirstName: target.resolved_first_name ?? undefined,
    resolvedLastName: target.resolved_last_name ?? undefined,
    resolvedDisplayName: target.resolved_display_name ?? undefined,
    resolvedPlatform: target.resolved_platform ?? undefined,
    resolvedProfileUrl: target.resolved_profile_url ?? undefined,
    resolvedSocialHandle: target.resolved_social_handle ?? undefined,
    resolvedEmail: target.resolved_email ?? undefined,
    confidenceScore: target.confidence_score ?? 0,
    confidenceSource: target.confidence_source ?? undefined,
    processingStatus: target.processing_status,
    pipelineVersion: target.pipeline_version,
    needsReview: false,
    identityCacheId: target.identity_cache_id ?? undefined,
  });
  setReviewStatus(sourceId, "approved");

  addProcessingLog({
    creatorId: sourceId,
    step: "merged_duplicate",
    status: "success",
    detail: { targetCreatorId: targetId, preMergeSnapshot },
  });
}

/**
 * Reverses the most recent mergeDuplicateCreators call for `creatorId`:
 * restores its pre-merge resolved identity from the snapshot recorded at
 * merge time and clears the duplicate-of link. Throws if the creator isn't
 * currently marked as a duplicate, or if no merge snapshot can be found
 * (e.g. the duplicate link was set some other way).
 */
export function unmergeCreator(creatorId: string): CreatorRow {
  const creator = getCreator(creatorId);
  if (!creator) throw new Error(`Creator not found: ${creatorId}`);
  if (!creator.duplicate_of_creator_id) {
    throw new Error(`Creator is not marked as a duplicate: ${creatorId}`);
  }

  const logs = listProcessingLogsForCreator(creatorId);
  const lastMerge = [...logs].reverse().find((log) => log.step === "merged_duplicate");
  if (!lastMerge?.detail) {
    throw new Error(`No merge snapshot found for creator: ${creatorId}`);
  }
  const { preMergeSnapshot } = JSON.parse(lastMerge.detail) as {
    preMergeSnapshot?: CreatorIdentitySnapshot;
  };
  if (!preMergeSnapshot) {
    throw new Error(`Merge log for creator ${creatorId} has no snapshot to restore`);
  }

  clearDuplicateOf(creatorId);
  applyResolvedIdentity(creatorId, {
    resolvedFirstName: preMergeSnapshot.resolvedFirstName,
    resolvedLastName: preMergeSnapshot.resolvedLastName,
    resolvedDisplayName: preMergeSnapshot.resolvedDisplayName,
    resolvedPlatform: preMergeSnapshot.resolvedPlatform,
    resolvedProfileUrl: preMergeSnapshot.resolvedProfileUrl,
    resolvedSocialHandle: preMergeSnapshot.resolvedSocialHandle,
    resolvedEmail: preMergeSnapshot.resolvedEmail,
    confidenceScore: preMergeSnapshot.confidenceScore,
    confidenceSource: preMergeSnapshot.confidenceSource as ConfidenceSource | undefined,
    processingStatus: preMergeSnapshot.processingStatus as ProcessingStatus,
    pipelineVersion: preMergeSnapshot.pipelineVersion,
    needsReview: preMergeSnapshot.needsReview,
    identityCacheId: preMergeSnapshot.identityCacheId,
  });
  setReviewStatus(creatorId, preMergeSnapshot.reviewStatus);

  addProcessingLog({
    creatorId,
    step: "unmerged_duplicate",
    status: "success",
    detail: { restoredFrom: lastMerge.id },
  });

  return getCreator(creatorId)!;
}
