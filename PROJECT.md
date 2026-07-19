# Hart SERVPRO Sales CRM — Master Project Brief
> This document is the north star for autonomous development. Read it completely before writing any code.
> When in doubt, refer back here. Simplicity wins over cleverness every time.

---

## WHAT THIS IS

A custom sales CRM for Hart SERVPRO — five franchise locations across Texas. It is NOT a generic CRM. It is purpose-built for one company's sales reps and one owner who needs to know what's happening across all five markets without digging.

**Owner:** Mark Hart (Director / Architect). Reads summaries. Does not want to click through anything.
**Primary users:** Sales reps in Amarillo, Abilene, San Angelo, Victoria, and Sugar Land.
**Secondary users:** GMs at each location.

---

## THE TWO NON-NEGOTIABLES

Every screen, button, and feature must serve at least one of these:

1. **Rep accountability** — Did the rep make contact? When? What's the next step? Is anything overdue?
2. **Management visibility** — Mark and GMs can see, at a glance, what's happening across all markets without asking anyone.

If a feature doesn't serve one of these two outcomes — cut it.

---

## PHILOSOPHY: RADICAL SIMPLICITY

- Every page has ONE primary job. State it clearly at the top.
- No page has more than 3 sections.
- Every section answers one question.
- Reps should be able to log an activity in under 30 seconds.
- Mark should be able to read the state of his business in under 60 seconds.
- If it's not obvious, it's wrong. Delete it.

---

## CURRENT PROJECT STATE

**What exists:**
- `/package.json` — Full dependency set installed. React 19, TypeScript, Vite, Tailwind v4, Radix UI, Supabase, React Query, React Router, date-fns, lucide-react.
- `/supabase/migrations/001_initial_schema.sql` — Complete database schema. Do NOT redesign this. Build on it.
- `/src/lib/utils.ts` — Utility functions, type constants, and helper methods. These are correct. Use them.
- `/assets/` — Compiled output from a prior build. Ignore it; rebuild from source.
- `/.env.example` — Shows required env vars. A `.env` file must exist before the app will run.

**What does NOT exist yet (you must build everything in `/src/` except `lib/utils.ts`):**
- Types (`/src/types/index.ts`)
- Supabase client (`/src/lib/supabase.ts`)
- Auth (`/src/lib/auth.tsx`)
- All React components and pages
- All routing
- All Supabase query hooks
- Entry point (`/src/main.tsx`, `/src/App.tsx`)

---

## TECH STACK — USE EXACTLY THESE

| Layer | Tool | Notes |
|---|---|---|
| Framework | React 19 | Already installed |
| Language | TypeScript strict mode | All files `.tsx` or `.ts` |
| Build | Vite | Config already exists |
| Styling | Tailwind v4 | Use `@import "tailwindcss"` — no config file needed in v4 |
| UI Components | Radix UI | Already installed. Use for dialogs, dropdowns, tabs, selects |
| Icons | lucide-react | Already installed |
| Database | Supabase | Use `@supabase/supabase-js`. Already installed |
| Data fetching | TanStack React Query v5 | Already installed |
| Routing | React Router v7 | Already installed |
| Date handling | date-fns | Already installed |
| Path alias | `@/` maps to `./src/` | Configured in tsconfig |

**Do NOT add new dependencies without strong justification.** The stack is complete.

---

## DATABASE SCHEMA (DO NOT CHANGE — build around this)

Tables and their purposes:
- `organizations` — Tenant root (Hart SERVPRO, id: `00000000-0000-0000-0000-000000000001`)
- `locations` — 5 franchise markets (Amarillo, Abilene, San Angelo, Victoria, Sugar Land)
- `profiles` — Users: role is `owner`, `gm`, or `rep`; each assigned to a location
- `contacts` — COIs (Centers of Influence) and customers. The core entity.
- `activities` — Every rep action: visit, call, email, note, voice_note
- `deals` — Restoration jobs / pipeline
- `coi_categories` — Contact types (Insurance Agent, Plumber, Property Manager, etc.)
- `quotas` — Rep targets by period

Key contact fields to always surface:
- `next_visit_due_at` — When is this contact due for a visit?
- `last_contacted_at` — When did a rep last touch them?
- `assigned_rep_id` — Who owns this contact?
- `priority` — high / medium / low

RLS is enabled. The app uses Supabase auth. Reps see only their own contacts/activities. Owners and GMs see everything in their org.

