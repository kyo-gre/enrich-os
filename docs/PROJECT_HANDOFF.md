# Enrich OS — Project Handoff

**Status as of this document: P0 Deployment Hardening is CLOSED. Production is live, empty, and operational.**

This document is self-contained. A future session should be able to pick up this project from this file alone, without needing prior conversation history.

---

## 1. Current Project Status

Enrich OS is a local-first creator identity enrichment pipeline for influencer outreach: upload a spreadsheet of creators (any column layout), and it normalizes each row, extracts name candidates, scrapes public profile data where available, resolves the most trustworthy identity via a confidence-scoring system, caches resolved identities for reuse, flags duplicates, and exports a clean, reviewed list.

**All planned feature milestones (M1–M9) are complete. P0 Deployment Hardening (the SQLite→Turso/libSQL migration and production deployment) is complete and closed.** The application is deployed to Vercel, backed by a hosted Turso database, and has been verified end-to-end against that live production stack. Production currently holds zero data rows (deliberately cleaned after workflow verification) — it is a genuinely fresh, ready-to-use production system.

No feature work is in progress. No M10 scope has been defined or started.

---

## 2. Completed Milestones

| Milestone | Scope |
|---|---|
| **M1** | CSV/XLSX import — arbitrary column layouts accepted |
| **M2** | Row normalization + name candidate extraction |
| **M3** | Confidence scoring — single strongest candidate selected, never blended |
| **M4** | Profile scraping — evidence only; never overwrites, never hard-fails on adapter errors |
| **M5** | Identity cache — conflicting evidence flagged `needs_review`, never auto-resolved |
| **M6** | Manual review — approve / ignore / override / merge / unmerge, merges reversible via pre-merge snapshot |
| **M7** | Deterministic-only duplicate detection — explicitly no fuzzy matching |
| **M8** | CSV exports (quick + full) and a stats dashboard (plain numbers, no charts) |
| **M9** | UI polish — app shell, virtualized review table, row detail panel |
| **P0 Deployment Hardening** | SQLite (better-sqlite3) → Turso (libSQL) migration; Vercel deployment; hosted-Turso verification; production workflow validation; closure audit — see §5 and §8 below |

---

## 3. Locked Architecture Decisions

These are established, load-bearing decisions. Do not silently revisit them; any change requires an explicit, deliberate decision, not an incidental refactor.

- **Evidence, never overwrite.** Scraped profile data and cache writes are treated as candidate evidence, never as authoritative overwrites of existing resolved data.
- **`core/` is pure, `server/` touches I/O.** This boundary was preserved through the entire 8-phase deployment migration — zero files under `core/` were touched.
- **Ambiguity is flagged, never auto-resolved.** Identity cache conflicts and duplicate candidates always route to manual review; the system never guesses on the user's behalf.
- **No fuzzy matching, anywhere.** Rejected once already at M8 — do not reintroduce it under a different name (e.g. "similarity scoring", "approximate matching").
- **Single strongest candidate, never blended.** Confidence scoring picks one winning candidate; it does not average or merge multiple signals into a composite identity.
- **Merges are reversible.** Every merge captures a pre-merge snapshot specifically so `unmerge` can restore prior state exactly — verified working against production in this session.

---

## 4. Deployment Architecture

### Why this stack
Vercel serverless functions have a read-only filesystem outside `/tmp`, and `/tmp` does not persist across invocations. The original `better-sqlite3` design wrote to a local file (`data/enrich-os.db`), which is structurally incompatible with that environment. Turso (hosted libSQL) was chosen over Postgres-family alternatives because it is SQLite-wire-compatible — no SQL dialect rewrite was needed anywhere in `core/` or `server/`.

### Components
- **Vercel** — hosts the Next.js 16 App Router application. Project: `kyogre-protocol/enrich-os`, linked to GitHub (`kyo-gre/enrich-os`), auto-deploys on push to `main`.
- **Turso (hosted libSQL)** — the production database. Connection is via `@libsql/client` (v0.17.4).
- **`server/db/libsql-client.ts`** — the single connection module every repository imports. Selects a local file (`data/enrich-os.db`) when `TURSO_DATABASE_URL` is unset (so `pnpm dev` works with zero `.env` config), or the real Turso URL + auth token when set. Wraps `execute`/`batch` in a `Proxy` that awaits a `migrationsReady` promise first, so no query can race ahead of schema setup — including a genuine cold start against Turso.
- **`server/db/client.ts`** — a thin compatibility re-export of `libsqlClient` as `db`, kept so pre-migration "import client.ts to guarantee schema exists" call sites still work unchanged.
- **Migration system (`server/db/migrate.ts`)** — applies each unapplied `.sql` file in `server/db/migrations/` (currently just `0001_init.sql`), tracked in a `_migrations` bookkeeping table. Each file's DDL + its bookkeeping insert run inside one `BEGIN`/`COMMIT` via `executeMultiple`. The bookkeeping insert uses `INSERT OR IGNORE` specifically because this function can run concurrently from multiple cold-start processes (verified via repeated local cold-start reproduction in Phase 6 of the migration).

### Known engine-specific gotcha (fixed, keep in mind for any future connection-layer work)
Hosted Turso's remote (hrana/HTTP) protocol rejects some PRAGMA statements outright with `SQL_PARSE_ERROR`, even ones that are harmless no-ops locally. `PRAGMA busy_timeout = 5000` (needed only for local multi-process WAL contention, e.g. parallel test workers) is now gated behind `!process.env.TURSO_DATABASE_URL` in `libsql-client.ts` for exactly this reason. If you add any other PRAGMA or connection-level statement, verify it against real hosted Turso, not just the local file driver — local and hosted libSQL are not behaviorally identical.

