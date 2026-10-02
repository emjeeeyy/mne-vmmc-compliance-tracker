import { computeCycleDates } from './sla-evaluator';

describe('computeCycleDates', () => {
  const FIRST_REMINDER_DAYS = 14;

  it('sets the due date to the last day of the birth month', () => {
    const result = computeCycleDates(new Date(Date.UTC(1990, 5, 15)), 2026, FIRST_REMINDER_DAYS); // June 15
    expect(result.birthdayDate).toBe('2026-06-15');
    expect(result.dueDate).toBe('2026-06-30');
  });

  it('opens the window N days before the birthday', () => {
    const result = computeCycleDates(new Date(Date.UTC(1990, 5, 15)), 2026, FIRST_REMINDER_DAYS);
    expect(result.windowOpenDate).toBe('2026-06-01');
  });

  // "every birthday phase" — walk a birthday through every month of the year, confirming the
  // due date always lands on that month's real last day (28/29/30/31), not a fixed offset.
  const monthCases: Array<[string, number, number, string]> = [
    ['January', 0, 15, '2026-01-31'],
    ['February (non-leap)', 1, 10, '2026-02-28'],
    ['March', 2, 31, '2026-03-31'],
    ['April', 3, 30, '2026-04-30'],
    ['May', 4, 1, '2026-05-31'],
    ['June', 5, 15, '2026-06-30'],
    ['July', 6, 4, '2026-07-31'],
    ['August', 7, 20, '2026-08-31'],
    ['September', 8, 9, '2026-09-30'],
    ['October', 9, 31, '2026-10-31'],
    ['November', 10, 11, '2026-11-30'],
    ['December', 11, 25, '2026-12-31'],
  ];

  it.each(monthCases)('%s birthday: due date is the correct real month-end', (_label, month, day, expectedDue) => {
    const result = computeCycleDates(new Date(Date.UTC(1985, month, day)), 2026, FIRST_REMINDER_DAYS);
    expect(result.dueDate).toBe(expectedDue);
  });

  it('handles a February 29 birthday (leap-year birth date) in a non-leap cycle year', () => {
    const result = computeCycleDates(new Date(Date.UTC(1992, 1, 29)), 2026, FIRST_REMINDER_DAYS);
    // JS Date normalizes Feb 29 -> Mar 1 in a non-leap year; the due date must still be the
    // birth MONTH's end as far as the evaluator is concerned (month index carries over from birthDate).
    expect(result.dueDate).toBe('2026-02-28');
  });

  it('handles a leap-year cycle year correctly for a February birthday', () => {
    const result = computeCycleDates(new Date(Date.UTC(1992, 1, 10)), 2028, FIRST_REMINDER_DAYS); // 2028 is a leap year
    expect(result.dueDate).toBe('2028-02-29');
  });

  it('window-open date can fall in the previous month when the birthday is early in the month', () => {
    const result = computeCycleDates(new Date(Date.UTC(1990, 0, 5)), 2026, FIRST_REMINDER_DAYS); // Jan 5
    expect(result.birthdayDate).toBe('2026-01-05');
    expect(result.windowOpenDate).toBe('2025-12-22'); // 14 days before Jan 5, 2026
  });

  it('respects a different first-reminder lead time per SLA definition', () => {
    const result = computeCycleDates(new Date(Date.UTC(1990, 5, 15)), 2026, 30);
    expect(result.windowOpenDate).toBe('2026-05-16');
  });

  it('always stamps the cycle year onto the birthday, regardless of the source year in birthDate', () => {
    const result = computeCycleDates(new Date(Date.UTC(1975, 3, 12)), 2030, FIRST_REMINDER_DAYS);
    expect(result.birthdayDate.startsWith('2030-')).toBe(true);
  });
});