Helper functions available in DB: `my_org_id()`, `my_role()`, `my_location_id()`

---

## TYPES FILE — BUILD THIS FIRST

Create `/src/types/index.ts` with types that mirror the database schema exactly. Key types needed:

```typescript
export type UserRole = 'owner' | 'gm' | 'rep'
export type ActivityType = 'visit' | 'call' | 'email' | 'note' | 'voice_note'
export type DealStage = 'emergency_call' | 'assessment' | 'estimate' | 'approved' | 'job_start' | 'completion' | 'invoiced' | 'paid' | 'lost'
export type Priority = 'high' | 'medium' | 'low'
export type DamageType = 'water' | 'fire' | 'mold' | 'storm' | 'biohazard' | 'other'

// Match DB rows exactly — add id, org_id, created_at to all
export interface Profile { ... }
export interface Contact { ... }
export interface Activity { ... }
export interface Deal { ... }
export interface Location { ... }
export interface COICategory { ... }
export interface Quota { ... }

// View types (joined queries)
export interface ContactWithCategory extends Contact { category: COICategory | null }
export interface ActivityWithContact extends Activity { contact: Contact | null }
```

---

## SUPABASE CLIENT

Create `/src/lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types' // generate with supabase CLI if available, otherwise type as any

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase env vars. Check .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
```

---

## APPLICATION STRUCTURE

```
/src
  main.tsx              — React entry point, QueryClientProvider, RouterProvider
  App.tsx               — Root: auth check, route to login or app shell
  /lib
    utils.ts            — EXISTS. Do not modify.
    supabase.ts         — Create this
    auth.tsx            — Auth context provider + useAuth hook
  /types
    index.ts            — All TypeScript types
  /hooks
    useContacts.ts      — Supabase queries for contacts
    useActivities.ts    — Supabase queries for activities
    useDeals.ts         — Supabase queries for deals
    useProfile.ts       — Current user's profile
  /components
    /ui                 — Reusable atoms (Button, Badge, Card, Input, Modal, etc.)
    /layout             — AppShell, Sidebar, Header
    ActivityForm.tsx    — Log an activity (used everywhere)
    ContactCard.tsx     — Compact contact summary
    DealCard.tsx        — Compact deal summary
  /pages
    LoginPage.tsx
    /rep                — Rep-facing views
      RepDashboard.tsx
      RepContacts.tsx
      ContactDetail.tsx
      RepPipeline.tsx
    /manager            — Mark / GM views
      ManagerDashboard.tsx
      AllContacts.tsx
      AllDeals.tsx
      RepActivity.tsx
      Alerts.tsx
```

---

## SCREENS — BUILD THESE (in priority order)

### PRIORITY 1: Foundation (build first)

#### Login Page (`/login`)
- Supabase email/password auth
- Simple centered form: email, password, "Sign In"
- On success, redirect based on role: rep → `/rep`, owner/gm → `/manager`
- No forgot password, no sign-up (accounts created by admin)

#### App Shell (wrapper around all authenticated routes)
- Dark sidebar (left, collapsible on mobile)
- Navigation items change based on role:
  - Rep sees: Today, My Contacts, Log Activity, My Pipeline
  - Owner/GM sees: Command Center, All Contacts, All Deals, Rep Activity, Alerts
- Header: current user name + location + sign out
- No clutter. No notifications bell. No avatar dropdown with 12 options.

---

### PRIORITY 2: Rep Views

#### Rep Dashboard — `/rep` (Primary job: "What do I do today?")

Three sections only:
1. **Overdue visits** — Contacts where `next_visit_due_at < now()`. Show name, company, category, days overdue. Click to contact detail. Red badge if >7 days.
2. **Due today** — Contacts where `next_visit_due_at = today`. Same format.
3. **Recent activity** — My last 10 activities. Name, type, when. Confirms what I logged.

Floating action button (bottom right): "+ Log Activity" — opens ActivityForm modal.

No charts. No stats. No welcome banner. Just the work.

---

#### My Contacts — `/rep/contacts` (Primary job: "Who are my people and where do I stand?")

- Full list of contacts assigned to this rep
- Sortable by: Next Visit Due (default), Last Contacted, Priority, Name
- Filter chips: All | Overdue | Due This Week | High Priority
- Each row: Name, Company, Category badge, Last contacted (relative), Next due (with overdue highlight), "Log Visit" button
- Search bar at top (searches name, company)
- Click row → Contact Detail
- "+ New Contact" button in header

