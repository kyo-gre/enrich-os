# Enrich OS — Project Handoff

**Status as of this document: P1 (Operator Experience) and a major enrichment-quality hardening pass are both underway/complete. Production is live and in real use with real operator data.**

This document is self-contained. A future session should be able to pick up this project from this file alone, without needing prior conversation history.

---

## 1. Current Project Status

Enrich OS is a local-first creator identity enrichment pipeline for influencer outreach: upload a spreadsheet of creators (any column layout), and it normalizes each row, extracts name candidates, scrapes public profile data where available, resolves the most trustworthy identity via a confidence-scoring system, caches resolved identities for reuse, flags duplicates, and exports a clean, reviewed list.

M1–M9 and P0 Deployment Hardening (SQLite→Turso migration) were already complete before this session (see git history / prior handoff content, superseded below). This session covered two follow-on phases:

- **P1A — Workflow Continuity**: fixed real navigation/discoverability gaps found via a UX audit (no way to know what to do after an upload, dead-end Review/Dashboard pages, no import history/recovery).
- **Enrichment pipeline quality hardening**: the operator started actually using the app on real creator data and hit a long chain of real, reproducible bugs in the name-resolution pipeline. All were root-caused against live Instagram data (not mocks) and fixed. This is now the largest single area of change in the project's history.

The operator is actively using the app right now for real work. This is not a "next phase to plan" document — it's mid-use, with one open operational workaround (see §3) that the operator has explicitly accepted for now.

---

## 2. What Actually Exists Now (read this before touching anything)

### Two running instances, doing different jobs — this is intentional, not a bug
- **Production: `https://enrich-os.vercel.app`** — the bookmarked URL, live, auto-deploys on push to `main` via `vercel --prod` (deploys are currently done manually by the assistant via the Vercel CLI each session — there is no git-push-triggers-deploy webhook wired up; confirmed by observing no new deployment appear after a plain `git push` with no deploy step).
- **Local dev server, `localhost:3000`** — run via `npm run dev`. **Connected to the exact same production Turso database** (see below). Used specifically because Instagram/TikTok block Vercel's server IP range (see §3) — enrichment run locally works; the same request from Vercel gets a blocked/placeholder response.

### Local `.env.local` now has real production Turso credentials
`vercel env pull` does **not** work for this by default — it only pulls the `development` environment, and `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` are only configured under the `Production` environment in Vercel. Use `vercel env pull .env.local --environment=production` if this ever needs to be redone. Confirmed working by comparing `GET /api/imports` row counts between `localhost:3000` and the live site (matched exactly after the pull).

**Do not treat local and production as separate/sandboxed.** Enriching a real import locally writes directly to the real production database, visible on the live site immediately. There was a period earlier in this project's life where local dev silently fell back to a local SQLite file (`data/enrich-os.db`) instead — that file may still exist on disk from that period; it is **not** the source of truth and should not be assumed current. If in doubt, compare row counts between local and prod via `GET /api/imports` before trusting a local-only read.

---

## 3. Known, Accepted Operational Constraint: Instagram/TikTok block Vercel's IP

**This is not a bug in this codebase. It is not fixed. The operator has explicitly chosen to work around it, not solve it, for now.**

Confirmed by direct A/B testing: fetching the exact same real Instagram profile URL (`https://www.instagram.com/tinasommer_/`, among others) from a normal residential/non-datacenter network returns the real profile `og:title` (e.g. "Christina Sommer"); the identical request from Vercel's serverless IP returns Instagram's generic logged-out placeholder page (`og:title` literally "Instagram"). This is IP-range-based blocking on Instagram's side, not a code defect — the scraping code itself is correct and works (see §5).

**Practical consequence:** enrichment (the scraping step specifically) must currently be run from `localhost:3000`, not from the live Vercel site, or it will silently under-perform (falls back to weaker email/username-derived guesses instead of real scraped names — it does **not** error or crash, it just gets worse answers). Everything else (upload, mapping, review, dashboard, export) works fine on either.

