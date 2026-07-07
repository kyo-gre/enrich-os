# Architecture decisions

This documents the *why* behind choices that aren't obvious from reading the code — the kind of thing that otherwise lives only in a chat history or a reviewer's head. Each section names the decision, the alternative(s) considered, and why they were rejected. If you're about to change one of these, read the rejected alternatives first.

## Layering

```
app/       Next.js routes (UI + API handlers) — thin, no business logic
server/    DB access (db/repositories/) and orchestration (services/)
core/      Pure business logic — no I/O, no database, no fetch
shared/    Zod schemas — the source of truth for types across the stack
```

`core/` functions take plain data in and return plain data out. This is what makes the confidence scorer, name extractors, dedupe matcher, and export-row builders unit-testable without a database or a running server — every `tests/core/*.test.ts` file proves this. If you find yourself importing `server/db/...` from inside `core/`, that's a sign the logic belongs in `server/services/` instead.

`shared/schemas/*.schema.ts` are the canonical type definitions (via `z.infer`). `shared/types/index.ts` just re-exports them. Don't hand-write a parallel `interface` for something that already has a schema.

## The confidence/evidence model

**Decision:** every signal about a creator's identity (a spreadsheet's Full Name column, an email-derived guess, a scraped Instagram display name) becomes a `NameCandidate` with a source and a confidence weight. `scoreCandidates` (`core/confidence/scorer.ts`) just picks the single strongest candidate — it does not merge, average, or blend multiple candidates into a synthesized answer.

**Why:** confidence weights (`config/confidence-weights.json`) represent *evidence strength*, not a probability estimate. Blending would require weights to mean something they don't. A stronger source should win outright; a weaker one should never partially contaminate the result.

**Rejected alternative:** weighted-average merging across candidates. Rejected because it makes the resolved value uninterpretable — you can no longer point to *why* a name is "Jane Doe" instead of "J. Doe" if it's an average.

**Consequence — evidence, never overwrite:** this is why every new evidence source added later (profile scraping in particular) is required to become *another* candidate in the array passed to `scoreCandidates`, never a direct write to `resolved_*` columns. If a spreadsheet says "Jennifer Vasquez" and Instagram says "Jenn V", Instagram becomes a second, weaker candidate — it does not replace the stronger existing one. See `core/extraction/*`, `core/profiles/adapters/index.ts`.

