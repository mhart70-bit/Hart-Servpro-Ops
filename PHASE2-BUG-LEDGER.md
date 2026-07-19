# Phase 2 Bug Ledger — Hart Sales OS

Every bug found during the end-to-end audit, its fix, the files touched, and the
test that now proves it works. Test suite: `npx playwright test` (32 tests,
runs against a local Supabase stack — never production). Seed: `tests/seed.mjs`.

## Security (critical)

| # | Bug | Fix | Files | Proven by |
|---|-----|-----|-------|-----------|
| S1 | Anthropic API key shipped in the browser bundle — any user could extract it and bill the account | Claude call moved to a server-side Supabase Edge Function; key held as a server secret, callable only by signed-in users | `supabase/functions/parse-note/index.ts` (new), `src/lib/claude.ts`, `.env`, `.env.example` | Build scan: no `sk-ant` in `dist/`; function returns 401 unauthenticated |
| S2 | Any rep could promote themselves to `owner` via the REST API (`profiles_update_own` had no column restrictions) — **confirmed live during testing** | New update policy pins `role`, `org_id`, `location_id` to their current values; separate admin policy for owner/GM edits | `supabase/migrations/004_security_fixes.sql` | `security.spec.ts` › "rep cannot promote their own role to owner" |
| S3 | Public signup trusted client-supplied metadata for `role` — an outsider could register as an owner | Signup trigger now always creates `rep`; role upgrades happen in Team by an owner | `004_security_fixes.sql` (`handle_new_user`) | `security.spec.ts` › "public signup cannot self-assign the owner role" |
| S4 | A rep could insert activities/deals under another rep's ID (forged accountability records) | Insert policies now require `rep_id = auth.uid()` unless owner/GM | `004_security_fixes.sql` | `security.spec.ts` › "rep cannot spoof another rep's id on an activity" |

## Correctness

| # | Bug | Fix | Files | Proven by |
|---|-----|-----|-------|-----------|
| C1 | Alerts page loaded forever — query keys contained a fresh timestamp every render, causing an infinite refetch loop | Timestamps made stable per mount (`useMemo`) | `src/pages/Alerts.tsx` | `manager-flows.spec.ts` › "alerts page shows the three buckets" |
| C2 | Same infinite-refetch loop on Weekly Summary's stale-ERP query | Same fix | `src/pages/WeeklySummary.tsx` | Suite passes; page renders |
| C3 | Dashboard "Log" button on overdue/due-today rows opened the quick-log modal **empty**, forcing the rep to re-search the contact they just clicked | Button now passes the clicked contact into the modal | `src/pages/Dashboard.tsx` | `rep-flows.spec.ts` › "dashboard hit-list Log button pre-fills the clicked contact" |
| C4 | The follow-up date a rep picked (or spoke) was **discarded** — next visit was always reset to today + visit frequency, so promised follow-ups never resurfaced on the dashboard | Chosen/parsed follow-up date now drives `next_visit_due_at`; frequency is only the fallback | `src/components/QuickLogModal.tsx`, `src/pages/LogActivity.tsx` | `rep-flows.spec.ts` › "quick log respects the follow-up date the rep picked" |
| C5 | Every voice note mentioning a dollar amount created a **new** deal — duplicates guaranteed (observed live: two "— Sarah Chen" deals) | If the contact already has an open deal, its value is updated instead | `src/pages/LogActivity.tsx` | `rep-flows.spec.ts` › pipeline test asserts exactly one Sarah deal |
| C6 | The AI parser had no idea what today's date is — "follow up Thursday" produced dates from 2025 | Current date injected into the parsing prompt (server-side) | `supabase/functions/parse-note/index.ts` | Live curl test: "Thursday" → 2026-07-23 |
| C7 | Quotas page had a Rules-of-Hooks violation (role guard returned before hooks) — crash risk when the profile loads | Guard moved below all hooks | `src/pages/Quotas.tsx` | `manager-flows.spec.ts` › "quotas page renders without crashing" (asserts zero hook errors) |
| C8 | Voice-log save failures were silently swallowed — the rep's note vanished with no message | Error banner shown on the confirm screen; note preserved | `src/pages/LogActivity.tsx` | `rep-flows.spec.ts` › "parse failure surfaces an error and keeps the note" |
| C9 | Next Step box save errors were ignored (typed text could vanish silently) | Error checked and shown with a retry hint | `src/pages/ContactDetail.tsx` | `rep-flows.spec.ts` › "contact detail: history, next step autosave" |
| C10 | Default follow-up date used UTC — reps logging in the evening got a date one day later than intended | Local calendar date used | `src/components/QuickLogModal.tsx` | Follow-up date test (local-date assertion) |
| C11 | Ledger's market filter ran client-side over only the newest 200 rows — older entries from the chosen market silently hidden | Filter moved into the database query | `src/pages/Ledger.tsx` | Typecheck + suite (no dedicated data-volume test) |
| C12 | Clearing a flagged note didn't refresh the dashboard "Flagged" tile (invalidated a non-existent cache key) | Correct key (`dash-flagged`) invalidated | `src/pages/FlaggedQueue.tsx` | Code fix; tile refresh is a cache effect |
| C13 | Sales stat tiles went stale after creating/editing/advancing a deal | `sales-stats` invalidated on all three mutations | `src/pages/Sales.tsx` | Code fix (covered indirectly by deals test) |
| C14 | Dashboard market-activity cache key named the wrong variable (month vs week) — stale weekly feed at week rollover | Key corrected to `weekStart` | `src/pages/Dashboard.tsx` | Code fix |
| C15 | "My Route" (the rep's daily field list) existed but was linked from **no menu** — unreachable | Added to rep navigation | `src/components/Sidebar.tsx` | Nav renders "My Route" |
| C16 | Two components shared one cache key with different data shapes (`contacts-picker`) — could silently break the visit-frequency fallback | Keys separated | `src/components/QuickLogModal.tsx` | Suite passes |

## Known limitations (reported, not fixed — need your call)

- **"Stale deals" uses last-edit time as a proxy for stage movement** — editing a deal's notes resets its stuck-clock. A real fix needs a `stage_changed_at` column (schema change).
- **Quotas counts "paid" deals by last-edit date** — same schema limitation.
- **Quick log still captures no outcome/next-step action** — adding those fields is a product/UX decision (Phase 1 friction finding #2), not a bug fix.
- **GMs see all five markets on Markets / All Deals / Dashboard market cards / Flagged Queue** — the database intentionally grants GMs org-wide read, so this is a product decision, not a defect.

## Production deployment steps (require your go-ahead — touch live systems)

1. **Rotate the Anthropic key** at console.anthropic.com (the old one is in previously-deployed bundles — treat as burned).
2. `supabase secrets set ANTHROPIC_API_KEY=<new key>` then `supabase functions deploy parse-note` (project `vnzgwhvdhyizrdevvkne`).
3. Run `supabase/migrations/004_security_fixes.sql` in the production SQL editor (or `supabase db push`).
4. Remove `VITE_ANTHROPIC_API_KEY` from Vercel env vars and redeploy the app.
