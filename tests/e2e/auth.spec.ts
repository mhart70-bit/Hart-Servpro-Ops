import { test, expect } from '@playwright/test'
import { login, USERS, PASSWORD } from './helpers'

test.describe('Authentication & roles', () => {
  test('invalid credentials show an error, not a redirect', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('nobody@test.local')
    await page.locator('input[type="password"]').fill('WrongPass1!')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText(/Invalid email or password/i)).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated visit to a private route redirects to login', async ({ page }) => {
    await page.goto('/contacts')
    await expect(page).toHaveURL(/\/login/)
  })

  test('rep sees rep nav, not admin nav', async ({ page }) => {
    await login(page, USERS.rep1)
    await expect(page.getByRole('link', { name: 'My Contacts' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'My Pipeline' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Team' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Rep Activity' })).toHaveCount(0)
  })

  test('owner sees admin nav', async ({ page }) => {
    await login(page, USERS.owner)
    await expect(page.getByRole('link', { name: 'Command Center' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Alerts' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Team' })).toBeVisible()
  })

  test('rep navigating directly to a manager page is turned away', async ({ page }) => {
    await login(page, USERS.rep1)
    await page.goto('/team')
    // Team.tsx guards with <Navigate>; the rep must not see roster management UI
    await expect(page.getByText(/Invite/i)).toHaveCount(0)
  })
})

test.describe('Password reset page', () => {
  test('rejects short and mismatched passwords', async ({ page }) => {
    await login(page, USERS.rep1)
    await page.getByRole('button', { name: /Change password/i }).click()
    await expect(page).toHaveURL(/\/reset-password/)
    const inputs = page.locator('input[type="password"]')
    await inputs.nth(0).fill('short')
    await inputs.nth(1).fill('short')
    await page.getByRole('button', { name: /Update password/i }).click()
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible()
    await inputs.nth(0).fill('LongEnough123!')
    await inputs.nth(1).fill('Different123!')
    await page.getByRole('button', { name: /Update password/i }).click()
    await expect(page.getByText(/do not match/i)).toBeVisible()
  })
})
