import { randomUUID } from "node:crypto";
import type { InArgs, InStatement } from "@libsql/client";
import { libsqlClient } from "../libsql-client";
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
export async function findIdentityByKey(
  keyType: IdentityKeyType,
  keyValue: string,
): Promise<IdentityCacheRow | undefined> {
  const result = await libsqlClient.execute({
    sql: `SELECT ic.* FROM identity_cache ic
       JOIN identity_cache_keys k ON k.identity_cache_id = ic.id
       WHERE k.key_type = ? AND k.key_value = ?`,
    args: [keyType, keyValue],
  });
  return result.rows[0] as unknown as IdentityCacheRow | undefined;
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

/**
 * Inserts the identity_cache row and all of its initiating keys atomically
 * (via client.batch, which wraps the statements in a single transaction and
 * rolls back entirely on any failure) — an identity row must never persist
 * without at least the keys that were meant to point to it, or it becomes
 * an unfindable, orphaned cache entry.
 */
export async function createIdentityCache(
  input: CreateIdentityCacheInput,
): Promise<IdentityCacheRow> {
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

  const statements: InStatement[] = [
    {
      sql: `INSERT INTO identity_cache (
        id, first_name, last_name, display_name, platform, profile_url, email, social_handle,
        confidence_score, confidence_source, pipeline_version, verified, last_verified_at, created_at, updated_at
      ) VALUES (
        :id, :first_name, :last_name, :display_name, :platform, :profile_url, :email, :social_handle,
        :confidence_score, :confidence_source, :pipeline_version, :verified, :last_verified_at, :created_at, :updated_at
      )`,
      args: row as unknown as InArgs,
    },
    ...input.keys.map(
      (key): InStatement => ({
        sql: `INSERT OR IGNORE INTO identity_cache_keys (id, identity_cache_id, key_type, key_value, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        args: [randomUUID(), row.id, key.keyType, key.keyValue, now],
      }),
    ),
  ];

  await libsqlClient.batch(statements, "write");

  return row;
}

export async function addIdentityCacheKey(
  identityCacheId: string,
  keyType: IdentityKeyType,
  keyValue: string,
): Promise<void> {
  await libsqlClient.execute({
    sql: `INSERT OR IGNORE INTO identity_cache_keys (id, identity_cache_id, key_type, key_value, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    args: [randomUUID(), identityCacheId, keyType, keyValue, Date.now()],
  });
}

const OVERRIDABLE_COLUMNS = new Set([
  "first_name",
  "last_name",
  "display_name",
  "platform",
  "profile_url",
  "email",
  "social_handle",
]);

/**
 * Inserts the audit-log entry and applies the field change atomically. The
 * field-name validation happens before the transaction opens (pure JS, no
 * DB call) rather than mid-transaction: an invalid field must leave zero
 * trace (no audit row, no update) either way, but validating up front
 * avoids issuing a write we already know would be rolled back.
 */
export async function applyManualOverride(
  identityCacheId: string,
  field: string,
  oldValue: string | null,
  newValue: string,
  reason?: string,
): Promise<void> {
  const column = field.replace(/([A-Z])/g, "_$1").toLowerCase();
  if (!OVERRIDABLE_COLUMNS.has(column)) {
    throw new Error(`Cannot override unknown field: ${field}`);
  }

  const now = Date.now();
  await libsqlClient.batch(
    [
      {
        sql: `INSERT INTO manual_overrides (id, identity_cache_id, field, old_value, new_value, reason, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'local-user', ?)`,
        args: [randomUUID(), identityCacheId, field, oldValue, newValue, reason ?? null, now],
      },
      {
        sql: `UPDATE identity_cache SET ${column} = ?, verified = 1, last_verified_at = ?, updated_at = ? WHERE id = ?`,
        args: [newValue, now, now, identityCacheId],
      },
    ],
    "write",
  );
}
