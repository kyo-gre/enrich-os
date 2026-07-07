import columnAliases from "../../config/column-aliases.json";
import type {
  CanonicalField,
  ColumnMapping,
  MappedCreatorInput,
  RawImportRow,
} from "../../shared/types";

const ALIASES = columnAliases as Record<CanonicalField, string[]>;

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Auto-detects canonical fields from raw headers using the configured alias list. Exact match only — no fuzzy/edit-distance matching. */
export function suggestColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    for (const [field, aliases] of Object.entries(ALIASES) as Array<
      [CanonicalField, string[]]
    >) {
      if (aliases.some((alias) => normalizeHeader(alias) === normalized)) {
        mapping[header] = field;
        break;
      }
    }
  }
  return mapping;
}

/** Maps one raw row into the pipeline's input shape given a confirmed mapping. When multiple headers map to the same field, the first non-empty value wins. */
export function mapRowToCreatorInput(
  row: RawImportRow,
  mapping: ColumnMapping,
): MappedCreatorInput {
  const values: Partial<Record<CanonicalField, string>> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (values[field]) continue; // first non-empty wins
    const raw = row[header];
    const value = raw == null ? "" : String(raw).trim();
    if (value) values[field] = value;
  }

  return {
    rawFullName: values.fullName,
    rawUsername: values.username,
    rawEmail: values.email,
    rawProfileUrl: values.profileUrl,
    rawPlatform: values.platform,
    raw: row,
  };
}
