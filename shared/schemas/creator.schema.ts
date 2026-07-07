import { z } from "zod";
import { mappedCreatorInputSchema } from "./import-row.schema";
import {
  nameCandidateSchema,
  resolvedIdentitySchema,
} from "./confidence.schema";

export const processingLogEntrySchema = z.object({
  step: z.string(),
  status: z.enum(["success", "skipped", "failed"]),
  detail: z.record(z.string(), z.unknown()).optional(),
});
export type ProcessingLogEntry = z.infer<typeof processingLogEntrySchema>;

export const normalizedCreatorSchema = z.object({
  fullName: z.string().optional(),
  username: z.string().optional(),
  email: z.string().optional(),
  profileUrl: z.string().optional(),
  platform: z.string().optional(),
});
export type NormalizedCreator = z.infer<typeof normalizedCreatorSchema>;

/** The working in-memory record threaded through the pipeline (not a DB row). */
export const creatorRecordSchema = mappedCreatorInputSchema.extend({
  normalized: normalizedCreatorSchema.optional(),
  candidates: z.array(nameCandidateSchema).default([]),
  resolved: resolvedIdentitySchema.optional(),
  logs: z.array(processingLogEntrySchema).default([]),
});
export type CreatorRecord = z.infer<typeof creatorRecordSchema>;
