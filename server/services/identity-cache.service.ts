import {
  buildIdentityKeys,
  type IdentityKey,
} from "../../core/dedupe/canonicalize-key";
import {
  addIdentityCacheKey,
  createIdentityCache,
  findIdentityByKey,
  type IdentityCacheRow,
} from "../db/repositories/identity-cache.repo";
import type { NormalizedCreator, ResolvedIdentity } from "../../shared/types";

export type CacheLookupResult =
  | { status: "miss" }
  | { status: "hit"; identity: IdentityCacheRow }
  | { status: "conflict"; identities: IdentityCacheRow[] };

/** Looks up every key and returns the distinct identity_cache rows matched, deduped by id. */
function findAllMatches(keys: IdentityKey[]): IdentityCacheRow[] {
  const byId = new Map<string, IdentityCacheRow>();
  for (const key of keys) {
    const hit = findIdentityByKey(key.keyType, key.keyValue);
    if (hit) byId.set(hit.id, hit);
  }
  return [...byId.values()];
}

/**
 * Cache conflict policy (explicit, per M6 review — see project memory):
 * a record's email/profileUrl/username can each independently match a
 * *different* cached identity if the cache has drifted (e.g. two people
 * shared a display name, or a handle was recycled). We check every key —
 * not just the first that hits — and if they disagree, we do not silently
 * prefer one, and we do not auto-merge them. We flag it: report a
 * "conflict" so the caller skips the cache shortcut, runs full
 * extraction/scraping as if this were a fresh record, and forces the
 * outcome to needs_review with the conflicting identity ids logged. A
 * human resolves it via the M7 review tools (override / merge duplicates).
 * This should be rare in a healthy cache; treating it as "needs review"
 * rather than "pick the strongest key" or "merge" is the conservative
 * choice consistent with never overwriting/merging evidence automatically.
 */
export function lookupCachedIdentity(
  normalized: NormalizedCreator,
): CacheLookupResult {
  const keys = buildIdentityKeys({
    email: normalized.email,
    username: normalized.username,
    profileUrl: normalized.profileUrl,
  });
  if (keys.length === 0) return { status: "miss" };

  const matches = findAllMatches(keys);
  if (matches.length === 0) return { status: "miss" };
  if (matches.length === 1) return { status: "hit", identity: matches[0] };
  return { status: "conflict", identities: matches };
}

/**
 * Caches a resolved identity for future lookups. Only "enriched" results
 * (confident, not needing review) are cached — a low-confidence guess
 * shouldn't be locked in as the answer for every future record that shares
 * one of its keys.
 *
 * If the record's keys already point to a single existing entry, that
 * entry is reused and simply gains any keys it was missing — its stored
 * fields are never overwritten here, since it may already carry a manual
 * verification (see applyManualOverride) that this new evidence shouldn't
 * clobber. This is the same "additional evidence, not a replacement" rule
 * the confidence scorer applies to candidates.
 *
 * If the record's keys point to more than one *existing* entry, that's the
 * same conflict lookupCachedIdentity guards against — writing here would
 * either pick a side or blur two identities together, so the write is
 * skipped (returns undefined) rather than guessing.
 */
export function upsertIdentityCache(
  resolved: ResolvedIdentity,
  normalized: NormalizedCreator,
): IdentityCacheRow | undefined {
  if (resolved.processingStatus !== "enriched") return undefined;

  const keys = buildIdentityKeys({
    email: resolved.email ?? normalized.email,
    username: resolved.socialHandle ?? normalized.username,
    profileUrl: resolved.profileUrl ?? normalized.profileUrl,
  });
  if (keys.length === 0) return undefined;

  const matches = findAllMatches(keys);
  if (matches.length > 1) return undefined;
  if (matches.length === 1) {
    const existing = matches[0];
    for (const key of keys) {
      addIdentityCacheKey(existing.id, key.keyType, key.keyValue);
    }
    return existing;
  }

  return createIdentityCache({
    firstName: resolved.firstName,
    lastName: resolved.lastName,
    displayName: resolved.displayName,
    platform: resolved.platform ?? normalized.platform,
    profileUrl: resolved.profileUrl ?? normalized.profileUrl,
    email: resolved.email ?? normalized.email,
    socialHandle: resolved.socialHandle ?? normalized.username,
    confidenceScore: resolved.confidenceScore,
    // Guaranteed defined: scoreCandidates only omits confidenceSource when
    // processingStatus is "failed", and we've already gated on "enriched".
    confidenceSource: resolved.confidenceSource!,
    pipelineVersion: resolved.pipelineVersion,
    keys,
  });
}
