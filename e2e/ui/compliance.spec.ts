import { test, expect } from '@playwright/test'
import { TEST_ACCOUNTS, login, visibleText } from './helpers'

test.describe('Compliance Tracker', () => {
  test('staff sees their own compliance record', async ({ page }) => {
    await login(page, { ...TEST_ACCOUNTS.staff, portal: 'staff' })
    await page.goto('/compliance')

    await expect(visibleText(page, TEST_ACCOUNTS.staff.fullName)).toBeVisible()
  })

  test('admin sees the hospital-wide staff directory', async ({ page }) => {
    await login(page, { ...TEST_ACCOUNTS.admin, portal: 'admin' })
    await page.goto('/compliance')

    await expect(visibleText(page, /staff directory/i)).toBeVisible()
    // At least one directory row rendered — proves the real /compliance/tracker fetch resolved,
    // not just that the page shell loaded.
    await expect(visibleText(page, /VMMC-\d{2}-\d{4}/)).toBeVisible()
  })
})
