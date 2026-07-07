import {
  canonicalizeEmail,
  canonicalizeProfileUrl,
  canonicalizeUsername,
} from "./canonicalize-key";

export interface DedupeRecord {
  id: string;
  email?: string;
  username?: string;
  profileUrl?: string;
}

export type DuplicateMatchKeyType = "email" | "username" | "profile_url";

export interface DuplicateGroup {
  keyType: DuplicateMatchKeyType;
  keyValue: string;
  creatorIds: string[];
}

/**
 * Deterministic, exact-match duplicate detection ONLY. Two records are
 * flagged as duplicates if and only if they share the exact same
 * canonicalized email, username, or profile URL.
 *
 * There is intentionally no fuzzy name matching here (e.g. "John D." ~
 * "John Doe" ~ "Johnny") — that was explicitly ruled out for this system.
 * Name similarity is too error-prone to trust without a human in the loop,
 * and the confidence-scoring model already treats names as competing
 * evidence for a single identity, not as an identity key in their own
 * right — reusing them as a fuzzy dedupe key would blur those two
 * concepts. If two records don't share an exact key, they are simply not
 * flagged; a reviewer who notices a name similarity can still merge them
 * manually via mergeDuplicateCreators.
 */
export function findDuplicateGroups(records: DedupeRecord[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];

  const keyTypes: DuplicateMatchKeyType[] = ["email", "username", "profile_url"];
  for (const keyType of keyTypes) {
    const byValue = new Map<string, string[]>();

    for (const record of records) {
      const raw =
        keyType === "email"
          ? record.email
          : keyType === "username"
            ? record.username
            : record.profileUrl;
      if (!raw) continue;

      const value =
        keyType === "email"
          ? canonicalizeEmail(raw)
          : keyType === "username"
            ? canonicalizeUsername(raw)
            : canonicalizeProfileUrl(raw);

      const ids = byValue.get(value) ?? [];
      ids.push(record.id);
      byValue.set(value, ids);
    }

    for (const [keyValue, creatorIds] of byValue) {
      if (creatorIds.length > 1) {
        groups.push({ keyType, keyValue, creatorIds });
      }
    }
  }

  return groups;
}
