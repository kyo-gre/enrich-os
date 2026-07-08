import { z } from "zod";

export const nameCandidateSourceSchema = z.enum([
  "full_name",
  "email",
  "display_name",
  "username",
  "instagram",
  "tiktok",
  "facebook",
  "youtube",
  "generic_scrape",
]);
export type NameCandidateSource = z.infer<typeof nameCandidateSourceSchema>;

export const confidenceSourceSchema = z.union([
  nameCandidateSourceSchema,
  z.literal("manual_override"),
]);
export type ConfidenceSource = z.infer<typeof confidenceSourceSchema>;

export const processingStatusSchema = z.enum([
  "cache_hit",
  "enriched",
  "partially_enriched",
  "needs_review",
  "failed",
]);
export type ProcessingStatus = z.infer<typeof processingStatusSchema>;

export const reviewStatusSchema = z.enum(["pending", "approved", "ignored"]);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const confidenceWeightsSchema = z.object({
  full_name: z.number().min(0).max(100),
  display_name: z.number().min(0).max(100),
  email: z.number().min(0).max(100),
  username: z.number().min(0).max(100),
  instagram: z.number().min(0).max(100),
  tiktok: z.number().min(0).max(100),
  facebook: z.number().min(0).max(100),
  youtube: z.number().min(0).max(100),
  generic_scrape: z.number().min(0).max(100),
  emailAmbiguousPenalty: z.number().min(0).max(100),
  reviewThreshold: z.number().min(0).max(100),
});
export type ConfidenceWeights = z.infer<typeof confidenceWeightsSchema>;

export const nameCandidateSchema = z.object({
  source: nameCandidateSourceSchema,
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  displayName: z.string().optional(),
  // Only populated by sources that actually know these (e.g. profile
  // scrapers know platform/profileUrl/socialHandle, the email extractor
  // knows email); other candidates leave them undefined and the record's
  // own normalized input is used as the fallback — see enrichOne.
  platform: z.string().optional(),
  profileUrl: z.string().optional(),
  socialHandle: z.string().optional(),
  email: z.string().optional(),
  confidence: z.number().min(0).max(100),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type NameCandidate = z.infer<typeof nameCandidateSchema>;

export const resolvedIdentitySchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  displayName: z.string().optional(),
  email: z.string().optional(),
  socialHandle: z.string().optional(),
  platform: z.string().optional(),
  profileUrl: z.string().optional(),
  confidenceScore: z.number().min(0).max(100),
  // Absent only when no candidate at all was found (processingStatus "failed").
  confidenceSource: confidenceSourceSchema.optional(),
  processingStatus: processingStatusSchema,
  pipelineVersion: z.string(),
  needsReview: z.boolean(),
});
export type ResolvedIdentity = z.infer<typeof resolvedIdentitySchema>;
