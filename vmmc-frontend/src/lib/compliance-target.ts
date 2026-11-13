/** The clearance-rate goal and the reminder cadence now come from the APE SLA row in the database (see the backend's
 * SlaSettingsService), instead of being typed into the screens. These are the pure helpers for showing them. */

/** What the screens said before the value was read from the backend; also used if an older backend does not send it. */
export const DEFAULT_TARGET_PERCENT = 95

export interface TargetStatus {
  met: boolean
  /** Whole percentage points still to go; 0 once the target is met. */
  gap: number
  text: string
}

export function targetStatus(rate: number, targetPercent: number): TargetStatus {
  const met = rate >= targetPercent
  const gap = met ? 0 : Math.round(targetPercent - rate)
  const text = met ? 'Target met' : `${gap} point${gap === 1 ? '' : 's'} below target`
  return { met, gap, text }
}

export interface ReminderCadence {
  enabled: boolean
  intervalDays: number
}

/** The line under "Upcoming Due": it used to say "weekly" whatever the setting was. */
export function reminderCadenceLabel(cadence: ReminderCadence | null | undefined): string {
  if (!cadence) return 'Reminders dispatch weekly' // an older backend that does not send the setting
  if (!cadence.enabled) return 'Weekly reminders are off'
  if (cadence.intervalDays === 7) return 'Reminders dispatch weekly'
  if (cadence.intervalDays === 1) return 'Reminders dispatch daily'
  return `Reminders every ${cadence.intervalDays} days`
}