**Real fix options presented to the operator, not yet chosen:**
1. Route scrape requests through a paid residential/rotating proxy or scraping API (ScraperAPI, ScrapingBee, Bright Data, etc.) — genuine fix, real ongoing cost, needs explicit buy-in before implementing (a permission-classifier boundary already blocked one attempt to test a free public proxy service on the grounds that it would route the operator's real creator data through an unvetted third party without authorization — correctly so; don't try to route around this without the operator's explicit, informed sign-off naming the specific service).
2. Run scraping from some other non-Vercel, non-blocked server the operator controls.
3. Status quo: keep using `localhost:3000` for enrichment.

**Do not silently attempt option 1 or 2 without the operator explicitly choosing it in-session.** This has already come up once as a point of operator frustration/confusion (thinking "local" and "production" were interchangeable, or that the live site was fully "broken") — be precise and proactive about which of the two instances a given action needs when discussing this with the operator.

---

## 4. P1A — Workflow Continuity (complete, deployed)

A UX audit (triggered by a real operator getting stuck after a successful CSV upload, with no visible next step) found and fixed:

- **Sidebar nav to Review/Dashboard was a dead end** without a manually-carried `importId` in the URL. Fixed: both pages now render an import-history picker instead of a blank/dead message when no import is selected.
- **No explicit workflow progression** in the import wizard. Added a 5-step visual stepper (Upload → Confirm Mapping → Run Enrichment → Review Results → Export) with explicit "Step N" labels and next-action copy at each stage.
- **No import history/recovery.** Added `GET /api/imports` (list) and `GET /api/imports/[id]` (single) routes — the repo functions (`listImports`, `getImport`) already existed but were never exposed via API. New `ImportHistory` component shows all past imports with status-aware actions (Resume enrichment for `mapped` status, Review/Dashboard links for `completed`).
- **No persistent "which import am I looking at" context.** Added `ImportContextBar` shown on Review/Dashboard with filename, row count, and stage nav links.
- **Real bug found and fixed during this work:** `import_history.status` never advanced past `mapped` after enrichment ran — `updateImportStatus` existed in the repo layer, tested, but nothing in the application called it. Wired into the enrich route. Without this fix, the new history list would have permanently mislabeled every finished import as still needing enrichment.
- **Real bug found and fixed after initial deploy:** the new `ImportHistory` component polled `GET /api/imports` every 5 seconds on every page that rendered it, indefinitely. Found via a 504 timeout in production logs at the exact moment a real user upload was in flight. Removed the polling — fetch once on mount, consistent with every other screen in the app.

All verified via real Playwright browser runs against the live production URL (not just local), including full upload→mapping→enrichment→review→dashboard→export click-throughs.

---

## 5. Enrichment Pipeline — Correctness Hardening (complete, deployed)

This is the bulk of this session's work. The operator ran real creator data through the pipeline and reported a chain of wrong outputs; each was root-caused against **live Instagram data** (fetched for real, not mocked) before being fixed. In order of discovery:

1. **Blocked-scrape placeholders were silently accepted as real names.** Instagram serving its generic "Instagram" shell page (see §3) was being parsed and trusted as if it were a real display name. Fixed: `core/profiles/adapters/placeholder-detection.ts` detects known platform placeholders and login-wall phrases; a rejected scrape now correctly falls through to other evidence instead of fabricating a name from a non-answer.
2. **A successful scrape never populated firstName/lastName**, only a combined `displayName` — meaning even when scraping worked, the fields the review UI shows stayed empty. Fixed in `core/profiles/adapters/index.ts` (`splitDisplayName`).
3. **Email was scored as equal-weight evidence, not last resort**, so an ambiguous email guess could tie with or beat real scraped evidence. Fixed in `core/confidence/scorer.ts`: any non-email candidate is now preferred over email regardless of raw confidence score, with email only used when nothing else exists.
4. **Decorative Unicode/emoji were never cleaned from scraped names.** Instagram display names commonly use stylized "fancy font" Unicode (Mathematical Alphanumeric Symbols) and emoji as bio decoration. Added `core/normalization/unicode-fold.ts` (NFKD-based folding) and fixed `core/normalization/strip-emoji.ts` (the original emoji regex missed skin-tone modifiers and invisible variation-selector characters — both needed separate Unicode property checks, `\p{Emoji_Modifier}` and `\p{Mn}`).
5. **SHOUTY/all-lowercase names weren't normalized.** Added `core/normalization/title-case.ts` — only acts when a name is uniformly upper- or lower-case; leaves genuinely mixed-case names (e.g. "McDonald") alone.
6. **Business/profession descriptor words weren't stripped from concatenated handles** (no word-boundary in a raw username like "hailyeahpilates"). Added `stripDescriptorSuffix` in `core/normalization/descriptor-list.ts` for suffix-stripping without a word boundary.
7. **Added a username-based extraction tier** (`core/extraction/username-name-parser.ts`) between scraping and email, per explicit operator request ("email only as true last resort"). Splits delimited handles directly; for a run-together handle like "kaylaprincipato", scans for a known first-name prefix ("kayla") rather than guessing blindly. Matching prefix scan is **longest-match-first**, not shortest — see item 11 below for why this matters.
8. **"businessLike" detection**: a scraped display name containing a job-title/business descriptor word anywhere ("San Diego Hairstylist") is now flagged and demoted below email/username fallback — not just the descriptor word stripped, but the *whole remaining label* distrusted, since "San Diego" alone (the business's location) looks perfectly plausible as a name but isn't one. Real regression caught and fixed here: the check originally scanned the *entire raw string including bio tags after a pipe* ("Name | Coach | Founder"), wrongly flagging correct names because of unrelated bio tags — fixed to check only the bio-tag-stripped name portion.
9. **Added a `@handle` fallback tier**, per explicit operator request: when there is genuinely no real evidence (no scraped name, no dictionary-confirmed username split), the pipeline now says so explicitly (`@theirhandle`) instead of presenting a blind mechanical guess (e.g. splitting "strands.oflove" into "Strands"/"Oflove" with zero confirmation either half is a name) as if it were a real answer. Treated as the same last-resort tier as email.
10. **Added a "verified" scoring tier**: a candidate whose firstName/lastName matches the name dictionary (or came from a Full Name column) now wins over an *unverified* candidate regardless of which one has the numerically higher confidence score. This fixed a case where a scraped fitness tagline ("SWIM. BIKE. ULTRA RUN") beat a dictionary-confirmed username split ("Rachel") purely on raw confidence.
11. **Replaced the ~500-name curated dictionary with a comprehensive dataset.** This was the actual root cause of a recurring pattern of failures (Cher, Julianne, Krysta, Rachel, Miles all missing from the old small list — some worked only by lucky fallback ordering, others didn't work at all). Now sourced from real **U.S. Social Security Administration birth-record data** (public domain), filtered to names with 100+ historical recorded births — 40,213 names (`config/common-first-names.json`). Extraction method (SQLite query against the `usbabynames` npm package's bundled SSA data, MIT-licensed) is documented in the comment at the top of `core/extraction/common-first-names.ts` for regeneration if ever needed.
    - The much bigger dictionary immediately surfaced two of its own new bugs, both fixed in the same pass: (a) the concatenated-handle prefix scanner needed to switch from shortest-match to **longest-match-first** with a 5-character minimum prefix, because the bigger list now contains real-but-short names ("Kay", "Hai", "Juli") that were false-matching before reaching the actual intended longer name; (b) a title/honorific token in a delimited handle (`mrs_krysta_`) was being assigned to the firstName/lastName slots by raw position instead of by which token is actually a recognized name — added `mrs`/`mr`/`ms`/`miss`/`mx` to the descriptor list and fixed the order-detection to match whichever token is confirmed, not just `tokens[0]`.

**One known, explicitly accepted residual limitation:** a name with genuinely very low historical frequency (example hit during this session: "Khaina", 18 total recorded U.S. births) will not be in even this much larger dictionary and can still lose to a scraped business/brand name. This is a real, structural ceiling of a finite offline dictionary — not a bug. The agreed-upon handling: the operator reports the specific missed word/name when they hit one, and it gets added in minutes (see the growing-exclusion-list / dictionary-addition pattern established in this session) rather than the project chasing a fully general NLP solution.

**All 12 real-world cases reported by the operator across this session were individually re-verified against live Instagram (not mocks, not stale data) after each fix — 11/12 now resolve correctly, the 12th being the accepted "Khaina" limitation above.**

---

## 6. Locked Architecture Decisions (carried forward from P0, still true)

- **Evidence, never overwrite.** Scraped profile data and cache writes are candidate evidence, never authoritative overwrites.
- **`core/` is pure, `server/` touches I/O.**
- **Ambiguity is flagged, never auto-resolved.**
- **No fuzzy matching, anywhere.**
- **Single strongest candidate, never blended** — refined this session into a multi-tier priority (verified > plausible non-last-resort > email/`@handle` last resort > implausible fallback), but still exactly one winning candidate, never averaged/merged.
- **Merges are reversible.**

New decision from this session: **email and `@handle` fallbacks are explicitly last-resort, never competing evidence** — this is now enforced structurally in `core/confidence/scorer.ts`, not just a convention.

---

## 7. Test Suite / Build Status

- **180/180 tests passing** (`npx vitest run`), `tsc --noEmit` clean, as of the last commit in this session (`ae973e0`).
- Tests were added alongside every fix in §5 (unit tests in `tests/core/` for the scorer tiers, the username parser, the placeholder detection, the Unicode/emoji cleaning, the businessLike flag).
- **A recurring verification pattern used throughout this session, not currently part of the permanent test suite:** a temporary Vitest file under `tests/scratch-*.test.ts` that calls the real pipeline functions (`scrapeProfile`, `extractFromUsername`, `scoreCandidates`, etc.) directly against real Instagram URLs over the live network, with results written to a local text file (`fs.appendFileSync`) since this project's Vitest config suppresses inline `console.log` output. Always deleted after use — **do not leave one of these committed.** This is the fastest way to prove a pipeline fix actually works against real data (mocked tests alone were insufficient to catch several of the bugs in §5, since the bugs were specifically about what real Instagram HTML looks like).

---

## 8. Technical Debt (carried forward + new)

1. `server/db/repositories/jobs.repo.ts` / `job_items` table — still an unused scaffold, unchanged this session.
2. `.env.example` stale wording — unchanged, still worth a pass whenever someone's next in that file.
3. **New:** no CI/CD auto-deploy — every production deploy this session was a manual `vercel --prod` run by the assistant. If deploys should auto-trigger on push to `main`, that needs to be wired up in Vercel's project settings (Git integration), which is not currently configured despite the repo being linked to GitHub for source tracking.
4. **New:** the local-fallback-to-SQLite-file behavior in `server/db/libsql-client.ts` (falls back to `data/enrich-os.db` when `TURSO_DATABASE_URL` is unset) is exactly what caused the local/production confusion in §2. Worth considering whether local dev should *require* Turso credentials (fail loudly) rather than silently falling back, to prevent this class of confusion recurring.

---

## 9. Recommended Next Decision Point

The operator is actively using the app for real work right now. The immediate open question is **§3's operational constraint** — whether to keep working around the Vercel/Instagram IP block manually (current state) or invest in a real fix (proxy service, cost + setup required). This is a live, unresolved decision the operator has deferred, not this document's to make.

Beyond that: given the volume and pattern of enrichment-quality bugs found and fixed this session, it's worth asking the operator directly whether they've now run enough real data through the pipeline to consider it stable, or whether they expect to keep finding new edge cases at the same rate — that would inform whether more proactive hardening (vs. reactive, report-and-fix-in-minutes) is worth investing in next.
