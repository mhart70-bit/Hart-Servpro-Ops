import { type Page, expect } from '@playwright/test'

export const PASSWORD = 'TestPass123!'
export const USERS = {
  owner: 'owner@test.local',
  gm: 'gm@test.local',
  rep1: 'rep1@test.local',
  rep2: 'rep2@test.local',
}

export async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').or(page.locator('input[type="email"]')).first().fill(email)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
}

// A canned ParsedNote the mocked parse-note endpoint returns
export const PARSED_NOTE = {
  contact_name: 'Sarah Chen',
  company: 'Westside Property Mgmt',
  activity_type: 'visit',
  outcome_type: null,
  outcome: 'Interested',
  notes: 'Met with Sarah about basement water loss. Sending estimate.',
  follow_up_date: '2026-07-23',
  follow_up_action: 'Send mitigation estimate',
  deal_value: 12400,
  damage_type: 'water',
  urgency: 'high',
  confidence_score: 0.95,
}

export async function mockParseNote(page: Page, body: object = PARSED_NOTE, status = 200) {
  await page.route('**/functions/v1/parse-note', route =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  )
}
