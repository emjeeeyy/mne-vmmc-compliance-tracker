import { test, expect } from '@playwright/test'
import { TEST_ACCOUNTS, login, visibleText } from './helpers'

test.describe('Compliance Tracker', () => {
  test('staff sees their own compliance record', async ({ page }) => {
    await login(page, { ...TEST_ACCOUNTS.staff, portal: 'staff' })
    await page.goto('/compliance')

    await expect(visibleText(page, TEST_ACCOUNTS.staff.fullName)).toBeVisible()
  })

  test('admin sees the Modules Registry with real rows', async ({ page }) => {
    await login(page, { ...TEST_ACCOUNTS.admin, portal: 'admin' })
    await page.goto('/compliance')

    await expect(visibleText(page, /occupational health screening modules/i)).toBeVisible()
    // At least one registry row rendered — proves the real /registry/ape fetch resolved,
    // not just that the page shell loaded.
    await expect(visibleText(page, /VMMC-\d{2}-\d{4}/)).toBeVisible()
    await page.getByRole('tab', { name: /pre-employment clearances/i }).click()
    await expect(page.getByRole('columnheader', { name: /baseline skin/i })).toBeVisible()
  })

  test('admin Notifications page replaces the old PII Index and lists escalations', async ({ page }) => {
    await login(page, { ...TEST_ACCOUNTS.admin, portal: 'admin' })
    await page.goto('/notifications')

    await expect(visibleText(page, /notification & screening reminder engine/i)).toBeVisible()
    await expect(visibleText(page, /escalations requiring attention/i)).toBeVisible()
    const gone = await page.goto('/pii-index')
    expect(gone?.status()).toBe(404)
  })
})
