import type { Animal } from '../entities/animal';
import type { RecordEntry } from '../entities/record';
import type { FarmEntity, PaddockEntity } from '../context/SetupContext';
import { parseStoredDate } from './dateFormat';
import { resolveAnimalFarmName, resolveAnimalPaddockName } from './recordLocations';

export type ReportPeriod = 'all' | 'year' | 'month';

export const REPORT_PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'year', label: 'This year' },
  { value: 'month', label: 'This month' },
];

export type BreakdownRow = { label: string; count: number };

// Records report the farmer's own entered data as-is — no attempt is made
// here to validate or reconcile historical inconsistencies (e.g. two Sale
// records for the same animal). See AGENTS.md / Reports V1 scope: report
// what was entered, don't certify its correctness.
export function isDateInPeriod(dateValue: string, period: ReportPeriod, now: Date = new Date()): boolean {
  if (period === 'all') {
    return true;
  }

  const date = parseStoredDate(dateValue);

  if (!date) {
    return false;
  }

  if (period === 'year') {
    return date.getFullYear() === now.getFullYear();
  }

  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function groupCount<T>(items: T[], keyOf: (item: T) => string): BreakdownRow[] {
  const counts = new Map<string, number>();

  items.forEach((item) => {
    const key = keyOf(item).trim() || 'Not set';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);
}

export type HerdOverview = {
  totalActive: number;
  soldCount: number;
  deceasedCount: number;
  bySpecies: BreakdownRow[];
  byBreed: BreakdownRow[];
  bySex: BreakdownRow[];
  byFarm: BreakdownRow[];
  byPaddock: BreakdownRow[];
};

// Herd Overview reflects the current animal database (derived current
// state), not historical records — matches the rest of the app, where an
// animal's status/farm/paddock is always "as of now", not "as of the
// selected report period".
export function buildHerdOverview(
  animals: Animal[],
  farms: FarmEntity[],
  paddocks: PaddockEntity[],
): HerdOverview {
  const activeAnimals = animals.filter((animal) => animal.status === 'Active');

  return {
    totalActive: activeAnimals.length,
    soldCount: animals.filter((animal) => animal.status === 'Sold').length,
    deceasedCount: animals.filter((animal) => animal.status === 'Deceased').length,
    bySpecies: groupCount(activeAnimals, (animal) => animal.species || 'Unspecified'),
    byBreed: groupCount(activeAnimals, (animal) => animal.breed || 'Unspecified'),
    bySex: groupCount(activeAnimals, (animal) => (animal.sex === 'male' ? 'Male' : 'Female')),
    byFarm: groupCount(activeAnimals, (animal) => resolveAnimalFarmName(animal, farms) || 'No farm set'),
    byPaddock: groupCount(activeAnimals, (animal) => resolveAnimalPaddockName(animal, paddocks) || 'No paddock set'),
  };
}

export type ActivitySummary = {
  rows: BreakdownRow[];
  added: number;
  removed: number;
  net: number;
};

const ACTIVITY_ROW_TYPES: { type: string; label: string }[] = [
  { type: 'Birth', label: 'Births' },
  { type: 'Purchase', label: 'Purchases' },
  { type: 'Sale', label: 'Sales' },
  { type: 'Death', label: 'Deaths' },
  { type: 'Movement', label: 'Movements' },
  { type: 'Weight', label: 'Weight records' },
  { type: 'Vaccination', label: 'Vaccinations' },
  { type: 'Medication', label: 'Medications' },
  { type: 'Health Check', label: 'Health checks' },
  { type: 'Other', label: 'Other' },
];

export function buildActivitySummary(records: RecordEntry[], period: ReportPeriod): ActivitySummary {
  const periodRecords = records.filter((record) => isDateInPeriod(record.date, period));
  const countOf = (type: string) => periodRecords.filter((record) => record.type === type).length;

  const rows = ACTIVITY_ROW_TYPES.map(({ type, label }) => ({ label, count: countOf(type) }));
  const added = countOf('Birth') + countOf('Purchase');
  const removed = countOf('Sale') + countOf('Death');

  return { rows, added, removed, net: added - removed };
}

export type FinancialSummary = {
  currencyCode: string;
  salesTotal: number;
  purchasesTotal: number;
  net: number;
  salesRecordCount: number;
  purchasesRecordCount: number;
  excludedRecordCount: number;
};

function parseAmount(value: string | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }

  const amount = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(amount) ? amount : null;
}

// Sums only records in the account's base currency, matching how the record
// currency itself falls back (see getRecordCurrencyCode in view-record.tsx):
// a record with no currencyCode of its own is assumed to be in the base
// currency. Anything explicitly tagged with a different currency is left out
// of the totals rather than silently mixed in, and counted so the UI can
// disclose it.
export function buildFinancialSummary(
  records: RecordEntry[],
  period: ReportPeriod,
  baseCurrencyCode: string,
): FinancialSummary {
  const normalizedBase = (baseCurrencyCode || 'GBP').trim().toUpperCase() || 'GBP';
  const periodRecords = records.filter((record) => isDateInPeriod(record.date, period));

  let salesTotal = 0;
  let purchasesTotal = 0;
  let salesRecordCount = 0;
  let purchasesRecordCount = 0;
  let excludedRecordCount = 0;

  periodRecords.forEach((record) => {
    if (record.type !== 'Sale' && record.type !== 'Purchase') {
      return;
    }

    const recordCurrency = (record.currencyCode?.trim() || normalizedBase).toUpperCase();

    if (recordCurrency !== normalizedBase) {
      excludedRecordCount += 1;
      return;
    }

    const amount = parseAmount(record.type === 'Sale' ? record.salePrice : record.purchasePrice);

    if (amount === null) {
      return;
    }

    if (record.type === 'Sale') {
      salesTotal += amount;
      salesRecordCount += 1;
    } else {
      purchasesTotal += amount;
      purchasesRecordCount += 1;
    }
  });

  return {
    currencyCode: normalizedBase,
    salesTotal,
    purchasesTotal,
    net: salesTotal - purchasesTotal,
    salesRecordCount,
    purchasesRecordCount,
    excludedRecordCount,
  };
}

export type HealthSummary = {
  vaccinations: number;
  medications: number;
  healthChecks: number;
  deaths: number;
  animalsInWithdrawal: number;
};

// "Animals currently in withdrawal" is a live, current-moment fact (not
// scoped to the selected report period) — it derives from a
// Medication/Vaccination record's date + withdrawal (days) against today,
// and only counts animals still Active (a sold/deceased animal has no
// meaningful withdrawal warning left to show).
export function buildHealthSummary(
  records: RecordEntry[],
  period: ReportPeriod,
  animals: Animal[],
  now: Date = new Date(),
): HealthSummary {
  const periodRecords = records.filter((record) => isDateInPeriod(record.date, period));
  const countOf = (type: string) => periodRecords.filter((record) => record.type === type).length;

  const activeUids = new Set(
    animals.filter((animal) => animal.status === 'Active').map((animal) => animal.uid),
  );
  const withdrawalUids = new Set<string>();

  records.forEach((record) => {
    if (record.type !== 'Medication' && record.type !== 'Vaccination') {
      return;
    }

    const withdrawalDays = Number(record.withdrawal ?? '');

    if (!Number.isFinite(withdrawalDays) || withdrawalDays <= 0) {
      return;
    }

    const startDate = parseStoredDate(record.date);

    if (!startDate) {
      return;
    }

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + withdrawalDays);

    if (endDate.getTime() < now.getTime()) {
      return;
    }

    (record.animalUids ?? []).forEach((uid) => {
      if (activeUids.has(uid)) {
        withdrawalUids.add(uid);
      }
    });
  });

  return {
    vaccinations: countOf('Vaccination'),
    medications: countOf('Medication'),
    healthChecks: countOf('Health Check'),
    deaths: countOf('Death'),
    animalsInWithdrawal: withdrawalUids.size,
  };
}

export type WeightHistoryPoint = { recordId: string; date: string; value: number; unit: string };

// Chronological (oldest first) weight readings for one animal, for the
// optional per-animal Weight History section — see the 1/2/3+ record
// display rules in Reports V1 scope.
export function buildWeightHistory(animal: Animal, records: RecordEntry[]): WeightHistoryPoint[] {
  return records
    .filter((record) => record.type === 'Weight' && record.animalUids?.includes(animal.uid))
    .map((record) => ({
      recordId: record.id,
      date: record.date,
      value: parseAmount(record.weight),
      unit: record.weightUnit?.trim() || animal.weightUnit,
    }))
    .filter((point): point is WeightHistoryPoint => point.value !== null)
    .sort((left, right) => (parseStoredDate(left.date)?.getTime() ?? 0) - (parseStoredDate(right.date)?.getTime() ?? 0));
}
