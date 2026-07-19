// plan-day — generates a rep's (or owner's) AI morning briefing.
// JWT-gated: identifies the caller, reads their market's book with the service
// role (so market-level contacts show even before per-rep assignment), asks
// Claude to write a short, specific briefing, caches one per user per day.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM = `You write the morning field briefing for a SERVPRO sales rep (or the owner) at Hart SERVPRO, five Texas franchises (Amarillo, Abilene, San Angelo, Victoria, Sugar Land).

Reps build referral relationships with Centers of Influence (COIs): insurance agents, property managers, HOA/community managers, facility managers, hotels, healthcare facilities, and government/municipal accounts.

Write a briefing that is warm, specific, and immediately actionable — the rep should be able to start their day from it. Use real contact and company names from the data. Group nearby or same-category targets so they work efficiently, not zig-zag. Lead with anything overdue. Keep it tight: a short greeting, 2-4 concrete moves, and one clear first action. Plain text, no markdown headers. Under 220 words.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

  if (!ANTHROPIC_API_KEY) return json({ error: 'Server not configured.' }, 500)

  // Identify the caller from their JWT
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: uErr } = await userClient.auth.getUser()
  if (uErr || !user) return json({ error: 'Not authenticated.' }, 401)

  let force = false
  try { force = (await req.json())?.refresh === true } catch { /* no body */ }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  const { data: profile } = await admin
    .from('profiles').select('id, org_id, location_id, role, full_name, location:locations(name)')
    .eq('id', user.id).single()
  if (!profile) return json({ error: 'No profile.' }, 404)

  // Texas-local date + weekday (so the briefing never names the wrong day)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long' }).format(new Date())

  // Serve cached briefing unless a refresh was requested
  if (!force) {
    const { data: cached } = await admin
      .from('daily_briefings').select('content')
      .eq('user_id', user.id).eq('briefing_date', today).maybeSingle()
    if (cached) return json({ content: cached.content, cached: true })
  }

  const isManager = profile.role === 'owner' || profile.role === 'gm'
  const nowIso = new Date().toISOString()

  // Build the data context Claude will write from
  let context = ''
  const firstName = (profile.full_name ?? '').split(' ')[0] || 'there'

  if (isManager && profile.role === 'owner') {
    // Owner: per-market rollup
    const { data: contacts } = await admin
      .from('contacts')
      .select('location:locations(name), category:coi_categories(name), next_visit_due_at')
      .eq('is_active', true)
    const markets: Record<string, { total: number; overdue: number; cats: Record<string, number> }> = {}
    for (const c of contacts ?? []) {
      const m = (c.location as { name?: string } | null)?.name ?? 'Unassigned'
      markets[m] ??= { total: 0, overdue: 0, cats: {} }
      markets[m].total++
      if (c.next_visit_due_at && c.next_visit_due_at < nowIso) markets[m].overdue++
      const cat = (c.category as { name?: string } | null)?.name ?? 'Other'
      markets[m].cats[cat] = (markets[m].cats[cat] ?? 0) + 1
    }
    context = `You are writing the OWNER digest for ${firstName} (Mark). Markets:\n` +
      Object.entries(markets).map(([m, v]) =>
        `- ${m}: ${v.total} contacts, ${v.overdue} overdue; top types: ${Object.entries(v.cats).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,n])=>`${k} ${n}`).join(', ')}`
      ).join('\n') +
      `\nGive a 60-second read on the business and where attention is needed.`
  } else {
    // Rep (or GM): their market's book
    const loc = profile.location_id
    const { data: contacts } = await admin
      .from('contacts')
      .select('first_name, last_name, company, phone, next_visit_due_at, category:coi_categories(name)')
      .eq('is_active', true)
      .eq(loc ? 'location_id' : 'org_id', loc ?? profile.org_id)
      .order('next_visit_due_at', { ascending: true, nullsFirst: false })
      .limit(60)
    const marketName = (profile.location as { name?: string } | null)?.name ?? 'your market'
    const overdue = (contacts ?? []).filter(c => c.next_visit_due_at && c.next_visit_due_at < nowIso)
    const fmt = (c: { first_name?: string|null; last_name?: string|null; company?: string|null; phone?: string|null; category?: { name?: string }|null }) =>
      `${[c.first_name, c.last_name].filter(Boolean).join(' ') || (c.company ?? 'Unnamed')}` +
      `${c.company && (c.first_name||c.last_name) ? ` (${c.company})` : ''} — ${(c.category as {name?:string}|null)?.name ?? 'COI'}${c.phone ? `, ${c.phone}` : ', no phone yet'}`
    context = `You are writing the briefing for ${firstName}, the ${marketName} rep. ` +
      `They have ${(contacts ?? []).length} relationships to build.\n` +
      (overdue.length ? `OVERDUE (${overdue.length}): ${overdue.slice(0,8).map(fmt).join('; ')}\n` : `Nothing overdue yet — this is their book to work.\n`) +
      `Book sample:\n${(contacts ?? []).slice(0, 25).map(fmt).join('\n')}`
  }

  // Ask Claude
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Today is ${weekday}, ${today}.\n\n${context}` }],
    }),
  })
  if (!resp.ok) {
    const t = await resp.text()
    return json({ error: `Briefing model error ${resp.status}`, detail: t.slice(0, 200) }, 502)
  }
  const data = await resp.json()
  const content = (data.content?.[0]?.text ?? '').trim()
  if (!content) return json({ error: 'Empty briefing.' }, 502)

  // Cache (one per user per day)
  await admin.from('daily_briefings').upsert(
    { org_id: profile.org_id, user_id: user.id, briefing_date: today, content },
    { onConflict: 'user_id,briefing_date' },
  )

  return json({ content, cached: false })
})
