import type { AppDateFormat } from '../entities/account';

export const DEFAULT_APP_DATE_FORMAT: AppDateFormat = 'DD MMM YYYY';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function pad(value: number) {
  return `${value}`.padStart(2, '0');
}

function buildValidDate(year: number, monthIndex: number, day: number) {
  const date = new Date(year, monthIndex, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function normalizeDateFormat(value: unknown): AppDateFormat {
  return value === 'MM/DD/YYYY' || value === 'YYYY-MM-DD' || value === 'DD/MM/YYYY' || value === 'DD MMM YYYY'
    ? value
    : DEFAULT_APP_DATE_FORMAT;
}

export function formatDateForStorage(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseStoredDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoMatch) {
    return buildValidDate(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);

    if (first > 12 && second <= 12) {
      return buildValidDate(year, second - 1, first);
    }

    if (second > 12 && first <= 12) {
      return buildValidDate(year, first - 1, second);
    }

    return buildValidDate(year, second - 1, first);
  }

  const namedMonthMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);

  if (namedMonthMatch) {
    const day = Number(namedMonthMatch[1]);
    const monthIndex = MONTH_INDEX[namedMonthMatch[2].slice(0, 3).toLowerCase()];
    const year = Number(namedMonthMatch[3]);

    if (monthIndex === undefined) {
      return null;
    }

    return buildValidDate(year, monthIndex, day);
  }

  return null;
}

export function formatDateForDisplay(
  value: Date | string | null | undefined,
  dateFormat: AppDateFormat = DEFAULT_APP_DATE_FORMAT,
) {
  const date = value instanceof Date ? value : parseStoredDate(value);

  if (!date) {
    return typeof value === 'string' ? value : '';
  }

  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();

  switch (dateFormat) {
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'DD MMM YYYY':
      return `${day} ${MONTH_NAMES[date.getMonth()]} ${year}`;
    case 'DD/MM/YYYY':
    default:
      return `${day}/${month}/${year}`;
  }
}
