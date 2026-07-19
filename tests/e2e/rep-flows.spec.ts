import { test, expect } from '@playwright/test'
import { login, USERS, mockParseNote } from './helpers'

test.describe('Rep daily flows', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.rep1)
  })

  test('dashboard shows overdue and due-today contacts', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Overdue' })).toBeVisible()
    await expect(page.getByText('Sarah Chen').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Due today' })).toBeVisible()
    await expect(page.getByText('Bob Ivers').first()).toBeVisible()
  })

  test('dashboard hit-list Log button pre-fills the clicked contact', async ({ page }) => {
    const sarahRow = page.locator('div.group', { hasText: 'Sarah Chen' }).first()
    await sarahRow.hover()
    await sarahRow.getByRole('button', { name: 'Log' }).click()
    // The quick-log modal must already show Sarah Chen — no re-searching
    const modal = page.locator('div.fixed.inset-0.z-50')
    await expect(modal.getByText('Quick log')).toBeVisible()
    await expect(modal.getByText('Sarah Chen')).toBeVisible()
  })

  test('quick log from Contacts updates last-contacted and closes', async ({ page }) => {
    await page.getByRole('link', { name: 'My Contacts' }).click()
    const row = page.locator('div.group', { hasText: 'Carla Dunn' }).first()
    await row.hover()
    await row.getByRole('button', { name: 'Log' }).click()
    const modal = page.locator('div.fixed.inset-0.z-50')
    await expect(modal.getByText('Quick log')).toBeVisible()
    await expect(modal.getByText('Carla Dunn')).toBeVisible()
    await page.getByPlaceholder('What happened?').fill('Dropped by with donuts')
    await page.getByRole('button', { name: 'Log It' }).click()
    await expect(page.getByText('Quick log')).toHaveCount(0)
  })

  test('quick log respects the follow-up date the rep picked', async ({ page }) => {
    await page.getByRole('link', { name: 'My Contacts' }).click()
    const row = page.locator('div.group', { hasText: 'Bob Ivers' }).first()
    await row.hover()
    await row.getByRole('button', { name: 'Log' }).click()
    // Pick a follow-up 3 days out (different from Bob's 14-day frequency).
    // Build the date string from LOCAL parts — toISOString() is UTC and
    // shifts a day during evening hours.
    const d = new Date(); d.setDate(d.getDate() + 3)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    await page.locator('input[type="date"]').fill(iso)
    await page.getByRole('button', { name: 'Log It' }).click()
    await expect(page.getByText('Quick log')).toHaveCount(0)
    // The contact's next visit must reflect the chosen date, not today+frequency
    await page.locator('div.group', { hasText: 'Bob Ivers' }).first()
      .locator('button').first().click()
    const expected = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    await expect(page.getByText(`Next: ${expected}`).first()).toBeVisible()
  })

  test('add a new contact with the slim form', async ({ page }) => {
    await page.getByRole('link', { name: 'My Contacts' }).click()
    await page.getByRole('button', { name: 'Add contact' }).click()
    // Save disabled with no name
    await expect(page.getByRole('button', { name: 'Save contact' })).toBeDisabled()
    await page.locator('.fixed input').first().fill('Nina')
    await page.locator('.fixed input').nth(1).fill('Newman')
    await page.locator('.fixed input').nth(2).fill('Newman Plumbing')
    await page.getByRole('button', { name: 'Save contact' }).click()
    await expect(page.getByText('Nina Newman')).toBeVisible()
  })

  test('contact detail: history, next step autosave', async ({ page }) => {
    await page.getByRole('link', { name: 'My Contacts' }).click()
    await page.getByText('Sarah Chen').first().click()
    await expect(page.getByText('Activity History')).toBeVisible()
    await expect(page.getByText('Initial introduction, went well.')).toBeVisible()
    const nextStep = page.getByPlaceholder("What's the next action for this contact?")
    await nextStep.fill('Bring ERP paperwork Friday')
    await nextStep.blur()
    await page.reload()
    await expect(page.getByPlaceholder("What's the next action for this contact?")).toHaveValue('Bring ERP paperwork Friday')
  })

  test('voice/text log via parse endpoint (mocked) saves and confirms', async ({ page }) => {
    await mockParseNote(page)
    await page.getByRole('link', { name: 'Log Activity' }).click()
    await page.getByRole('button', { name: /Link a contact/ }).click()
    await page.getByPlaceholder('Search…').fill('Chen')
    await page.getByRole('button', { name: /Sarah Chen/ }).click()
    await page.getByPlaceholder(/Type what happened/).fill('Met Sarah, water loss, estimate going out')
    await page.getByRole('button', { name: 'Submit to the Ledger' }).click()
    await expect(page.getByRole('heading', { name: 'Looks right?' })).toBeVisible()
    await expect(page.getByText('Send mitigation estimate')).toBeVisible()
    await page.getByRole('button', { name: /Confirm & save/ }).click()
    await expect(page.getByRole('heading', { name: 'Logged.' })).toBeVisible()
  })

  test('parse failure surfaces an error and keeps the note', async ({ page }) => {
    await mockParseNote(page, { error: 'Claude API error 500' }, 502)
    await page.getByRole('link', { name: 'Log Activity' }).click()
    await page.getByPlaceholder(/Type what happened/).fill('A note that fails to parse')
    await page.getByRole('button', { name: 'Submit to the Ledger' }).click()
    await expect(page.getByText(/error|failed|could not/i).first()).toBeVisible()
    // Note text must not be lost
    await expect(page.getByPlaceholder(/Type what happened/)).toHaveValue('A note that fails to parse')
  })

  test('rep pipeline shows the seeded deal', async ({ page }) => {
    await page.getByRole('link', { name: 'My Pipeline' }).click()
    await expect(page.getByText('Water — Sarah Chen').first()).toBeVisible()
    await expect(page.getByText('$12,400').first()).toBeVisible()
    // The dedupe fix means the voice log earlier must NOT have created a
    // second deal for the same contact
    await expect(page.getByText(/— Sarah Chen/)).toHaveCount(1)
  })

  test('empty search shows friendly empty state', async ({ page }) => {
    await page.getByRole('link', { name: 'My Contacts' }).click()
    await page.getByPlaceholder(/Search name, company/).fill('zzzznothing')
    await expect(page.getByText(/No results for/)).toBeVisible()
  })
})
