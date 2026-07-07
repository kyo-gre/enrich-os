import { randomUUID } from "node:crypto";
import { db } from "../client";
import type { ConfidenceSource } from "../../../shared/types";

export interface IdentityCacheRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  platform: string | null;
  profile_url: string | null;
  email: string | null;
  social_handle: string | null;
  confidence_score: number | null;
  confidence_source: ConfidenceSource | null;
  pipeline_version: string;
  verified: 0 | 1;
  last_verified_at: number | null;
  created_at: number;
  updated_at: number;
}

export type IdentityKeyType = "email" | "username" | "profile_url";

/** `keyValue` must already be canonicalized by the caller (core/dedupe/canonicalize-key.ts). */
export function findIdentityByKey(
  keyType: IdentityKeyType,
  keyValue: string,
): IdentityCacheRow | undefined {
  return db
    .prepare<[IdentityKeyType, string], IdentityCacheRow>(
      `SELECT ic.* FROM identity_cache ic
       JOIN identity_cache_keys k ON k.identity_cache_id = ic.id
       WHERE k.key_type = ? AND k.key_value = ?`,
    )
    .get(keyType, keyValue);
}

export interface CreateIdentityCacheInput {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  platform?: string;
  profileUrl?: string;
  email?: string;
  socialHandle?: string;
  confidenceScore: number;
  confidenceSource: ConfidenceSource;
  pipelineVersion: string;
  keys: Array<{ keyType: IdentityKeyType; keyValue: string }>;
}

export function createIdentityCache(
  input: CreateIdentityCacheInput,
): IdentityCacheRow {
  const now = Date.now();
  const row: IdentityCacheRow = {
    id: randomUUID(),
    first_name: input.firstName ?? null,
    last_name: input.lastName ?? null,
    display_name: input.displayName ?? null,
    platform: input.platform ?? null,
    profile_url: input.profileUrl ?? null,
    email: input.email ?? null,
    social_handle: input.socialHandle ?? null,
    confidence_score: input.confidenceScore,
    confidence_source: input.confidenceSource,
    pipeline_version: input.pipelineVersion,
    verified: 0,
    last_verified_at: null,
    created_at: now,
    updated_at: now,
  };

  const insertIdentity = db.prepare(
    `INSERT INTO identity_cache (
      id, first_name, last_name, display_name, platform, profile_url, email, social_handle,
      confidence_score, confidence_source, pipeline_version, verified, last_verified_at, created_at, updated_at
    ) VALUES (
      @id, @first_name, @last_name, @display_name, @platform, @profile_url, @email, @social_handle,
      @confidence_score, @confidence_source, @pipeline_version, @verified, @last_verified_at, @created_at, @updated_at
    )`,
  );
  const insertKey = db.prepare(
    `INSERT OR IGNORE INTO identity_cache_keys (id, identity_cache_id, key_type, key_value, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction(() => {
    insertIdentity.run(row);
    for (const key of input.keys) {
      insertKey.run(randomUUID(), row.id, key.keyType, key.keyValue, now);
    }
  });
  tx();

  return row;
}

export function addIdentityCacheKey(
  identityCacheId: string,
  keyType: IdentityKeyType,
  keyValue: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO identity_cache_keys (id, identity_cache_id, key_type, key_value, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(randomUUID(), identityCacheId, keyType, keyValue, Date.now());
}

export function applyManualOverride(
  identityCacheId: string,
  field: string,
  oldValue: string | null,
  newValue: string,
  reason?: string,
): void {
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO manual_overrides (id, identity_cache_id, field, old_value, new_value, reason, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'local-user', ?)`,
    ).run(randomUUID(), identityCacheId, field, oldValue, newValue, reason ?? null, now);

    const column = `${field.replace(/([A-Z])/g, "_$1").toLowerCase()}`;
    const allowedColumns = new Set([
      "first_name",
      "last_name",
      "display_name",
      "platform",
      "profile_url",
      "email",
      "social_handle",
    ]);
    if (!allowedColumns.has(column)) {
      throw new Error(`Cannot override unknown field: ${field}`);
    }
    db.prepare(
      `UPDATE identity_cache SET ${column} = ?, verified = 1, last_verified_at = ?, updated_at = ? WHERE id = ?`,
    ).run(newValue, now, now, identityCacheId);
  });
  tx();
}
