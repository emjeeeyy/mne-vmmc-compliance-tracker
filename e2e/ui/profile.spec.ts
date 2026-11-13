import { test, expect } from '@playwright/test'
import { nameOf, signInAs, visibleText } from './helpers'

// Regression coverage for a real bug found in this build: Layout.tsx's header pill and
// Profile.tsx's profile card had "Juan Dela Cruz, RN" / "Dr. Arturo V." hardcoded from the
// original Figma mockup, left over from before the rest of Profile.tsx moved to real fetched
// data — every logged-in user saw someone else's name. See docs/SYSTEM_ARCHITECTURE.md §7.
test.describe('Profile identity', () => {
  test('staff sees their own real name and job title, not a hardcoded mock identity', async ({ page }) => {
    await signInAs(page, 'staff')
    await page.goto('/profile')

    await expect(visibleText(page, nameOf('staff'))).toBeVisible()
    await expect(page.getByText('Juan Dela Cruz', { exact: false })).toHaveCount(0)
  })

  test('admin sees their own real name and job title, not a hardcoded mock identity', async ({ page }) => {
    await signInAs(page, 'admin')
    await page.goto('/profile')

    await expect(visibleText(page, nameOf('admin'))).toBeVisible()
    await expect(page.getByText('Dr. Arturo', { exact: false })).toHaveCount(0)
  })

  test('admin Profile shows the system-wide audit trail with real rows', async ({ page }) => {
    await signInAs(page, 'admin')
    await page.goto('/profile')

    await expect(visibleText(page, /system activity & audit trail/i)).toBeVisible()
    // A row rendered with a real employee ID proves the /audit-trail fetch resolved, not just the page shell.
    await expect(visibleText(page, /VMMC-\d{2}-\d{4}/)).toBeVisible()
  })
})
