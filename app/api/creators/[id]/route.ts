import { NextResponse } from "next/server";
import { getCreator } from "../../../../server/db/repositories/creators.repo";
import { listProcessingLogsForCreator } from "../../../../server/db/repositories/processing-logs.repo";
import { listProfileSnapshotsForCreator } from "../../../../server/db/repositories/profile-snapshots.repo";

/**
 * Read-only detail view for the review UI's row slide-over: the creator's
 * full resolved identity plus its processing-log timeline and any scraped
 * profile snapshots. Purely additive — aggregates existing repo reads, no
 * new business logic or stored data.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const creator = getCreator(id);
  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const logs = listProcessingLogsForCreator(id).map((log) => ({
    id: log.id,
    step: log.step,
    status: log.status,
    detail: log.detail ? JSON.parse(log.detail) : null,
    createdAt: log.created_at,
  }));

  const snapshots = listProfileSnapshotsForCreator(id).map((snapshot) => ({
    id: snapshot.id,
    platform: snapshot.platform,
    fetchedVia: snapshot.fetched_via,
    rawSnapshot: JSON.parse(snapshot.raw_snapshot),
    fetchedAt: snapshot.fetched_at,
  }));

  return NextResponse.json({
    creator: {
      id: creator.id,
      firstName: creator.resolved_first_name,
      lastName: creator.resolved_last_name,
      displayName: creator.resolved_display_name,
      platform: creator.resolved_platform,
      profileUrl: creator.resolved_profile_url,
      email: creator.resolved_email,
      socialHandle: creator.resolved_social_handle,
      confidenceScore: creator.confidence_score,
      confidenceSource: creator.confidence_source,
      processingStatus: creator.processing_status,
      needsReview: Boolean(creator.needs_review),
      reviewStatus: creator.review_status,
      notes: creator.notes,
      identityCacheId: creator.identity_cache_id,
      duplicateOfCreatorId: creator.duplicate_of_creator_id,
      createdAt: creator.created_at,
      updatedAt: creator.updated_at,
    },
    logs,
    snapshots,
  });
}
