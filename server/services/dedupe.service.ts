import {
  findDuplicateGroups,
  type DuplicateGroup,
} from "../../core/dedupe/find-duplicate-groups";
import { listCreatorsByImport } from "../db/repositories/creators.repo";

export interface DuplicateCandidate {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

export interface DuplicateCandidateGroup extends DuplicateGroup {
  creators: DuplicateCandidate[];
}

/**
 * Duplicate detection is scoped to a single import. Cross-import duplicates
 * of the same person are already unified by the identity cache (see
 * identity-cache.service) — the second occurrence gets a cache_hit and is
 * never a separate unresolved record. What this surfaces is exact-match
 * clusters *within* one import's rows that the cache didn't already catch
 * — typically because the first occurrence needed review (and so was never
 * cached) or a conflicting cache match suppressed the cache write.
 *
 * Creators already linked via duplicate_of_creator_id are excluded: they've
 * already been resolved by a prior merge and re-flagging them would just
 * be noise.
 */
export function findDuplicateCandidates(importId: string): DuplicateCandidateGroup[] {
  const creators = listCreatorsByImport(importId).filter(
    (creator) => !creator.duplicate_of_creator_id,
  );

  const records = creators.map((creator) => ({
    id: creator.id,
    email: creator.resolved_email ?? creator.raw_email ?? undefined,
    username: creator.resolved_social_handle ?? creator.raw_username ?? undefined,
    profileUrl: creator.resolved_profile_url ?? creator.raw_profile_url ?? undefined,
  }));

  const creatorById = new Map(creators.map((creator) => [creator.id, creator]));

  return findDuplicateGroups(records).map((group) => ({
    ...group,
    creators: group.creatorIds.map((id) => {
      const creator = creatorById.get(id)!;
      return {
        id,
        firstName: creator.resolved_first_name,
        lastName: creator.resolved_last_name,
      };
    }),
  }));
}
