# Deployment Hardening Phase: SQLite → Turso

**Status:** Not started (checklist only, per approval — see PR/commit history for the approved proposal).

This is infrastructure work, not a feature milestone (no "M10" label — see `docs/ARCHITECTURE.md`'s milestone history and the deployment-architecture proposal for why). Success is defined as **zero observable behavior change**, deployability on Vercel, and closing a specific pre-existing test-coverage gap on the identity-cache transaction paths. Nothing in this document authorizes code changes by itself — it's the audit checklist those changes are measured against.

## Non-negotiable constraints (from approval)

- All M1–M9 functionality and behavior is preserved exactly.
- No business logic changes — this is a driver swap plus mechanical `async` propagation, not a rewrite.
- Transaction handling and foreign-key behavior get explicit correctness verification, not assumed parity.
- New regression tests exercise the identity-cache transaction paths against a **real** database (not mocks) before this is considered complete.
- Verified against a real Turso database before deployment.
- Verified for cross-request persistence on Vercel after deployment.

## Checklist

### 1. Dependencies and connection layer
- [ ] `@libsql/client` added; `better-sqlite3` and `@types/better-sqlite3` removed.
- [ ] `server/db/client.ts`: connection selects a local file URL (`file:./data/enrich-os.db`) when `TURSO_DATABASE_URL` is unset, and the real Turso URL + auth token when set. The `globalThis`-caching pattern (Fast Refresh safety) is preserved.
- [ ] `PRAGMA foreign_keys = ON` is confirmed to apply per the new client's actual connection/session model (verified, not assumed — see §4).
- [ ] `server/db/migrate.ts` applies `0001_init.sql` unchanged (no schema edits) through the new client.

### 2. Repository layer (7 files)
- [ ] `creators.repo.ts`, `exports.repo.ts`, `imports.repo.ts`, `jobs.repo.ts`, `processing-logs.repo.ts`, `profile-snapshots.repo.ts` — every function converted to `async`, same SQL text, same parameter binding, no query logic changes.
- [ ] `identity-cache.repo.ts` — same, **except** the two `db.transaction()` call sites (`createIdentityCache`, `applyManualOverride`), which get a deliberate rewrite (see §4), not a mechanical swap.
- [ ] `git diff` review confirms no SQL string was altered anywhere in this step (only call syntax and `async`/`await`).

### 3. Service and route layers
- [ ] All 6 service files (`dedupe`, `enrichment`, `export`, `identity-cache`, `import`, `review`) propagate `async`/`await` with no reordering of existing sequential logic.
- [ ] All 11 affected API routes add `await` at the call site (`enrich/route.ts` already awaits — confirm no double-await or signature mismatch introduced).
- [ ] `tsc --noEmit` passes with zero errors — used as the primary completeness signal for "did I miss an await somewhere."

### 4. Transaction and foreign-key correctness (priority area)
- [ ] `createIdentityCache`'s insert-identity + insert-keys is atomic under the new client (all-or-nothing) — verified by a real test that forces a partial-failure scenario (e.g., a duplicate key constraint mid-batch) and confirms no orphaned identity row is left behind.
- [ ] `applyManualOverride`'s audit-log-insert + cache-row-update is atomic under the new client — same style of forced-failure test.
- [ ] `migrate.ts`'s per-migration atomicity is preserved (a failed migration doesn't leave a partially-applied schema).
- [ ] Foreign-key cascade/set-null behavior is verified against a **real** database connection, not assumed from the schema file alone:
  - [ ] Deleting an `import_history` row cascades to its `creators` rows.
  - [ ] Deleting an `identity_cache` row sets `creators.identity_cache_id` to `NULL` (not a cascade delete).
  - [ ] Deleting an `identity_cache` row cascades to its `identity_cache_keys` and `manual_overrides` rows.
  - [ ] Deleting a `creators` row cascades to its `profile_snapshots` and `processing_logs` rows.

### 5. Regression coverage (must exist before this phase is "complete")
- [ ] New test(s) in `tests/server/` exercise `createIdentityCache` and `applyManualOverride` against a **real** libSQL connection (local file or in-memory), not the mocked repository module — closing the pre-existing gap where `identity-cache.service.test.ts` mocks the repo entirely and never exercises the real transaction code.
- [ ] `tests/server/db.smoke.test.ts` rewritten against the libSQL client (same schema-verification + FK-cascade assertions as today, run through the actual production client/dialect).
- [ ] The 4 existing mocked service tests (`dedupe`, `export`, `identity-cache`, `review`) updated (`mockReturnValue` → `mockResolvedValue`) with **no assertion logic changed** — a diff to these files should show only mock-setup syntax changes.
- [ ] Full suite (`pnpm test`) passes, same test count or higher, zero skipped/pending tests introduced.

### 6. Local development parity
- [ ] `pnpm install && pnpm dev` works with no `.env.local` file, against a local file-backed libSQL connection — confirming the "preserve local SQLite development" requirement in practice, not just in the proposal's claim.
- [ ] Full manual workflow walkthrough locally: import → column mapping → enrich → review (approve/ignore/override) → merge → unmerge → duplicate detection → export (quick + full) → dashboard stats. Output compared against pre-migration behavior for the same seeded input.

### 7. Real Turso verification (before deployment)
- [ ] A real Turso database is provisioned (not a local file) and the app runs against it via `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`.
- [ ] The same manual workflow walkthrough from §6 is repeated against the real Turso database, not just the local file — this is the step that actually validates network-client behavior (latency, connection handling, remote transaction semantics), which a local file can't test.
- [ ] The §4 foreign-key and transaction checks are re-verified against the real Turso database specifically (local-file SQLite and hosted libSQL can theoretically diverge in edge-case enforcement; don't assume the local-file test result generalizes).

### 8. Deployment and post-deploy verification
- [ ] `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` set in Vercel project settings; `.env.example` and README updated to document them (closing the gap from the earlier environment-variable audit).
- [ ] Deployed to Vercel.
- [ ] **Cross-request persistence check:** data written by one request (e.g., an import upload) is confirmed visible in a subsequent, separate request — ideally by hitting the deployed API from two distinct clients/requests, not just reloading a page that might hit a warm/cached path. This is the direct regression test for the original problem this phase exists to fix.
- [ ] A cold-start check specifically: trigger a fresh function invocation after idle time and confirm previously-written data is still present (guards against the "ephemeral /tmp" failure mode even if the primary check above passes on warm instances).

## Success criteria (objective, for audit)

This phase is complete when **all** of the following are simultaneously true:

1. `pnpm test` passes in full, including new tests added under §5, with zero test-assertion changes to pre-existing tests beyond mock syntax.
2. `tsc --noEmit` and `pnpm lint` both pass with zero errors.
3. The manual workflow walkthrough (§6/§7) produces identical results locally, against local file storage, and against a real Turso database.
4. All four foreign-key behaviors and both transaction-atomicity behaviors in §4 are verified against a real database connection with an explicit pass/fail result recorded (not inferred from code review alone).
5. The cross-request and cold-start persistence checks in §8 both pass on the actual Vercel deployment.
6. No file under `core/` or `shared/` was modified (if one was, that's a signal scope crept beyond the driver swap — investigate before proceeding).
7. `better-sqlite3` no longer appears in `package.json`.

If any item fails, the phase is not complete — regardless of how much of the checklist above it is done.
