import { describe, expect, it, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";

/**
 * Exercises identity-cache.repo.ts's two db.transaction() paths against a
 * real libSQL connection (not a mock) — the critical requirement of Phase
 * 5 (docs/DEPLOYMENT_HARDENING.md §5): closing the pre-existing gap where
 * identity-cache.service.test.ts and review.service.test.ts mock this repo
 * entirely and never exercise the real transaction code.
 *
 * See tests/server/jobs.repo.test.ts for why "../../server/db/client" is
 * imported first (mirrors production module load order / migration
 * application).
 */

let identityCacheRepo: typeof import("../../server/db/repositories/identity-cache.repo");
let libsqlClient: typeof import("../../server/db/libsql-client")["libsqlClient"];

beforeAll(async () => {
  await import("../../server/db/client");
  identityCacheRepo = await import(
    "../../server/db/repositories/identity-cache.repo"
  );
  ({ libsqlClient } = await import("../../server/db/libsql-client"));
});

async function countRows(table: string, whereSql: string, args: unknown[]) {
  const result = await libsqlClient.execute({
    sql: `SELECT COUNT(*) AS n FROM ${table} WHERE ${whereSql}`,
    args: args as never,
  });
  return Number((result.rows[0] as unknown as { n: number }).n);
}

describe("identity-cache.repo (libSQL) — createIdentityCache transaction", () => {
  it("A: commits the identity row and all of its keys together", async () => {
    // Unique per run: the local db file persists across test invocations
    // (unlike an in-memory db), so a fixed literal key would silently
    // resolve to a stale row from a prior run via INSERT OR IGNORE.
    const email = `jane-${randomUUID()}@example.com`;
    const username = `janedoe-${randomUUID()}`;

    const created = await identityCacheRepo.createIdentityCache({
      firstName: "Jane",
      email,
      socialHandle: username,
      confidenceScore: 95,
      confidenceSource: "email",
      pipelineVersion: "1.0.0",
      keys: [
        { keyType: "email", keyValue: email },
        { keyType: "username", keyValue: username },
      ],
    });

    const byEmail = await identityCacheRepo.findIdentityByKey("email", email);
    const byUsername = await identityCacheRepo.findIdentityByKey(
      "username",
      username,
    );

    expect(byEmail?.id).toBe(created.id);
    expect(byUsername?.id).toBe(created.id);
  });

  it("D: cache creation path — an identity with zero keys still commits the identity row itself", async () => {
    const created = await identityCacheRepo.createIdentityCache({
      firstName: "NoKeys",
      confidenceScore: 50,
      confidenceSource: "username",
      pipelineVersion: "1.0.0",
      keys: [],
    });

    const count = await countRows("identity_cache", "id = ?", [created.id]);
    expect(count).toBe(1);
  });

  it("B: rollback — a batch failure leaves no partial write behind (real libSQL atomicity, same client the repo uses)", async () => {
    const clashingId = randomUUID();
    const now = Date.now();

    // Two inserts into the same table sharing a primary key: the second
    // statement must fail with a UNIQUE/PK constraint violation, and per
    // client.batch's documented all-or-nothing semantics, the whole batch
    // (including the first, otherwise-valid insert) must be rolled back.
    await expect(
      libsqlClient.batch(
        [
          {
            sql: `INSERT INTO identity_cache (id, pipeline_version, verified, created_at, updated_at)
                  VALUES (?, ?, 0, ?, ?)`,
            args: [clashingId, "1.0.0", now, now],
          },
          {
            sql: `INSERT INTO identity_cache (id, pipeline_version, verified, created_at, updated_at)
                  VALUES (?, ?, 0, ?, ?)`,
            args: [clashingId, "1.0.0", now, now],
          },
        ],
        "write",
      ),
    ).rejects.toThrow();

    const count = await countRows("identity_cache", "id = ?", [clashingId]);
    expect(count).toBe(0);
  });
});

describe("identity-cache.repo (libSQL) — applyManualOverride transaction", () => {
  it("C: manual override path — audit log and field update both commit together", async () => {
    const created = await identityCacheRepo.createIdentityCache({
      firstName: "Jane",
      confidenceScore: 60,
      confidenceSource: "username",
      pipelineVersion: "1.0.0",
      keys: [],
    });

    await identityCacheRepo.applyManualOverride(
      created.id,
      "firstName",
      "Jane",
      "Janet",
      "typo fix",
    );

    const overrideCount = await countRows(
      "manual_overrides",
      "identity_cache_id = ? AND field = ?",
      [created.id, "firstName"],
    );
    expect(overrideCount).toBe(1);

    const updated = await libsqlClient.execute({
      sql: "SELECT first_name, verified FROM identity_cache WHERE id = ?",
      args: [created.id],
    });
    const row = updated.rows[0] as unknown as {
      first_name: string;
      verified: number;
    };
    expect(row.first_name).toBe("Janet");
    expect(row.verified).toBe(1);
  });

  it("E: constraint failure — an unknown identity_cache_id aborts the batch, database remains consistent", async () => {
    const bogusId = randomUUID();
    const before = await countRows("manual_overrides", "identity_cache_id = ?", [
      bogusId,
    ]);
    expect(before).toBe(0);

    await expect(
      identityCacheRepo.applyManualOverride(
        bogusId,
        "firstName",
        null,
        "Someone",
      ),
    ).rejects.toThrow();

    const after = await countRows("manual_overrides", "identity_cache_id = ?", [
      bogusId,
    ]);
    expect(after).toBe(0);
  });

  it("rejects an unrecognized field before touching the database at all", async () => {
    const created = await identityCacheRepo.createIdentityCache({
      firstName: "Jane",
      confidenceScore: 60,
      confidenceSource: "username",
      pipelineVersion: "1.0.0",
      keys: [],
    });

    await expect(
      identityCacheRepo.applyManualOverride(
        created.id,
        "notARealField",
        null,
        "x",
      ),
    ).rejects.toThrow("Cannot override unknown field");

    const overrideCount = await countRows(
      "manual_overrides",
      "identity_cache_id = ?",
      [created.id],
    );
    expect(overrideCount).toBe(0);
  });
});

describe("identity-cache.repo (libSQL) — foreign key verification", () => {
  it("valid FK path: manual_overrides insert succeeds when identity_cache_id references a real row", async () => {
    const created = await identityCacheRepo.createIdentityCache({
      confidenceScore: 60,
      confidenceSource: "username",
      pipelineVersion: "1.0.0",
      keys: [],
    });

    await expect(
      identityCacheRepo.applyManualOverride(created.id, "lastName", null, "Doe"),
    ).resolves.toBeUndefined();
  });

  it("invalid FK path: manual_overrides insert is rejected when identity_cache_id references no row", async () => {
    await expect(
      identityCacheRepo.applyManualOverride(
        randomUUID(),
        "lastName",
        null,
        "Doe",
      ),
    ).rejects.toThrow();
  });

  it("invalid FK path: identity_cache_keys insert is silently ignored (INSERT OR IGNORE), not rejected, for a key pointing at a real identity", async () => {
    // Sanity check on the OR IGNORE behavior noted in the pre-implementation
    // analysis: duplicate/conflicting keys never throw, so createIdentityCache
    // can't be forced to fail via its key inserts — this is why the rollback
    // test above (B) exercises the batch mechanism directly instead.
    const dupEmail = `dup-key-test-${randomUUID()}@example.com`;
    const created = await identityCacheRepo.createIdentityCache({
      confidenceScore: 60,
      confidenceSource: "username",
      pipelineVersion: "1.0.0",
      keys: [{ keyType: "email", keyValue: dupEmail }],
    });

    await expect(
      identityCacheRepo.createIdentityCache({
        confidenceScore: 60,
        confidenceSource: "username",
        pipelineVersion: "1.0.0",
        keys: [{ keyType: "email", keyValue: dupEmail }],
      }),
    ).resolves.toBeDefined();

    // The second identity's key insert was ignored (UNIQUE key_type+key_value
    // already claimed by `created`) — the key still resolves to the original.
    const resolved = await identityCacheRepo.findIdentityByKey(
      "email",
      dupEmail,
    );
    expect(resolved?.id).toBe(created.id);
  });
});
