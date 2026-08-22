import { formatDateForStorage } from './dateFormat';

/**
 * One-tap shortcuts for the start/end date pair used by the records filter and
 * the Export screen.
 *
 * They *fill in* the range rather than replacing it: tapping "This year" sets
 * both dates, and the pickers stay editable underneath. That keeps a single
 * mental model — a date range — with shortcuts on top, instead of two
 * competing modes where the user has to work out which one is in charge.
 *
 * `This year` and `Last 12 months` both earn their place because they answer
 * different questions: a calendar year is what year-end accounts are drawn up
 * on, while a rolling twelve months is what a medicine, withdrawal or vet
 * audit asks for. Four options is also as many as fit across a phone before
 * they start wrapping.
 *
 * Labels match the ones on Reports (`REPORT_PERIOD_OPTIONS`) so the same
 * period reads the same way wherever it appears. The rolling option is
 * labelled "12 months" rather than "Last 12 months" so all four fit one row
 * even on a small phone, and rather than "1 year" because that sits next to
 * "This year" and would read as the same thing — a duration and a calendar
 * period are exactly what these two options have to keep apart.
 */

export type DateRangePresetKey = 'all' | 'month' | 'year' | 'last12';

export type DateRange = { startDate: string | null; endDate: string | null };

export const DATE_RANGE_PRESETS: Array<{ key: DateRangePresetKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'last12', label: '12 months' },
];

export function resolveDateRangePreset(key: DateRangePresetKey, now: Date = new Date()): DateRange {
  switch (key) {
    case 'all':
      return { startDate: null, endDate: null };
    case 'month':
      return {
        startDate: formatDateForStorage(new Date(now.getFullYear(), now.getMonth(), 1)),
        // Day 0 of the next month is the last day of this one, which keeps
        // February and the 31-day months correct without a lookup table.
        endDate: formatDateForStorage(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    case 'year':
      return {
        startDate: formatDateForStorage(new Date(now.getFullYear(), 0, 1)),
        endDate: formatDateForStorage(new Date(now.getFullYear(), 11, 31)),
      };
    case 'last12':
      // Rolling: ends today rather than at the end of the month, because "the
      // last twelve months" should not include dates that have not happened.
      return {
        startDate: formatDateForStorage(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())),
        endDate: formatDateForStorage(now),
      };
  }
}

/**
 * Which preset a range corresponds to, or null when the dates were set by hand
 * and match none of them — that is what deselects the chips as soon as the
 * user edits a date, so a highlighted chip never claims a range it doesn't
 * describe.
 */
export function matchDateRangePreset(range: DateRange, now: Date = new Date()): DateRangePresetKey | null {
  for (const { key } of DATE_RANGE_PRESETS) {
    const resolved = resolveDateRangePreset(key, now);

    if (resolved.startDate === (range.startDate ?? null) && resolved.endDate === (range.endDate ?? null)) {
      return key;
    }
  }

  return null;
}
