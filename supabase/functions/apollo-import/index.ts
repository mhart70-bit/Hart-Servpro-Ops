// apollo-import — owner-only. Takes selected Apollo results + a market, enriches
// each with Google Places (address, coords, phone — no Apollo credits), dedupes
// against the existing book, and inserts into contacts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ORG = '00000000-0000-0000-0000-000000000001'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function categoryName(title: string): string {
  const t = (title || '').toLowerCase()
  if (t.includes('insurance') || t.includes('agent')) return 'Insurance Agent'
  if (t.includes('adjuster')) return 'Insurance Adjuster'
  if (t.includes('hoa') || t.includes('community')) return 'HOA Manager'
  if (t.includes('property') || t.includes('portfolio') || t.includes('leasing')) return 'Property Manager'
  if (t.includes('real estate') || t.includes('realtor')) return 'Real Estate Agent'
  if (t.includes('facilit')) return 'Facility Manager'
  if (t.includes('hotel') || t.includes('hospitality') || t.includes('general manager')) return 'Hotel / Hospitality'
  if (t.includes('plumb') || t.includes('contractor') || t.includes('restoration')) return 'Plumber / Contractor'
  return 'Other Referral Partner'
}
const FREQ: Record<string, number> = {
  'Insurance Agent': 14, 'Insurance Adjuster': 30, 'HOA Manager': 90, 'Property Manager': 30,
  'Real Estate Agent': 14, 'Facility Manager': 30, 'Hotel / Hospitality': 30, 'Plumber / Contractor': 30,
  'Other Referral Partner': 30,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

  if (!GOOGLE_MAPS_API_KEY) return json({ error: 'Maps not configured.' }, 500)

  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not authenticated.' }, 401)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'owner') return json({ error: 'Owner only.' }, 403)

  let body: { market?: string; selections?: { first_name: string | null; title: string; company: string }[] }
  try { body = await req.json() } catch { return json({ error: 'Bad request.' }, 400) }
  const market = (body.market ?? '').trim()
  const selections = body.selections ?? []
  if (!market || selections.length === 0) return json({ error: 'Nothing to import.' }, 400)

  // Resolve market + category IDs
  const { data: loc } = await admin.from('locations').select('id').eq('name', market).single()
  if (!loc) return json({ error: `Unknown market: ${market}` }, 400)
  const { data: cats } = await admin.from('coi_categories').select('id, name')
  const catId = (name: string) => cats?.find(c => c.name === name)?.id ?? null

  // Existing companies in this market (dedupe)
  const { data: existing } = await admin.from('contacts').select('company').eq('location_id', loc.id).eq('is_active', true)
  const have = new Set((existing ?? []).map(c => (c.company ?? '').toLowerCase().trim()).filter(Boolean))

  let imported = 0, skipped = 0, failed = 0
  const marketCity = market // Places query city

  for (const s of selections) {
    const company = (s.company ?? '').trim()
    if (!company) { failed++; continue }
    if (have.has(company.toLowerCase())) { skipped++; continue }
    have.add(company.toLowerCase())

    // Google Places enrichment
    let address: string | null = null, lat: number | null = null, lng: number | null = null, phone: string | null = null
    try {
      const pr = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'places.formattedAddress,places.location,places.nationalPhoneNumber',
        },
        body: JSON.stringify({ textQuery: `${company} ${marketCity} TX` }),
      })
      const pd = await pr.json()
      const place = pd.places?.[0]
      if (place) {
        address = place.formattedAddress ?? null
        lat = place.location?.latitude ?? null
        lng = place.location?.longitude ?? null
        phone = place.nationalPhoneNumber ?? null
      }
    } catch { /* enrichment optional */ }

    const cat = categoryName(s.title)
    const freq = FREQ[cat] ?? 30
    const next = new Date(); next.setDate(next.getDate() + freq)

    const { error } = await admin.from('contacts').insert({
      org_id: ORG,
      location_id: loc.id,
      category_id: catId(cat),
      first_name: s.first_name || null,
      company,
      phone,
      address,
      city: marketCity,
      state: 'TX',
      lat, lng,
      visit_frequency_days: freq,
      next_visit_due_at: next.toISOString(),
      priority: 'medium',
      erp_status: 'not_introduced',
      is_active: true,
      tags: ['apollo-import'],
      notes: `Added via Apollo search (${s.title})`,
    })
    if (error) failed++
    else imported++
  }

  return json({ imported, skipped, failed })
})
