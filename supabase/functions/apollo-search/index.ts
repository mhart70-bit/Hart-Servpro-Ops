// apollo-search — owner-only. Searches Apollo for COIs by title + market.
// Free (no Apollo credits): returns first name, title, and company only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const APOLLO_API_KEY = Deno.env.get('APOLLO_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

  if (!APOLLO_API_KEY) return json({ error: 'Apollo not configured.' }, 500)

  // Owner-only
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not authenticated.' }, 401)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'owner') return json({ error: 'Owner only.' }, 403)

  let body: { title?: string; apolloLocation?: string; page?: number }
  try { body = await req.json() } catch { return json({ error: 'Bad request.' }, 400) }
  const title = (body.title ?? '').trim()
  const apolloLocation = (body.apolloLocation ?? '').trim()
  if (!title || !apolloLocation) return json({ error: 'Pick a title and a market.' }, 400)

  const resp = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': APOLLO_API_KEY },
    body: JSON.stringify({
      person_titles: [title],
      person_locations: [apolloLocation],
      per_page: 25,
      page: body.page ?? 1,
    }),
  })
  if (!resp.ok) return json({ error: `Apollo error ${resp.status}` }, 502)
  const data = await resp.json()

  // Normalize + dedupe by company (search returns partial data, no credits used)
  const seen = new Set<string>()
  const results: { first_name: string | null; title: string; company: string }[] = []
  for (const p of data.people ?? []) {
    const company = (p.organization?.name ?? '').trim()
    if (!company) continue
    const key = company.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    results.push({
      first_name: p.first_name ?? null,
      title: p.title ?? title,
      company,
    })
  }

  return json({ results, count: results.length })
})
