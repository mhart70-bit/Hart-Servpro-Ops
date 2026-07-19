import { test, expect } from '@playwright/test'
import { login, USERS } from './helpers'

// Runs in the "mobile" project (iPhone SE, 375px) — the rep-in-the-field case
test.describe('Mobile viewport', () => {
  test('rep can log in, open the menu, and reach contacts', async ({ page }) => {
    await login(page, USERS.rep1)
    // Sidebar is hidden behind the hamburger in the mobile top bar
    await page.locator('.lg\\:hidden button').first().click()
    await expect(page.getByRole('link', { name: 'My Contacts' })).toBeVisible()
    await page.getByRole('link', { name: 'My Contacts' }).click()
    await expect(page.getByText('Sarah Chen').first()).toBeVisible()
  })

  test('floating quick-log button is reachable and the modal fits', async ({ page }) => {
    await login(page, USERS.rep1)
    await page.locator('button[title="Log Activity"]').click()
    await expect(page.getByText('Quick log')).toBeVisible()
    // The open modal must not force the page wider than the viewport
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    )
    expect(overflow).toBe(false)
  })

  test('no horizontal overflow on the dashboard', async ({ page }) => {
    await login(page, USERS.rep1)
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    )
    expect(overflow).toBe(false)
  })
})
