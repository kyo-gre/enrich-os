import confidenceWeights from "../../config/confidence-weights.json";
import pipelineVersionConfig from "../../config/pipeline-version.json";
import { normalizeCreator } from "../../core/normalization/normalize";
import { extractFromFullName } from "../../core/extraction/full-name-parser";
import { extractFromEmail } from "../../core/extraction/email-name-parser";
import { scoreCandidates } from "../../core/confidence/scorer";
import { scrapeProfile } from "../../core/profiles/adapters";
import type { NameCandidate } from "../../shared/types";
import {
  applyResolvedIdentity,
  listCreatorsByImport,
  type CreatorRow,
} from "../db/repositories/creators.repo";
import { addProcessingLog } from "../db/repositories/processing-logs.repo";
import { saveProfileSnapshot } from "../db/repositories/profile-snapshots.repo";
import {
  lookupCachedIdentity,
  upsertIdentityCache,
} from "./identity-cache.service";

const PIPELINE_VERSION = pipelineVersionConfig.version;

async function enrichOne(creator: CreatorRow): Promise<void> {
  const normalized = normalizeCreator({
    rawFullName: creator.raw_full_name ?? undefined,
    rawUsername: creator.raw_username ?? undefined,
    rawEmail: creator.raw_email ?? undefined,
    rawProfileUrl: creator.raw_profile_url ?? undefined,
    rawPlatform: creator.raw_platform ?? undefined,
    raw: {},
  });
  await addProcessingLog({
    creatorId: creator.id,
    step: "normalized",
    status: "success",
    detail: normalized,
  });

  // A cache hit means this identity (by email/profile URL/username) was
  // already confidently resolved before — reuse it directly rather than
  // re-running extraction and re-scraping the same profile. A conflict
  // (different keys pointing at different cached identities) is flagged
  // rather than resolved automatically — see lookupCachedIdentity's policy.
  const cacheLookup = await lookupCachedIdentity(normalized);

  if (cacheLookup.status === "hit") {
    const cached = cacheLookup.identity;
    await addProcessingLog({
      creatorId: creator.id,
      step: "cache_lookup",
      status: "success",
      detail: { identityCacheId: cached.id },
    });
    await applyResolvedIdentity(creator.id, {
      resolvedFirstName: cached.first_name ?? undefined,
      resolvedLastName: cached.last_name ?? undefined,
      resolvedDisplayName: cached.display_name ?? undefined,
      resolvedPlatform: cached.platform ?? undefined,
      resolvedProfileUrl: cached.profile_url ?? undefined,
      resolvedSocialHandle: cached.social_handle ?? undefined,
      resolvedEmail: cached.email ?? undefined,
      confidenceScore: cached.confidence_score ?? 100,
      confidenceSource: cached.confidence_source ?? undefined,
      processingStatus: "cache_hit",
      pipelineVersion: PIPELINE_VERSION,
      needsReview: false,
      identityCacheId: cached.id,
    });
    await addProcessingLog({
      creatorId: creator.id,
      step: "final_selection",
      status: "success",
      detail: { firstName: cached.first_name, lastName: cached.last_name },
    });
    return;
  }

  const cacheConflict = cacheLookup.status === "conflict" ? cacheLookup.identities : undefined;
  if (cacheConflict) {
    await addProcessingLog({
      creatorId: creator.id,
      step: "cache_lookup",
      status: "failed",
      detail: {
        reason: "conflicting_identity_cache_matches",
        identityCacheIds: cacheConflict.map((identity) => identity.id),
      },
    });
  } else {
    await addProcessingLog({
      creatorId: creator.id,
      step: "cache_lookup",
      status: "skipped",
    });
  }

  const candidates: NameCandidate[] = [];

  const fullNameCandidate = extractFromFullName(normalized);
  await addProcessingLog({
    creatorId: creator.id,
    step: "parsed_full_name",
    status: fullNameCandidate ? "success" : "skipped",
    detail: fullNameCandidate ?? undefined,
  });
  if (fullNameCandidate) candidates.push(fullNameCandidate);

  const emailCandidate = extractFromEmail(normalized);
  await addProcessingLog({
    creatorId: creator.id,
    step: "parsed_email",
    status: emailCandidate ? "success" : "skipped",
    detail: emailCandidate ?? undefined,
  });
  if (emailCandidate) candidates.push(emailCandidate);

  // Profile scraping never throws (see scrapeProfile), but a defensive
  // try/catch here guarantees a failed/blocked adapter can never abort the
  // record: the scrape is treated purely as additional candidate evidence.
  try {
    const scrapeOutcome = await scrapeProfile(normalized.profileUrl);
    if (scrapeOutcome) {
      await addProcessingLog({
        creatorId: creator.id,
        step: `scraped_profile_${scrapeOutcome.platform}`,
        status: scrapeOutcome.error
          ? "failed"
          : scrapeOutcome.candidate
            ? "success"
            : "skipped",
        detail: scrapeOutcome.error
          ? { error: scrapeOutcome.error }
          : (scrapeOutcome.candidate ?? undefined),
      });
      if (scrapeOutcome.candidate) candidates.push(scrapeOutcome.candidate);
      if (scrapeOutcome.rawSnapshot && scrapeOutcome.fetchedVia) {
        await saveProfileSnapshot({
          creatorId: creator.id,
          platform: scrapeOutcome.platform,
          fetchedVia: scrapeOutcome.fetchedVia,
          rawSnapshot: scrapeOutcome.rawSnapshot,
        });
      }
    }
  } catch (error) {
    await addProcessingLog({
      creatorId: creator.id,
      step: "scraped_profile",
      status: "failed",
      detail: { error: error instanceof Error ? error.message : String(error) },
    });
  }

  let resolved = scoreCandidates(candidates, confidenceWeights, PIPELINE_VERSION);
  if (cacheConflict && resolved.processingStatus !== "failed") {
    // A conflicting cache match means this identity is ambiguous even
    // though fresh extraction/scraping found something — surface it for
    // human review rather than trusting the fresh result outright.
    resolved = { ...resolved, processingStatus: "needs_review", needsReview: true };
  }
  await addProcessingLog({
    creatorId: creator.id,
    step: "confidence_calculated",
    status: "success",
    detail: {
      confidenceScore: resolved.confidenceScore,
      confidenceSource: resolved.confidenceSource,
      processingStatus: resolved.processingStatus,
    },
  });

  // Skip writing to the cache when a conflict was flagged — doing so would
  // either pick a side or blur two identities together (see
  // upsertIdentityCache's docstring for the same guard on its own reads).
  const cacheEntry = cacheConflict
    ? undefined
    : await upsertIdentityCache(resolved, normalized);
  await addProcessingLog({
    creatorId: creator.id,
    step: "cache_write",
    status: cacheEntry ? "success" : "skipped",
    detail: cacheEntry
      ? { identityCacheId: cacheEntry.id }
      : cacheConflict
        ? { reason: "conflicting_identity_cache_matches" }
        : undefined,
  });

  // platform/profileUrl/socialHandle/email come from the winning candidate
  // when it knows them (a profile scrape knows the first three, the email
  // extractor knows the last); otherwise fall back to the record's own
  // normalized input so the resolved identity — and the identity-cache keys
  // (email/username/profile_url) built from it — are never missing a field
  // just because the winner was a different candidate source.
  await applyResolvedIdentity(creator.id, {
    resolvedFirstName: resolved.firstName,
    resolvedLastName: resolved.lastName,
    resolvedDisplayName: resolved.displayName,
    resolvedPlatform: resolved.platform ?? normalized.platform,
    resolvedProfileUrl: resolved.profileUrl ?? normalized.profileUrl,
    resolvedSocialHandle: resolved.socialHandle ?? normalized.username,
    resolvedEmail: resolved.email ?? normalized.email,
    confidenceScore: resolved.confidenceScore,
    confidenceSource: resolved.confidenceSource,
    processingStatus: resolved.processingStatus,
    pipelineVersion: resolved.pipelineVersion,
    needsReview: resolved.needsReview,
    identityCacheId: cacheEntry?.id,
  });

  await addProcessingLog({
    creatorId: creator.id,
    step: "final_selection",
    status: resolved.processingStatus === "failed" ? "failed" : "success",
    detail: { firstName: resolved.firstName, lastName: resolved.lastName },
  });
}

export async function runEnrichmentForImport(
  importId: string,
): Promise<{ processed: number; failed: number }> {
  const creators = await listCreatorsByImport(importId);
  let failed = 0;
  for (const creator of creators) {
    try {
      await enrichOne(creator);
    } catch (error) {
      // A record-level failure (e.g. an unexpected error in normalization
      // or scoring) must not abort the rest of the import — log it and
      // move on to the next creator.
      failed += 1;
      await addProcessingLog({
        creatorId: creator.id,
        step: "enrich_one",
        status: "failed",
        detail: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  return { processed: creators.length, failed };
}
