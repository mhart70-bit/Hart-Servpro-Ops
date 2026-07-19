import { test, expect } from '@playwright/test'
import { login, USERS, PASSWORD } from './helpers'
import { execSync } from 'node:child_process'

function localEnv() {
  const out = execSync('supabase status -o env', { encoding: 'utf8' })
  const get = (k: string) => out.match(new RegExp(`^${k}="?([^"\\n]+)"?$`, 'm'))?.[1]
  return { url: get('API_URL') ?? 'http://127.0.0.1:54321', anon: get('ANON_KEY')! }
}

async function signInRest(url: string, anon: string, email: string) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const body = await res.json()
  return { token: body.access_token as string, userId: body.user?.id as string }
}

test.describe('Data isolation (RLS)', () => {
  test('rep cannot read another rep\'s contacts via the REST API', async () => {
    const { url, anon } = localEnv()
    const { token } = await signInRest(url, anon, USERS.rep1)
    const res = await fetch(`${url}/rest/v1/contacts?select=first_name,last_name,assigned_rep_id`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    })
    const rows = await res.json()
    const names = rows.map((r: { last_name: string }) => r.last_name)
    expect(names).toContain('Chen')
    expect(names).not.toContain('Zappa') // rep2's contact must be invisible
  })

  test('rep cannot see other reps\' contacts in the UI', async ({ page }) => {
    await login(page, USERS.rep1)
    await page.getByRole('link', { name: 'My Contacts' }).click()
    await expect(page.getByText('Sarah Chen').first()).toBeVisible()
    await expect(page.getByText('Frank Zappa')).toHaveCount(0)
  })

  test('SECURITY: rep cannot promote their own role to owner', async () => {
    const { url, anon } = localEnv()
    const { token, userId } = await signInRest(url, anon, USERS.rep1)
    const res = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ role: 'owner' }),
    })
    const body = await res.json().catch(() => [])
    const promoted = Array.isArray(body) && body.some((r: { role: string }) => r.role === 'owner')
    // Either the request errors or the role must remain 'rep'
    expect(promoted, 'a rep must NOT be able to self-promote to owner').toBe(false)

    // Double-check the DB state
    const check = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}&select=role`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    })
    const rows = await check.json()
    expect(rows[0]?.role).toBe('rep')
  })

  test('SECURITY: public signup cannot self-assign the owner role', async () => {
    const { url, anon } = localEnv()
    const email = `intruder-${Date.now()}@test.local`
    const res = await fetch(`${url}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon },
      body: JSON.stringify({
        email,
        password: 'Sneaky123!',
        data: { full_name: 'Evil Owner', role: 'owner' },
      }),
    })
    const body = await res.json()
    if (res.ok && body?.access_token) {
      // Signup allowed (default local config) — the created profile must NOT be owner
      const check = await fetch(`${url}/rest/v1/profiles?id=eq.${body.user.id}&select=role`, {
        headers: { apikey: anon, Authorization: `Bearer ${body.access_token}` },
      })
      const rows = await check.json()
      expect(rows[0]?.role, 'self-signup must never yield owner/gm role').toBe('rep')
    }
  })

  test('rep cannot spoof another rep\'s id on an activity', async () => {
    const { url, anon } = localEnv()
    const rep1 = await signInRest(url, anon, USERS.rep1)
    const rep2 = await signInRest(url, anon, USERS.rep2)
    const res = await fetch(`${url}/rest/v1/activities`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${rep1.token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        org_id: '00000000-0000-0000-0000-000000000001',
        rep_id: rep2.userId, // forging someone else's activity
        type: 'visit',
        notes: 'forged',
        occurred_at: new Date().toISOString(),
      }),
    })
    expect(res.ok, 'inserting an activity as another rep must be rejected').toBe(false)
  })
})
