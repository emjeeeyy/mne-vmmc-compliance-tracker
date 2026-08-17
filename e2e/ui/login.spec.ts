import { test, expect } from '@playwright/test'
import { TEST_ACCOUNTS, login, visibleText } from './helpers'

test.describe('Login', () => {
  test('staff can log in and lands on the dashboard', async ({ page }) => {
    await login(page, { ...TEST_ACCOUNTS.staff, portal: 'staff' })
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('admin can log in via the ADMIN LOGIN tab', async ({ page }) => {
    await login(page, { ...TEST_ACCOUNTS.admin, portal: 'admin' })
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('wrong password shows an error and does not navigate away', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[placeholder="Enter ID number"]:visible').fill(TEST_ACCOUNTS.staff.employeeId)
    await page.locator('input[placeholder="Enter password"]:visible').fill('definitely-wrong')
    await page.locator('button:visible', { hasText: /log in/i }).first().click()

    await expect(page).toHaveURL(/\/login/)
    await expect(visibleText(page, /invalid/i)).toBeVisible()
  })

  test('staff credentials rejected on the admin portal', async ({ page }) => {
    await page.goto('/login')
    await page.locator('button:visible', { hasText: /^ADMIN LOGIN$/i }).first().click()
    await page.locator('input[placeholder="Enter ID number"]:visible').fill(TEST_ACCOUNTS.staff.employeeId)
    await page.locator('input[placeholder="Enter password"]:visible').fill(TEST_ACCOUNTS.staff.password)
    await page.locator('button:visible', { hasText: /log in/i }).first().click()

    await expect(page).toHaveURL(/\/login/)
  })
})
