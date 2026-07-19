import { test, expect } from '@playwright/test'
import { login, USERS } from './helpers'
import type { Page } from '@playwright/test'

const tour = (page: Page) => page.locator('[data-tour-overlay]')

test.describe('Learn Hart Sales OS — interactive tour', () => {
  test('first-visit banner offers the tour and starts it', async ({ page }) => {
    await login(page, USERS.rep1) // fresh context → localStorage empty
    await expect(page.getByText(/Learn Hart Sales OS/).first()).toBeVisible()
    await page.getByRole('button', { name: 'Start tour' }).click()
    await expect(page.getByText('Welcome to Hart Sales OS')).toBeVisible()
  })

  test('"No thanks" dismisses the banner and persists across reloads', async ({ page }) => {
    await login(page, USERS.rep1)
    await page.getByRole('button', { name: 'No thanks' }).click()
    await expect(page.getByRole('button', { name: 'Start tour' })).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Start tour' })).toHaveCount(0)
  })

  test('rep tour walks the four questions and anchors to real UI', async ({ page }) => {
    await login(page, USERS.rep1)
    await page.getByRole('button', { name: 'Start tour' }).click()

    // Step 1: welcome
    await expect(page.getByText('Welcome to Hart Sales OS')).toBeVisible()
    await tour(page).getByRole('button', { name: 'Next', exact: true }).click()

    // Step 2: anchored to the dashboard hit list
    await expect(page.getByText('1 · Who do I need to see?')).toBeVisible()
    await tour(page).getByRole('button', { name: 'Next', exact: true }).click()

    // Step 3: route
    await expect(page.getByText('Plan the drive')).toBeVisible()
    await tour(page).getByRole('button', { name: 'Next', exact: true }).click()

    // Step 4: quick log FAB
    await expect(page.getByText('2 · What happened? Log it fast')).toBeVisible()
    await tour(page).getByRole('button', { name: 'Next', exact: true }).click()

    // Step 5 navigates to /log
    await expect(page).toHaveURL(/\/log/)
    await expect(page.getByText('Or just talk')).toBeVisible()

    // Back returns a step
    await tour(page).getByRole('button', { name: 'Back' }).click()
    await expect(page.getByText('2 · What happened? Log it fast')).toBeVisible()
    await tour(page).getByRole('button', { name: 'Next', exact: true }).click()
    await tour(page).getByRole('button', { name: 'Next', exact: true }).click()

    // Contacts steps
    await expect(page).toHaveURL(/\/contacts/)
    await expect(page.getByText('3 · Your book of contacts')).toBeVisible()
    await tour(page).getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText(/4 · What’s next/)).toBeVisible()
    await tour(page).getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText('Track the jobs')).toBeVisible()
    await tour(page).getByRole('button', { name: 'Next', exact: true }).click()

    // Final step ends with Done
    await expect(page.getByText('That’s the whole system')).toBeVisible()
    await tour(page).getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.getByText('That’s the whole system')).toHaveCount(0)
  })

  test('skip button exits immediately and marks the tour done', async ({ page }) => {
    await login(page, USERS.rep1)
    await page.getByRole('button', { name: 'Start tour' }).click()
    await expect(page.getByText('Welcome to Hart Sales OS')).toBeVisible()
    await tour(page).getByRole("button", { name: "Skip tour" }).last().click()
    await expect(page.getByText('Welcome to Hart Sales OS')).toHaveCount(0)
    const done = await page.evaluate(() => localStorage.getItem('hart-tour-done'))
    expect(done).toBe('1')
  })

  test('tour can be relaunched from Quick Guide', async ({ page }) => {
    await login(page, USERS.rep1)
    await page.getByRole('button', { name: 'No thanks' }).click() // banner gone
    await page.getByRole('link', { name: 'Quick Guide' }).click()
    await page.getByRole('button', { name: /Learn Hart Sales OS — interactive tour/ }).click()
    await expect(page.getByText('Welcome to Hart Sales OS')).toBeVisible()
  })

  test('manager gets the manager tour', async ({ page }) => {
    await login(page, USERS.owner)
    await page.getByRole('link', { name: 'Quick Guide' }).click()
    await page.getByRole('button', { name: /Learn Hart Sales OS — interactive tour/ }).click()
    await expect(page.getByText('This is your command center', { exact: false })).toBeVisible()
    await tour(page).getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText('All five markets at a glance')).toBeVisible()
    await tour(page).getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText('Who’s slipping?')).toBeVisible()
    // Skip out cleanly
    await tour(page).getByRole("button", { name: "Skip tour" }).last().click()
    await expect(page.getByText('Who’s slipping?')).toHaveCount(0)
  })
})
