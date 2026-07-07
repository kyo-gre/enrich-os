import { z } from "zod";
import { reviewStatusSchema } from "./confidence.schema";

export const exportTypeSchema = z.enum(["quick", "full"]);
export type ExportType = z.infer<typeof exportTypeSchema>;

export const confidenceBucketSchema = z.enum(["high", "medium", "low"]);
export type ConfidenceBucket = z.infer<typeof confidenceBucketSchema>;

export const quickExportRowSchema = z.object({
  firstName: z.string().optional(),
  email: z.string().optional(),
  socialHandle: z.string().optional(),
});
export type QuickExportRow = z.infer<typeof quickExportRowSchema>;

export const fullExportRowSchema = quickExportRowSchema.extend({
  lastName: z.string().optional(),
  displayName: z.string().optional(),
  platform: z.string().optional(),
  profileUrl: z.string().optional(),
  confidenceScore: z.number().optional(),
  confidenceSource: z.string().optional(),
  processingStatus: z.string().optional(),
  needsReview: z.boolean().optional(),
  reviewStatus: reviewStatusSchema.optional(),
  // Provenance for the export itself, not the record — lets a downstream
  // consumer tell which pipeline run produced a row and when it was pulled.
  pipelineVersion: z.string().optional(),
  exportedAt: z.number().optional(),
  notes: z.string().optional(),
});
export type FullExportRow = z.infer<typeof fullExportRowSchema>;
