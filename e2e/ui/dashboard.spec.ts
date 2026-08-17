import { test, expect } from '@playwright/test'
import { TEST_ACCOUNTS, login, visibleText } from './helpers'

test.describe('Dashboard', () => {
  test('staff dashboard shows real stat cards, not a stuck skeleton', async ({ page }) => {
    await login(page, { ...TEST_ACCOUNTS.staff, portal: 'staff' })
    await expect(page).toHaveURL(/\/dashboard/)

    // The skeleton loading state (see src/components/Skeleton.tsx) is deliberately transient —
    // asserting on real content resolving is what proves data actually loaded, not just that
    // *a* skeleton briefly rendered.
    await expect(visibleText(page, /urgent active actions/i)).toBeVisible()
  })

  test('admin dashboard shows hospital-wide figures', async ({ page }) => {
    await login(page, { ...TEST_ACCOUNTS.admin, portal: 'admin' })
    await expect(page).toHaveURL(/\/dashboard/)

    await expect(visibleText(page, /hospital compliance/i)).toBeVisible()
  })
})
