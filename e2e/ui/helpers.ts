import type { Locator, Page } from '@playwright/test'

/** Real, working test accounts — not the fictional @vmmc.gov.ph seed data (see docs/HANDOFF.md §4). */
export const TEST_ACCOUNTS = {
  staff: { employeeId: 'VMMC-25-0021', password: 'asd123', fullName: 'Jennie Kim' },
  admin: { employeeId: 'VMMC-25-0022', password: 'asd123', fullName: 'John Wick' },
} as const

/**
 * Logs in via the real UI. Both mobile and desktop breakpoint blocks exist in the DOM
 * simultaneously (see FRONTEND_STANDARDS.md §9's locator gotcha) — every selector here is
 * scoped to `:visible` so it targets whichever block the current viewport is actually showing.
 */
export async function login(page: Page, { employeeId, password, portal }: { employeeId: string; password: string; portal: 'staff' | 'admin' }) {
  await page.goto('/login')

  if (portal === 'admin') {
    await page.locator('button:visible', { hasText: /^ADMIN LOGIN$/i }).first().click()
  }

  await page.locator('input[placeholder="Enter ID number"]:visible').fill(employeeId)
  await page.locator('input[placeholder="Enter password"]:visible').fill(password)
  await page.locator('button:visible', { hasText: /log in/i }).first().click()

  await page.waitForURL('**/dashboard')
}

/**
 * Every screen in this app renders both a mobile-native block and a tablet/desktop block
 * simultaneously (see FRONTEND_STANDARDS.md §9's locator gotcha) — only one is actually visible
 * per viewport, but plain `getByText(...).first()` picks whichever comes first in DOM order,
 * which is not necessarily the visible one. This intersects the text match with `:visible` first.
 */
export function visibleText(page: Page, text: string | RegExp): Locator {
  return page.getByText(text).and(page.locator(':visible')).first()
}