### Environment variables (production)
Set on Vercel, Production environment only, both encrypted:
- `TURSO_DATABASE_URL` — `libsql://<db-name>.turso.io`
- `TURSO_AUTH_TOKEN`

No other environment variables are read anywhere in the codebase (confirmed by full-repo grep during the closure audit).

### File-upload protections
`.vercelignore` explicitly excludes `.env*` (with `.env.example` re-allowed). This exists because Vercel's CLI deploy-upload does **not** reliably respect `.gitignore` for this — a local `.env` was uploaded into the build source once before this was added. Do not remove or narrow this exclusion.

---

## 5. Verification History

### Hosted Turso verification (pre-deployment)
Run directly against a hosted Turso database (not the local file driver, not mocks), using the actual production `libsqlClient` singleton:
- Migrations apply correctly on a cold connection
- Transaction commit (`batch()`, all-or-nothing)
- Transaction rollback (forced PK collision — verified no partial commit)
- FK enforcement (`PRAGMA foreign_keys = 1` by default, confirmed empirically rather than assumed)
- FK cascade delete (`import_history` → `creators`)
- FK set-null (`identity_cache` deletion → `creators.identity_cache_id`)
- Full 72-test repository suite passed against hosted Turso

This is where the `busy_timeout` PRAGMA bug (see §4) was found and fixed — it only surfaced against the real hosted protocol, never against the local file driver.

### Production workflow verification (post-deployment)
Executed against the live deployed application at `https://enrich-os.vercel.app`, hitting real API routes, writing to real hosted Turso:

Import → Mapping → Enrichment → Review (approve) → Override → Merge → Unmerge → Export (quick + full) → Dashboard

Every step produced correct, consistent results — including correct duplicate-group detection by both `email` and `profile_url` keys, correct identity-cache hit tracking, and correct unmerge reversal of a merge (confirming the pre-merge-snapshot mechanism works against production, not just in local tests).

### Persistence verification
Confirmed data survives an actual Vercel redeploy (new serverless instances, genuine cold start) — a workflow-test override and unmerge state were both intact after redeploying.

### Closure audit (read-only + cleanup)
Directly queried the production database (not inferred from application behavior):
- `_migrations` contains exactly one row (`0001_init.sql`) — no duplicate or dead migration bookkeeping
- Zero orphaned records across all FK relationships (creator→import, creator→identity_cache, creator→duplicate-of)
- Schema matches expected 10 tables + `_migrations`
- `PRAGMA foreign_keys = 1` confirmed active on production

---

## 6. Technical Debt

Only two genuine items remain — deliberately not expanded beyond what's real:

1. **`server/db/repositories/jobs.repo.ts` (and `job_items` table) — unused scaffold.** Added in commit `28ad12a` with zero production consumers; nothing in `app/` or `server/services/` imports it. Not created or expanded by the deployment migration. Leave alone unless a future milestone actually needs a job queue — do not build one speculatively.
2. **`.env.example` has stale wording.** Still describes the database layer as "Phase 1: connection layer foundation only" and "not yet wired into any repository" — both now false (migration is fully complete). Harmless (doesn't affect behavior), but worth a quick doc pass whenever someone is next touching that file.

---

## 7. Known Risks

**Low only. No Medium or High risks identified.**

- **Concurrent first-boot migration race, not explicitly force-tested against production.** The `INSERT OR IGNORE` fix for this was adversarially reproduced and verified fixed against local libSQL (8 consecutive cold-start attempts) and functionally confirmed clean against hosted Turso, but the specific race condition (multiple simultaneous first-ever connections to a brand-new, unmigrated production database) was not deliberately forced against Turso itself. The fix is plain idempotent SQL, not driver-specific, so residual risk is theoretical — but note it if production is ever fully torn down and recreated from scratch.

---

## 8. Current Production State (operator-ready snapshot)

| Item | Value |
|---|---|
| Application URL | https://enrich-os.vercel.app |
| Vercel project | `kyogre-protocol/enrich-os`, linked to GitHub, auto-deploys on push to `main` |
| Database | Hosted Turso, production instance (`enrich-os-prod`) |
| Database row counts | **0 across all 10 tables** — deliberately cleaned after workflow verification |
| Migration state | 1 migration applied (`0001_init.sql`), correctly tracked |
| Env vars configured | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (Production only, encrypted) |
| Scratch verification DB | `enrich-os-verify` — deleted; its token is confirmed unreachable (502) and defunct |
| Repo state | Clean — no uncommitted files, all Phase 1–8 + closure-audit work committed and pushed to `origin/main` |
| Local test suite | 145/145 passing |
| Local typecheck / build / lint | Clean |

**Operator actions required right now: none.** All previously-open follow-up items (token exposure, verify-DB retention, production test data) were resolved and verified during the closure audit.

---

## 9. Recommended Next Decision Point

No implementation work is recommended or implied by this document. The next actual decision — to be made by the project owner, not derived automatically — is:

**What is the first real (non-test) usage of the production system going to be, and does it require anything this document doesn't already cover?**

Concretely, before any new development work begins, someone needs to decide:
- What real creator-list data will first be imported into this now-empty production database, and by whom.
- Whether that first real usage surfaces any gap in the current M1–M9 feature set that would justify scoping an M10 — as opposed to treating the current feature set as sufficient and moving to a pure operations/maintenance phase.

This handoff document does not take a position on that decision. It exists so that whoever makes it — including a future Claude session — has accurate, complete context on what already exists and what has already been verified, so the decision is about product direction, not about re-discovering deployment state.