**Consequence — platform/profileUrl/socialHandle/email propagation:** these fields on `ResolvedIdentity` come from *whichever candidate won*, with a fallback to the record's own normalized input when the winner doesn't carry them (e.g. a `full_name` win doesn't know a platform, but the record's spreadsheet-provided profile URL is still real information and shouldn't be dropped). See `server/services/enrichment.service.ts`'s `enrichOne`.

## Profile scraping: never a hard failure

**Decision:** `core/profiles/adapters/index.ts`'s `scrapeProfile` cannot throw. Every failure mode (unknown platform, blocked request, timeout) resolves to `{ candidate: null, error }` instead of propagating an exception. `enrichOne` additionally wraps the scrape call in its own try/catch as defense-in-depth, and `runEnrichmentForImport`'s per-creator loop wraps the *entire* `enrichOne` call so one bad record can never abort the rest of the import.

**Why:** this was an explicit requirement — scraping a third-party site is inherently unreliable (rate limits, layout changes, network issues), and a batch import job processing thousands of rows must not die because row #400's Instagram profile 404s.

**Fetch escalation** (`core/profiles/fetcher/fetch-escalation.ts`): try a plain `fetch()` first; only fall back to a headless browser (`browser-pool.ts`, a single shared Chromium instance, fresh context per call) if the static response looks unusable (too small). Static-first keeps the common case cheap.

**Rate limiting** (`core/profiles/fetcher/rate-limiter.ts`): a simple per-platform sequential queue with minimum spacing between requests, not a general-purpose library — there was no existing dependency for this and the requirement (don't hammer one platform, don't let platforms block each other) didn't need one.

## Identity cache

**Decision:** `identity_cache` stores previously-resolved identities keyed by canonicalized `email` / `username` / `profile_url` (`core/dedupe/canonicalize-key.ts`). `server/services/identity-cache.service.ts`'s `lookupCachedIdentity` checks a record's normalized email, profile URL, and username against the cache; a hit short-circuits the entire enrichment pipeline for that record (no re-extraction, no re-scraping).

**Cache conflict policy (explicit, load-bearing decision):** it's possible for a record's email to match cached identity A while its username matches a *different* cached identity B — a sign the cache has drifted. `lookupCachedIdentity` checks **every** available key (not just the first that hits) specifically to detect this, and returns a `{status: "conflict", identities}` result rather than silently picking one.

- **Rejected: prefer the strongest key.** Silently picking email over username still risks merging two different people's data without anyone knowing it happened.
- **Rejected: auto-merge the two cached identities.** Merging is exactly the kind of judgment call this system otherwise always leaves to a human (see Manual review below) — doing it silently here would be inconsistent.
- **Chosen: flag it.** On conflict, the pipeline runs full extraction/scraping as if it were a fresh record, forces the result to `needs_review`, logs the conflicting `identity_cache` ids, and skips writing to the cache (writing would just deepen the ambiguity). A human resolves it via the review tools.

**Writing to the cache:** only `"enriched"` (confident, not-needing-review) results are cached — a low-confidence guess shouldn't become "the answer" for every future record sharing one of its keys. Writing to an *existing* cache entry only ever adds missing keys to it; it never overwrites the entry's stored fields, because that entry might carry a manual verification (see below) that fresher-but-weaker evidence shouldn't clobber.

## Manual review: approve / ignore / override / merge

**Decision:** four reviewer actions, each in `server/services/review.service.ts`:
- **Approve / Ignore** — sets `review_status`, nothing more.
- **Override** — corrects one field, sets confidence to 100 with source `manual_override`, and writes to the record's `identity_cache` entry too (creating one first if the record was never cached) so the correction benefits every future record sharing that identity's keys.
- **Merge** — marks one creator as a duplicate of another and adopts the target's resolved identity.

**Merges are reversible (explicit decision).** Before overwriting the source record's identity, `mergeDuplicateCreators` snapshots its full pre-merge state into the `merged_duplicate` processing-log entry. `unmergeCreator` reads that snapshot back and restores it exactly.

**Why this matters:** every other layer in this system treats correction as additive, never destructive (candidates aren't overwritten, cache entries aren't overwritten, overrides log old/new value pairs). A silent, permanent merge would have been the one exception. It matters specifically because automated duplicate *detection* (below) will have a higher false-positive rate than a human manually confirming a merge — an unmerge path needs to already exist, not be retrofitted after bad merges have destroyed data. Only the most recent merge per creator is unmergeable; a merge → unmerge → merge chain doesn't retain deeper history.

## Duplicate detection: deterministic only, no fuzzy matching

**Decision:** `core/dedupe/find-duplicate-groups.ts` flags two creators as duplicates if and only if they share the exact same canonicalized `email`, `username`, or `profile_url`. There is no name-similarity matching anywhere in this code.

**Rejected alternative: fuzzy name matching** (e.g. treating "John D." / "John Doe" / "Johnny" as likely the same person). Explicitly ruled out. Name similarity is too error-prone to trust without a human in the loop, and — more specifically to this codebase — the confidence model already treats names as *competing evidence for one identity*, not as an identity key. Reusing them as a fuzzy dedupe key would blur those two concepts together. If two records don't share an exact key, they are simply not flagged; a reviewer who notices a name similarity can still merge them manually.

**Scope:** duplicate detection runs within a single import. Cross-import duplicates of the same person are already unified by the identity cache (the second occurrence gets a cache hit and is never a separate unresolved record) — this only catches exact-match clusters the cache didn't catch, typically because the first occurrence needed review and was never cached.

**Detection never writes anything.** `findDuplicateCandidates` is read-only; `duplicate_of_creator_id` is only ever set by a human confirming a merge. A record flagged as a duplicate *candidate* still exports and processes normally until that happens — see `server/services/export.service.ts`'s `isExportable`.

## Exports

**Decision:** two export types, `quick` (name/email/handle — enough for a fast outreach list) and `full` (everything, including confidence score/source, processing status, review status, pipeline version, and export timestamp). Both exclude `ignored` records and merged duplicates (their canonical data lives on the merge target). `needs_review` records **are** included in a full export — the export should reflect the pipeline's true state, not just the "clean" subset.

**Pipeline version and export timestamp** are stamped onto every full-export row specifically so a downstream consumer can tell which pipeline run produced a row and when it was pulled — useful once the scoring config (`config/confidence-weights.json`) or extraction logic changes between exports of the same import.

## UI: confidence buckets are a filter, not a scoring concept

**Decision:** the review table's High/Medium/Low confidence filter (`components/review/confidence-bucket.ts`) is a pure client-side grouping over the existing `confidenceScore` field. It computes nothing new, stores nothing, and sends nothing back to the server.

**Why this needed to be explicit:** it would have been easy to let "confidence bucket" grow into a second, informal scoring system (e.g. computed server-side, persisted, exposed as an API field) that drifts from the actual confidence-weights-driven score. It's intentionally kept as a display-only derivation so there is exactly one source of truth for confidence: the number the pipeline already computed.

## Pipeline error isolation

**Decision:** `runEnrichmentForImport` wraps each creator's `enrichOne` call in its own try/catch; a failure is logged to `processing_logs` and the loop continues to the next row. This is layered on top of the scraping-specific non-throwing guarantee above — the goal is that *no* failure mode, expected or not, can abort a batch import partway through.
