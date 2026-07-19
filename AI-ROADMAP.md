# Hart Sales OS — AI Roadmap

*Principle: reps do rep work — get in front of customers and build relationships.
Everything else (planning, logging, remembering, reporting) is the system's job.
Every feature below is judged by one test: does it remove a task from the rep's
day, or surface an answer Mark would otherwise have to ask for?*

---

## The target day

**7:30 AM — the rep opens the app.** Instead of a bare list, the dashboard
leads with a briefing written by Claude that morning, from the rep's own data:

> Six stops today, in driving order. Start at Westside — Sarah Chen is 12 days
> overdue, she gave a verbal on the ERP, and your note says you promised the
> paperwork. Bob Ivers renews his book in August; he's two blocks from your
> lunch stop. You told Carla Dunn "two weeks" — that's today.

The rep never planned anything. The plan came from data they logged by talking.

**In the field.** After each stop, hold the mic button and talk for fifteen
seconds. The existing parser (already live) files the contact, outcome, deal
value, and follow-up date, and shows a confirm card. New: the same mic accepts
*commands* — "push Bob to next Tuesday," "make Carla high priority," "mark the
Chen deal approved," "add contact John Smith, plumber, Amarillo" — parsed to a
proposed change, confirmed with one tap, executed. No form was ever opened.

**5:00 PM.** Nothing to "wrap up." The day's notes are in the ledger, every
follow-up is scheduled, tomorrow's briefing builds itself overnight.

**Mark, any time.** In his own Claude (claude.ai / Desktop, Sonnet 5 or
better), connected to the CRM's database:

> "Who hasn't logged anything this week?" · "Summarize Amarillo's last 30 days."
> "Which deals over $10k haven't moved?" · "Draft my Monday team notes."

Conversational, cross-market, no dashboard digging. Read-only by design.

---

## Architecture: three layers

### Layer 1 — Owner intelligence (Mark's Claude ↔ the database)
**Mechanism:** Supabase's official MCP server — the standard connector that
lets claude.ai / Claude Desktop talk to outside systems. Added once in Claude's
Settings → Connectors, authenticated with Mark's Supabase account, **scoped
read-only** to this project.
**Why read-only first:** a conversational AI with unattended write access to
production is a prompt-injection risk. Week one: read-only, build trust.
Then: enable **add** and **archive** (is_active=false) with claude.ai's
per-action approval prompts as the confirm step. Hard delete does not exist
at the database level (no delete policy — deliberate); "remove" always means
reversible archive with history preserved.
**Build cost:** ~zero code. Configuration + a saved "analyst" prompt with the
schema explained (tables: contacts, activities, deals, profiles, quotas).

### Layer 2 — Rep copilot (in-app, works for every rep)
Two new edge functions, both clones of the proven `parse-note` pattern
(server-held key, JWT-gated, Sonnet 5):

1. **`plan-day`** — input: the rep's overdue/due-today contacts, their next
   steps, recent notes, open deals. Output: the morning briefing (5–8
   sentences, driving-order aware via the existing geo module). Rendered as
   the first card on the rep dashboard; cached for the day; regenerate button.
2. **`parse-command`** — input: a transcript. Output: a structured action —
   `{action: 'reschedule'|'set_priority'|'advance_deal'|'add_contact'|
   'set_next_step'|'log_note', target_contact, params, confidence}`.
   The app resolves the contact, shows a confirm card (exactly like today's
   note preview), and executes **only on tap**. Unrecognized/low-confidence →
   falls back to the note parser (nothing is ever lost).
   **All writes ride the existing RLS** — a rep's voice can only change a
   rep's own book. Every executed command also logs an activity row, so the
   audit trail stays complete.

### Layer 3 — Proactive delivery (later, optional)
- **Monday owner digest:** scheduled job runs the "analyst" queries and emails
  Mark a summary. (Supabase scheduled functions + the existing data.)
- **SMS logging:** the database already has `inbound_messages` and `rep_phones`
  tables waiting — a rep could text a field note to a Twilio number and the
  parser files it. Zero new schema; the plumbing was anticipated.

---

## Build plan

| Phase | What | Who acts | Effort |
|---|---|---|---|
| **A — Prerequisite** | Restore prod Supabase, run `deploy-security-fixes.command`, reset Mark's password. AI + write-commands on a database with the current RLS hole is a hard no. | Mark (5 min) + me | — |
| **B — Owner MCP** | Connect Mark's Claude to the project read-only; saved analyst prompt; test with real questions | Mark (10 min, guided) + me | ~1 hr |
| **C — Morning briefing** | `plan-day` function + dashboard card + tests; upgrade both functions to `claude-sonnet-5` | me | ~1 day |
| **D — Voice commands** | `parse-command` + confirm card + 6 starter commands + tests | me | ~2–3 days |
| **F — Apollo import** | CSV import with dedupe preview (match email/phone/name+company); later: direct Apollo API search via edge function (server-held Apollo key) | me | ~½ day (CSV) |
| **E — Proactive** | Monday digest, then SMS if wanted | me | later |

**Running cost, honestly:** the briefing is ~2k tokens per rep per day; commands
are smaller. Ten reps on Sonnet 5 ≈ **well under $10/month**. Mark's MCP layer
bills nothing extra beyond his Claude subscription.

**Friction ledger (the point of it all):**
- Plan the day: 20 min with a coffee → 0 (read one card)
- Log a visit: forms → 15 seconds of talking (already live)
- Change the CRM: find contact → open → edit → save → say it, tap once
- Owner visibility: click through 5 pages → ask one question
