# Enrich OS

A local-first creator identity enrichment pipeline for influencer outreach. Upload a spreadsheet of creators (name/email/username/profile URL columns in any layout), and Enrich OS normalizes each row, extracts name candidates, scrapes public profile data where available, resolves the most trustworthy identity via a confidence-scoring system, caches resolved identities for reuse, flags duplicates, and exports a clean, reviewed list.

Everything runs locally: SQLite for storage, Next.js for both the UI and the API, no external services required to get started.

## Requirements

- Node.js 20+
- [pnpm](https://pnpm.io/) (this repo uses a pnpm workspace/lockfile — npm/yarn are not tested)

## Setup

```bash
git clone https://github.com/kyo-gre/enrich-os.git
cd enrich-os
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). On first run, Enrich OS creates a SQLite database at `data/enrich-os.db` and applies migrations automatically (see `server/db/migrate.ts`) — no separate database setup step.

### Typical workflow

1. **`/imports`** — upload a CSV/XLSX file, confirm the detected column mapping, run enrichment.
2. **`/review`** — inspect resolved identities, filter by confidence, open a row for the full processing-log/profile-snapshot audit trail, approve/ignore/override/merge records.
3. **`/dashboard`** — see operational stats (processed / needs review / cache hits / duplicates), resolve flagged duplicate candidates, download a quick or full CSV export.

### Available scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Run a production build |
| `pnpm test` | Run the test suite (Vitest) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |

## Environment variables

**None are required.** Enrich OS has no external API keys or services to configure — the SQLite database path, upload/export directories, and pipeline tuning all live in version-controlled files instead:

- `data/enrich-os.db` — created automatically at `server/db/client.ts`'s hardcoded path (`data/`), relative to the process working directory.
- `config/*.json` — see below. These are the actual "configuration" of the system and are meant to be edited directly and committed, not overridden via environment.

If a future milestone needs real secrets (e.g. a paid scraping proxy), they should be introduced via `.env.local` (already gitignored) and documented here at that point — don't add environment-variable plumbing speculatively.

## Configuration files

| File | Controls |
|---|---|
| `config/column-aliases.json` | Header-name → canonical-field guesses for the import column mapper |
| `config/confidence-weights.json` | Per-source evidence weights (`full_name`, `email`, `instagram`, etc.) and the `reviewThreshold` below which a result needs human review |
| `config/descriptor-list.json` | Bio/name descriptor phrases stripped during normalization (e.g. "Mom of 3") |
| `config/pipeline-version.json` | Stamped onto every resolved identity — bump this when scoring/extraction logic changes meaningfully |

## Project structure

```
app/         Next.js routes — pages (app/*/page.tsx) and API routes (app/api/**/route.ts)
components/  React components, grouped by page (review/, dashboard/) or generic (ui/, layout/)
core/        Pure, framework-free business logic — normalization, extraction, confidence
             scoring, profile-scraping adapters, dedupe, export-row building. No DB access.
server/      Everything that touches the database or orchestrates core/ logic:
               db/repositories/  one file per table, all SQL lives here
               services/         orchestration (enrichment pipeline, review actions, exports)
shared/      Zod schemas (source of truth for types) shared between server and client
config/      Tunable JSON config (see above)
tests/       Vitest, mirroring the core/ and server/ structure
```

The `core/` vs `server/` split is deliberate: `core/` functions are pure (input in, value out, no I/O), which is what makes the confidence scorer, extractors, and dedupe logic straightforward to unit test without a database. `server/` is where those pure functions meet SQLite and get wired into HTTP handlers.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the reasoning behind the confidence/caching/dedupe/review design — several of these decisions are not obvious from the code alone and are documented there specifically so they don't need to be rediscovered.

## Testing

```bash
pnpm test
```

Tests are organized to mirror the source tree (`tests/core/...`, `tests/server/...`). Server-layer tests mock the repository modules rather than hitting the real SQLite file (see any `tests/server/*.service.test.ts`); `tests/server/db.smoke.test.ts` is the exception, using an in-memory SQLite database to verify the schema/migrations themselves.
