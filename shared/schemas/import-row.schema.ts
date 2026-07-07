import { z } from "zod";

/** Canonical fields the column mapper resolves raw spreadsheet headers into. */
export const canonicalFieldSchema = z.enum([
  "fullName",
  "username",
  "email",
  "profileUrl",
  "platform",
]);
export type CanonicalField = z.infer<typeof canonicalFieldSchema>;

export const columnMappingSchema = z.record(z.string(), canonicalFieldSchema);
export type ColumnMapping = z.infer<typeof columnMappingSchema>;

/** A single raw row as parsed from CSV/XLSX, before column mapping is applied. */
export const rawImportRowSchema = z.record(z.string(), z.unknown());
export type RawImportRow = z.infer<typeof rawImportRowSchema>;

export const mappedCreatorInputSchema = z.object({
  rawFullName: z.string().optional(),
  rawUsername: z.string().optional(),
  rawEmail: z.string().optional(),
  rawProfileUrl: z.string().optional(),
  rawPlatform: z.string().optional(),
  raw: rawImportRowSchema,
});
export type MappedCreatorInput = z.infer<typeof mappedCreatorInputSchema>;
