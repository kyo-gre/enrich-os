/** Canonical forms for identity_cache_keys lookups — must match on write and read. */

export function canonicalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function canonicalizeUsername(username: string): string {
  return username.trim().toLowerCase().replace(/^@/, "");
}

export function canonicalizeProfileUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${pathname}`;
  } catch {
    // Not a parsable absolute URL (e.g. a bare handle) — fall back to a
    // simple lowercase/trim-trailing-slash normalization.
    return trimmed.toLowerCase().replace(/\/+$/, "");
  }
}

export type IdentityKeyType = "email" | "username" | "profile_url";

export interface IdentityKey {
  keyType: IdentityKeyType;
  keyValue: string;
}

/** Builds the set of canonicalized identity-cache keys available from a set of resolved/normalized fields. */
export function buildIdentityKeys(fields: {
  email?: string;
  username?: string;
  profileUrl?: string;
}): IdentityKey[] {
  const keys: IdentityKey[] = [];
  if (fields.email) {
    keys.push({ keyType: "email", keyValue: canonicalizeEmail(fields.email) });
  }
  if (fields.username) {
    keys.push({
      keyType: "username",
      keyValue: canonicalizeUsername(fields.username),
    });
  }
  if (fields.profileUrl) {
    keys.push({
      keyType: "profile_url",
      keyValue: canonicalizeProfileUrl(fields.profileUrl),
    });
  }
  return keys;
}
