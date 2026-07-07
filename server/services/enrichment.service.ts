import confidenceWeights from "../../config/confidence-weights.json";
import pipelineVersionConfig from "../../config/pipeline-version.json";
import { normalizeCreator } from "../../core/normalization/normalize";
import { extractFromFullName } from "../../core/extraction/full-name-parser";
import { extractFromEmail } from "../../core/extraction/email-name-parser";
import { scoreCandidates } from "../../core/confidence/scorer";
import type { NameCandidate } from "../../shared/types";
import {
  applyResolvedIdentity,
  listCreatorsByImport,
  type CreatorRow,
} from "../db/repositories/creators.repo";
import { addProcessingLog } from "../db/repositories/processing-logs.repo";

const PIPELINE_VERSION = pipelineVersionConfig.version;

function enrichOne(creator: CreatorRow): void {
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

  applyResolvedIdentity(creator.id, {
    resolvedFirstName: resolved.firstName,
    resolvedLastName: resolved.lastName,
    resolvedDisplayName: resolved.displayName,
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

export function runEnrichmentForImport(importId: string): { processed: number } {
  const creators = listCreatorsByImport(importId);
  for (const creator of creators) {
    enrichOne(creator);
  }
  return { processed: creators.length };
}
