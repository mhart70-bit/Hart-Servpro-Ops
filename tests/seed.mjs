// Seeds the LOCAL Supabase stack with deterministic test data for e2e tests.
// Never run against production: refuses unless the URL is 127.0.0.1.
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const serviceKey = process.env.SERVICE_ROLE_KEY
if (!url.includes('127.0.0.1')) throw new Error(`Refusing to seed non-local URL: ${url}`)
if (!serviceKey) throw new Error('SERVICE_ROLE_KEY env var required')

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

const ORG = '00000000-0000-0000-0000-000000000001'
const LOC_AMARILLO = '10000000-0000-0000-0000-000000000001'
const LOC_ABILENE = '10000000-0000-0000-0000-000000000002'

const USERS = [
  { email: 'owner@test.local', role: 'owner', name: 'Olive Owner', location: null },
  { email: 'gm@test.local', role: 'gm', name: 'Greg Manager', location: LOC_AMARILLO },
  { email: 'rep1@test.local', role: 'rep', name: 'Rita Rep', location: LOC_AMARILLO },
  { email: 'rep2@test.local', role: 'rep', name: 'Ray Otherrep', location: LOC_ABILENE },
]
export const PASSWORD = 'TestPass123!'

const ids = {}
for (const u of USERS) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: u.name, role: u.role },
  })
  let userId = data?.user?.id
  if (error) {
    if (!String(error.message).includes('already been registered')) throw error
    const { data: list } = await admin.auth.admin.listUsers()
    userId = list.users.find(x => x.email === u.email)?.id
  }
  ids[u.email] = userId
  const { error: pErr } = await admin.from('profiles').update({
    role: u.role, full_name: u.name, location_id: u.location, org_id: ORG,
  }).eq('id', userId)
  if (pErr) throw pErr
}

const { data: cats } = await admin.from('coi_categories').select('id, name')
const catId = name => cats.find(c => c.name === name)?.id ?? null

const day = ms => new Date(Date.now() + ms * 86400000).toISOString()

// Wipe prior test contacts/activities/deals for idempotency
await admin.from('activities').delete().eq('org_id', ORG)
await admin.from('deals').delete().eq('org_id', ORG)
await admin.from('contacts').delete().eq('org_id', ORG)

const CONTACTS = [
  // Rita's book (Amarillo)
  { first_name: 'Sarah', last_name: 'Chen', company: 'Westside Property Mgmt', city: 'Amarillo', phone: '806-555-0101', category_id: catId('Property Manager'), assigned_rep_id: ids['rep1@test.local'], location_id: LOC_AMARILLO, next_visit_due_at: day(-10), last_contacted_at: day(-40), priority: 'high', visit_frequency_days: 30 },
  { first_name: 'Bob', last_name: 'Ivers', company: 'Ivers Insurance', city: 'Amarillo', phone: '806-555-0102', category_id: catId('Insurance Agent'), assigned_rep_id: ids['rep1@test.local'], location_id: LOC_AMARILLO, next_visit_due_at: day(0), last_contacted_at: day(-14), priority: 'medium', visit_frequency_days: 14 },
  { first_name: 'Carla', last_name: 'Dunn', company: 'Dunn Realty', city: 'Amarillo', phone: '806-555-0103', category_id: catId('Real Estate Agent'), assigned_rep_id: ids['rep1@test.local'], location_id: LOC_AMARILLO, next_visit_due_at: day(20), last_contacted_at: day(-3), priority: 'low', visit_frequency_days: 14, notes: 'Prefers morning visits' },
  // Ray's book (Abilene) — must be invisible to Rita
  { first_name: 'Frank', last_name: 'Zappa', company: 'Abilene Hotels LLC', city: 'Abilene', phone: '325-555-0104', category_id: catId('Hotel / Hospitality'), assigned_rep_id: ids['rep2@test.local'], location_id: LOC_ABILENE, next_visit_due_at: day(-2), last_contacted_at: day(-30), priority: 'medium', visit_frequency_days: 30 },
]
for (const c of CONTACTS) {
  const { error } = await admin.from('contacts').insert({ ...c, org_id: ORG, state: 'TX', is_active: true, erp_status: 'not_introduced', tags: [] })
  if (error) throw error
}

const { data: sarah } = await admin.from('contacts').select('id').eq('last_name', 'Chen').single()

// One historical activity + one open deal for Sarah
await admin.from('activities').insert({
  org_id: ORG, contact_id: sarah.id, rep_id: ids['rep1@test.local'], location_id: LOC_AMARILLO,
  type: 'visit', notes: 'Initial introduction, went well.', occurred_at: day(-40), flagged: false, confidence_score: 1.0,
})
await admin.from('deals').insert({
  org_id: ORG, contact_id: sarah.id, rep_id: ids['rep1@test.local'], location_id: LOC_AMARILLO,
  title: 'Water — Sarah Chen', stage: 'assessment', deal_value: 12400, damage_type: 'water',
})

console.log('Seed complete:', Object.keys(ids).join(', '))