No pagination if < 200 contacts. Use virtual scroll only if > 200.

---

#### Contact Detail — `/rep/contacts/:id` (Primary job: "Everything about this person + what's next")

Two columns (stack on mobile):

**Left column:**
- Name, Company, Category badge, Priority badge
- Phone (tap to call on mobile), Email, Address
- Assigned rep, Location/market
- "Last contacted: X days ago" | "Next visit due: [date]"
- Visit frequency setting (dropdown: weekly / biweekly / monthly / quarterly)
- Notes field (editable, auto-save)
- Edit Contact button

**Right column:**
- **Next Step** — Single text field at top. "What's the next action for this contact?" Auto-saved. Always visible. Never empty if you can help it.
- **Activity Log** — Chronological feed. Each entry: type icon, date, rep name, outcome, notes. Newest first.
- "+ Log Activity" button at top of feed

---

#### Log Activity Modal (used everywhere) (Primary job: "Log it fast, get back to work")

Fields (all required unless noted):
- Contact search/select (pre-filled if launched from contact detail)
- Activity type: Visit / Call / Email / Note (button group, not dropdown)
- Outcome: Left info / Spoke with them / Set appointment / Got referral / Not interested (context-sensitive)
- Notes (optional, 2-line textarea)
- Follow-up date (date picker, defaults to contact's visit frequency from today)
- Follow-up action (short text — "Call back", "Drop by again", etc.)

Submit button: "Log It" — saves to `activities` table, updates `last_contacted_at` and `next_visit_due_at` on contact. Close modal. Done.

No more than 6 fields total. The rep should be able to log in under 30 seconds.

---

#### Rep Pipeline — `/rep/pipeline` (Primary job: "What jobs am I tracking?")

- Kanban board OR simple list (list preferred for mobile)
- Columns/stages: Emergency Call → Assessment → Estimate → Approved → Job Start → Completion → Invoiced → Paid
- Each card: Contact name, Damage type badge, Deal value (if known), Days in current stage
- Click → Deal detail slide-out (edit stage, add notes, log update)
- "+ New Deal" button
- Filter: All | Active (excludes Paid/Lost) | Needs Attention (>7 days in same stage)

---

### PRIORITY 3: Manager Views (Mark + GMs)

#### Command Center — `/manager` (Primary job: "What's happening across all 5 markets right now?")

Top row — 5 location cards, one per market:
- Location name
- Active contacts count
- Activities logged today
- Deals in active pipeline
- Overdue contacts count (red if > 0)

Below — Activity feed (all locations):
- Last 25 activities across all reps
- Rep name, location, contact name, activity type, when
- Auto-refreshes every 60 seconds

Bottom — Alerts strip:
- Reps with zero activity in last 3 days (list their names + location)
- Contacts with visit overdue > 14 days (count by location)

No charts. If Mark wants charts later, he can ask. For now: text, numbers, facts.

---

#### All Contacts — `/manager/contacts` (Primary job: "Browse and inspect every contact in the system")

- Full contact table, all locations
- Columns: Name, Company, Category, Market, Rep, Last Contacted, Next Due, Priority
- Filter bar: Location | Category | Rep | Priority | Status (Overdue / Current / New)
- Search by name or company
- Click row → Contact Detail (same view as rep, but read-only for contacts not in Mark's market)
- Export to CSV button (Mark specifically asked for this kind of visibility)

---

#### All Deals — `/manager/deals` (Primary job: "What's the pipeline worth and where is everything stuck?")

- Pipeline summary at top: total deal value by stage, total active, total closed/won this month
- Table below: All deals, sortable by value, stage, rep, market, days in stage
- Filter: Location | Rep | Stage | Damage Type
- Highlight: deals stuck in same stage > 14 days (amber), > 30 days (red)

---

#### Rep Activity — `/manager/rep-activity` (Primary job: "Who's working and who isn't?")

- Table: one row per rep
- Columns: Rep Name, Location, Activities (Today | This Week | This Month), Contacts Touched This Week, Overdue Tasks, Last Active
- Sort by: Activities This Week (default)
- Click rep row → expanded view with their last 10 activities and overdue contacts
- This is the accountability screen. Make it obvious when someone is inactive.

---

#### Alerts — `/manager/alerts` (Primary job: "What needs my attention right now?")

Three alert buckets:
1. **Inactive Reps** — No activity logged in 3+ days. Name, location, last active date.
2. **Overdue Contacts** — Contacts past their visit date, grouped by rep. Count and list.
3. **Stale Deals** — Deals that haven't moved stages in 14+ days. Deal name, rep, days stuck, current stage.

Each alert item has a "View" link. No dismiss or snooze for now — Mark wants to see everything.

---

## DESIGN SYSTEM

**Color palette (dark theme — this is a field ops tool, not a consumer app):**
- Background: `#0f1117` (near black)
- Surface: `#1a1d27` (cards, panels)
- Border: `#2d3148` (subtle)
- Text primary: `#f1f5f9` (near white)
- Text secondary: `#94a3b8` (slate-400)
- Accent: `#f97316` (SERVPRO orange — use for CTAs, highlights)
- Success: `#22c55e` (green-500)
- Warning: `#f59e0b` (amber-500)
- Danger: `#ef4444` (red-500)

**Typography:**
- Font: System font stack (no Google Fonts — keep it fast)
- Headings: font-semibold, slate-100
- Labels: text-xs uppercase tracking-wide, slate-400
- Body: text-sm, slate-300

**Components to build (keep them minimal):**
- `Button` — variants: primary (orange), secondary (slate), ghost, danger
- `Badge` — for categories, priorities, stages. Color-coded.
- `Card` — simple container with surface bg + border
- `Input`, `Select`, `Textarea` — dark-themed, slate border
- `Modal` — Radix Dialog. Dark overlay. Centered.
- `Tabs` — Radix Tabs. Underline style, not boxed.
- `Table` — stripped rows, hover highlight, sortable headers
- `EmptyState` — For when lists are empty. Icon + message + CTA.
- `LoadingSpinner` — Simple. Used everywhere data is loading.
- `ErrorBoundary` — Catches render errors. Shows friendly message.

---

## DATA HOOKS PATTERN

Use TanStack Query for all Supabase reads. Follow this pattern:

```typescript
// /src/hooks/useContacts.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useMyContacts() {
  return useQuery({
    queryKey: ['contacts', 'mine'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*, category:coi_categories(*)')
        .eq('is_active', true)
        .order('next_visit_due_at', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data
    },
  })
}

export function useLogActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: ActivityInsert) => {
      const { data, error } = await supabase.from('activities').insert(payload).select().single()
      if (error) throw error
      // Also update contact's last_contacted_at and next_visit_due_at
      await supabase.from('contacts').update({
        last_contacted_at: new Date().toISOString(),
        next_visit_due_at: payload.follow_up_date,
      }).eq('id', payload.contact_id)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      qc.invalidateQueries({ queryKey: ['activities'] })
    },
  })
}
```

---

## AUTH PATTERN

```typescript
// /src/lib/auth.tsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

// On mount: supabase.auth.getSession() → if session, fetch profile from profiles table
// Subscribe to supabase.auth.onAuthStateChange for session changes
// Expose profile.role and profile.location_id throughout the app
```

Role-based routing in App.tsx:
- `/login` — public
- `/rep/*` — role === 'rep' only (redirect owner/gm to /manager)
- `/manager/*` — role === 'owner' or 'gm' only (redirect reps to /rep)
- `/` — redirect to role-appropriate dashboard

---

## ACCEPTANCE CRITERIA — THE APP IS "DONE" WHEN:

### Rep flow
- [ ] A rep can log in and land on their dashboard immediately
- [ ] Dashboard shows contacts overdue and due today without any extra clicks
- [ ] Rep can log an activity in < 30 seconds from the dashboard (no page navigation required)
- [ ] Logging an activity updates the contact's last_contacted_at and next_visit_due_at
- [ ] Every contact always has a visible "next step" — blank state prompts rep to fill it
- [ ] Rep can add a new contact with required fields in < 60 seconds
- [ ] Contact detail shows full activity history in reverse chronological order

### Manager flow
- [ ] Mark can see all 5 markets on one screen with key stats per market
- [ ] Mark can identify inactive reps (no activity in 3+ days) without clicking anything
- [ ] Mark can see total pipeline value and deals stuck by stage
- [ ] Alerts page shows only things that need attention — nothing else
- [ ] Rep Activity table is sorted by least active first so problems surface immediately

### Technical
- [ ] `npm run dev` starts the app without errors (assumes .env is configured)
- [ ] `npm run build` produces a clean production build
- [ ] No TypeScript errors (`tsc --noEmit` passes)
- [ ] All Supabase queries respect RLS (reps cannot see other reps' contacts)
- [ ] App works on mobile viewport (375px min-width) — reps use this in the field
- [ ] Loading states are handled — no blank flashes
- [ ] Error states are handled — if Supabase is unreachable, show a friendly message

---

## WHAT TO RESEARCH (if you need examples or patterns)

For HubSpot CRM-style UI patterns:
- Search GitHub: `site:github.com "supabase" "react" "crm" "tailwind"`
- Reference: https://ui.shadcn.com (for component structure patterns — do NOT install shadcn, use Radix directly)
- Reference: https://github.com/vercel/nextjs-subscription-payments (auth + Supabase patterns)
- Reference: https://github.com/supabase/supabase/tree/master/examples (official Supabase examples)

For Tailwind v4 specifics (it changed significantly from v3):
- https://tailwindcss.com/docs/v4-beta
- v4 uses `@import "tailwindcss"` in CSS, not a config file with purge settings
- v4 uses CSS variables natively — `--color-orange-500` etc.

For React Router v7:
- https://reactrouter.com/start/framework/routing
- Uses `createBrowserRouter` and `RouterProvider`

For TanStack Query v5:
- https://tanstack.com/query/latest/docs/framework/react/quick-start
- `useQuery`, `useMutation`, `useQueryClient` — same API but some v5 breaking changes from v4

---

## THINGS TO NEVER DO

- Do NOT add authentication providers (Google, GitHub, etc.) — email/password only
- Do NOT build a settings page unless explicitly in this brief
- Do NOT add charts or graphs — numbers and tables only
- Do NOT add pagination unless a list genuinely has > 200 items
- Do NOT use `any` type in TypeScript unless absolutely unavoidable
- Do NOT install new npm packages without exhausting existing options first
- Do NOT change the database schema — work around it if needed
- Do NOT add skeleton loaders with complex animations — a simple spinner is fine
- Do NOT build a mobile app — responsive web is sufficient
- Do NOT add toast notifications for every action — only for errors and critical success states

---

## HOW TO RUN THIS PROJECT

```bash
# 1. Install deps (already done, but run if needed)
npm install

# 2. Copy env and fill in real values
cp .env.example .env
# Edit .env with real Supabase URL and anon key

# 3. Set up the database (if not done)
# Go to Supabase dashboard → SQL Editor → paste contents of supabase/migrations/001_initial_schema.sql

# 4. Start dev server
npm run dev

# 5. Build for production
npm run build
```

---

## COMPLETION SEQUENCE

Build in this exact order to avoid dead-ends:

1. `/src/types/index.ts` — types first, everything depends on them
2. `/src/lib/supabase.ts` — DB client
3. `/src/lib/auth.tsx` — auth context
4. `/src/main.tsx` + `/src/App.tsx` — entry point + routing skeleton
5. `/src/components/ui/` — Button, Badge, Card, Input, Modal, Table, EmptyState, LoadingSpinner
6. `/src/components/layout/` — AppShell, Sidebar, Header
7. `/src/hooks/` — all data hooks
8. Rep pages (Dashboard → Contacts → Contact Detail → Log Activity → Pipeline)
9. Manager pages (Command Center → All Contacts → All Deals → Rep Activity → Alerts)
10. Final pass: mobile responsiveness, loading/error states, TypeScript check

After each major page is built: run the app, verify it renders, verify Supabase queries return data (or gracefully handle empty state). Do not build the next page until the current one works.

---

## FINAL CHECK BEFORE CALLING DONE

Run through this list before reporting completion:

- [ ] `tsc --noEmit` — zero errors
- [ ] `npm run build` — succeeds
- [ ] Login page works and redirects correctly by role
- [ ] Rep dashboard shows real data from Supabase (or a clear empty state)
- [ ] Activity log form submits and updates the contact record
- [ ] Manager dashboard shows data from all locations
- [ ] Alerts page shows inactive reps and overdue contacts
- [ ] App is usable on a 375px mobile screen (rep use case)
- [ ] No console errors in production build

---

*Project owner: Mark Hart — mhart70@gmail.com*
*Five SERVPRO franchises: Amarillo, Abilene, San Angelo, Victoria, Sugar Land, TX*
*Core principle: Does this reduce stress? Does it move toward freedom? Is the ROI high? If not — cut it.*
