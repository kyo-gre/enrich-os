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
  addProcessingLog({
    creatorId: creator.id,
    step: "normalized",
    status: "success",
    detail: normalized,
  });

  const candidates: NameCandidate[] = [];

  const fullNameCandidate = extractFromFullName(normalized);
  addProcessingLog({
    creatorId: creator.id,
    step: "parsed_full_name",
    status: fullNameCandidate ? "success" : "skipped",
    detail: fullNameCandidate ?? undefined,
  });
  if (fullNameCandidate) candidates.push(fullNameCandidate);

  const emailCandidate = extractFromEmail(normalized);
  addProcessingLog({
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
      addProcessingLog({
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
        saveProfileSnapshot({
          creatorId: creator.id,
          platform: scrapeOutcome.platform,
          fetchedVia: scrapeOutcome.fetchedVia,
          rawSnapshot: scrapeOutcome.rawSnapshot,
        });
      }
    }
  } catch (error) {
    addProcessingLog({
      creatorId: creator.id,
      step: "scraped_profile",
      status: "failed",
      detail: { error: error instanceof Error ? error.message : String(error) },
    });
  }

  const resolved = scoreCandidates(candidates, confidenceWeights, PIPELINE_VERSION);
  addProcessingLog({
    creatorId: creator.id,
    step: "confidence_calculated",
    status: "success",
    detail: {
      confidenceScore: resolved.confidenceScore,
      confidenceSource: resolved.confidenceSource,
      processingStatus: resolved.processingStatus,
    },
  });

  // platform/profileUrl/socialHandle/email come from the winning candidate
  // when it knows them (a profile scrape knows the first three, the email
  // extractor knows the last); otherwise fall back to the record's own
  // normalized input so the resolved identity is never missing a field
  // just because the winner was a different candidate source.
  applyResolvedIdentity(creator.id, {
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
  });

  addProcessingLog({
    creatorId: creator.id,
    step: "final_selection",
    status: resolved.processingStatus === "failed" ? "failed" : "success",
    detail: { firstName: resolved.firstName, lastName: resolved.lastName },
  });
}

export async function runEnrichmentForImport(
  importId: string,
): Promise<{ processed: number; failed: number }> {
  const creators = listCreatorsByImport(importId);
  let failed = 0;
  for (const creator of creators) {
    try {
      await enrichOne(creator);
    } catch (error) {
      failed += 1;
      addProcessingLog({
        creatorId: creator.id,
        step: "enrich_one",
        status: "failed",
        detail: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  return { processed: creators.length, failed };
}
