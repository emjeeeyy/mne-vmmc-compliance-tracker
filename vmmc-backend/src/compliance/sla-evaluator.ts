/** Ch.3 cadence: window opens N days before the birthday; the deadline is the end of the birth month. */
export interface CycleDates {
  birthdayDate: string;
  windowOpenDate: string;
  dueDate: string;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function computeCycleDates(
  birthDate: Date,
  cycleYear: number,
  firstReminderDaysBeforeBirthday: number,
): CycleDates {
  const birthdayDate = new Date(Date.UTC(cycleYear, birthDate.getUTCMonth(), birthDate.getUTCDate()));

  const windowOpenDate = new Date(birthdayDate);
  windowOpenDate.setUTCDate(windowOpenDate.getUTCDate() - firstReminderDaysBeforeBirthday);

  // Day 0 of the following month == the last day of the birth month.
  const dueDate = new Date(Date.UTC(cycleYear, birthDate.getUTCMonth() + 1, 0));

  return {
    birthdayDate: toIsoDate(birthdayDate),
    windowOpenDate: toIsoDate(windowOpenDate),
    dueDate: toIsoDate(dueDate),
  };
}
