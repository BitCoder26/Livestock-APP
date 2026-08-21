import type { Animal } from '../entities/animal';
import type { Collective } from '../entities/collective';
import { getCollectiveCount } from '../entities/collective';
import type { RecordEntry } from '../entities/record';
import type { FarmEntity, LabelEntity, LocationEntity, MedicineEntity } from '../context/SetupContext';
import type { AppDateFormat } from '../entities/account';
import { formatDateForDisplay, parseStoredDate } from './dateFormat';
import { collectiveLabel } from './recordCollectives';
import {
  resolveAnimalFarmName,
  resolveAnimalLocationName,
  resolveFarmName,
  resolveLocationName,
} from './recordLocations';

export type ReportPeriod = 'all' | 'year' | 'month';

export const REPORT_PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'year', label: 'This year' },
  { value: 'month', label: 'This month' },
];

/**
 * One line of a report breakdown. `detail` is the second, quieter line under
 * the label — a farm's holding ID, a location's farm, a medicine's withdrawal
 * periods — so the setup sections can report the fields those entries actually
 * carry instead of just their names.
 */
export type BreakdownRow = { label: string; count: number; detail?: string };

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
  return groupSum(items, keyOf, () => 1);
}

// Same grouping, but each item contributes a weight rather than one. A herd's
// species line has to add up to head counts, not to "1 flock".
function groupSum<T>(items: T[], keyOf: (item: T) => string, valueOf: (item: T) => number): BreakdownRow[] {
  const counts = new Map<string, number>();

  items.forEach((item) => {
    const key = keyOf(item).trim() || 'Not set';
    counts.set(key, (counts.get(key) ?? 0) + valueOf(item));
  });

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);
}

// Labels are the one attribute an animal or group carries several of at once,
// so it lands on every line that applies rather than on a single bucket — the
// rows deliberately sum to more than the herd where animals wear two labels.
function groupSumMulti<T>(
  items: T[],
  keysOf: (item: T) => string[],
  valueOf: (item: T) => number,
  emptyLabel: string,
): BreakdownRow[] {
  const counts = new Map<string, number>();

  items.forEach((item) => {
    const keys = keysOf(item).map((key) => key.trim()).filter(Boolean);
    const value = valueOf(item);

    if (keys.length === 0) {
      counts.set(emptyLabel, (counts.get(emptyLabel) ?? 0) + value);
      return;
    }

    keys.forEach((key) => {
      counts.set(key, (counts.get(key) ?? 0) + value);
    });
  });

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);
}

// An entity's live label names, preferring the uid so a rename in Setup shows
// up here immediately. Animals and collectives store labels identically, so
// this takes the shape rather than either entity type.
function resolveLabelNames(
  entity: { labels?: string[]; labelUids?: string[] },
  labels: LabelEntity[],
): string[] {
  const storedNames = entity.labels ?? [];
  const storedUids = entity.labelUids ?? [];

  return storedNames
    .map((name, index) => {
      const uid = storedUids[index];
      const match = uid ? labels.find((entry) => entry.uid === uid) : undefined;
      return (match?.name ?? name).trim();
    })
    .filter(Boolean);
}

export type HerdOverview = {
  totalActive: number;
  soldCount: number;
  deceasedCount: number;
  bySpecies: BreakdownRow[];
  byBreed: BreakdownRow[];
  bySex: BreakdownRow[];
  byFarm: BreakdownRow[];
  byLocation: BreakdownRow[];
  byLabel: BreakdownRow[];
  bySource: BreakdownRow[];
};

// Herd Overview reflects the current animal database (derived current
// state), not historical records — matches the rest of the app, where an
// animal's status/farm/location is always "as of now", not "as of the
// selected report period".
export function buildHerdOverview(
  animals: Animal[],
  farms: FarmEntity[],
  locations: LocationEntity[],
  labels: LabelEntity[],
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
    byLocation: groupCount(activeAnimals, (animal) => resolveAnimalLocationName(animal, locations) || 'No location set'),
    byLabel: groupSumMulti(
      activeAnimals,
      (animal) => resolveLabelNames(animal, labels),
      () => 1,
      'No label',
    ),
    bySource: groupCount(activeAnimals, (animal) => animal.source || 'Not recorded'),
  };
}

export type CollectiveOverview = {
  totalGroups: number;
  activeGroups: number;
  inactiveGroups: number;
  /** Head across active groups — what the keeper actually has in the sheds. */
  totalHead: number;
  /** Head sitting in groups that have been closed out. */
  inactiveHead: number;
  byGroup: BreakdownRow[];
  bySpecies: BreakdownRow[];
  byBreed: BreakdownRow[];
  byFarm: BreakdownRow[];
  byLocation: BreakdownRow[];
  byLabel: BreakdownRow[];
  byPurpose: BreakdownRow[];
};

/**
 * The herd and flock side of the same current-state picture the Livestock
 * Overview gives for individually identified animals. Every breakdown counts
 * *head* rather than groups — "Chicken 480" is the answer a keeper wants, not
 * "Chicken 2" — with the group tallies kept in the totals above.
 */
export function buildCollectiveOverview(
  collectives: Collective[],
  farms: FarmEntity[],
  locations: LocationEntity[],
  labels: LabelEntity[],
): CollectiveOverview {
  const activeGroups = collectives.filter((collective) => collective.status === 'Active');
  const inactiveGroups = collectives.filter((collective) => collective.status !== 'Active');
  const headOf = (collective: Collective) => getCollectiveCount(collective);

  return {
    totalGroups: collectives.length,
    activeGroups: activeGroups.length,
    inactiveGroups: inactiveGroups.length,
    totalHead: activeGroups.reduce((sum, collective) => sum + headOf(collective), 0),
    inactiveHead: inactiveGroups.reduce((sum, collective) => sum + headOf(collective), 0),
    byGroup: activeGroups
      .map((collective) => ({
        label: collectiveLabel(collective),
        count: headOf(collective),
        detail: [collective.id.trim(), collective.species.trim(), collective.breed.trim()]
          .filter(Boolean)
          .join(' • '),
      }))
      .sort((left, right) => right.count - left.count),
    bySpecies: groupSum(activeGroups, (collective) => collective.species || 'Unspecified', headOf),
    byBreed: groupSum(activeGroups, (collective) => collective.breed || 'Unspecified', headOf),
    byFarm: groupSum(
      activeGroups,
      (collective) => resolveFarmName(collective.farmUid, collective.farm, farms) || 'No farm set',
      headOf,
    ),
    byLocation: groupSum(
      activeGroups,
      (collective) => resolveLocationName(collective.locationUid, collective.location, locations) || 'No location set',
      headOf,
    ),
    byLabel: groupSumMulti(activeGroups, (collective) => resolveLabelNames(collective, labels), headOf, 'No label'),
    byPurpose: groupSum(activeGroups, (collective) => collective.purpose || 'Not recorded', headOf),
  };
}

export type ActivitySummary = {
  rows: BreakdownRow[];
  /** Records kept against individually identified animals. */
  individualRecords: number;
  /** Records kept against a herd or flock. */
  collectiveRecords: number;
  totalRecords: number;
  added: number;
  removed: number;
  net: number;
};

/**
 * One line per thing a keeper can record, individual and collective side by
 * side. The two record lists use different type names for the same event — an
 * individual `Birth` against a flock's `Births` — so each row names every
 * stored type it covers rather than one, and a lambing and a hatch land on the
 * same line.
 */
const ACTIVITY_ROW_TYPES: { types: string[]; label: string }[] = [
  { types: ['Birth', 'Births'], label: 'Births' },
  { types: ['Purchase'], label: 'Purchases' },
  { types: ['Sale'], label: 'Sales' },
  { types: ['Death', 'Deaths'], label: 'Deaths' },
  { types: ['Movement'], label: 'Movements' },
  { types: ['Weight'], label: 'Weight records' },
  { types: ['Vaccination'], label: 'Vaccinations' },
  { types: ['Medication'], label: 'Medications' },
  { types: ['Health Check'], label: 'Health checks' },
  { types: ['Feed'], label: 'Feed records' },
  { types: ['Egg Production'], label: 'Egg production' },
  { types: ['Headcount'], label: 'Headcount corrections' },
  { types: ['Other'], label: 'Other' },
];

// How many animals a single record moved. An individual record can name
// several animals at once, and a collective one carries its own head count —
// counting either as "1" would report the paperwork rather than the stock.
function animalsTouchedBy(record: RecordEntry): number {
  if (record.collectiveUid) {
    const affected = Number(record.affectedCount ?? '');
    return Number.isFinite(affected) ? Math.abs(affected) : 0;
  }

  return record.animalUids?.length || 1;
}

export function buildActivitySummary(records: RecordEntry[], period: ReportPeriod): ActivitySummary {
  const periodRecords = records.filter((record) => isDateInPeriod(record.date, period));
  const matching = (types: string[]) => periodRecords.filter((record) => types.includes(record.type));

  const rows = ACTIVITY_ROW_TYPES.map(({ types, label }) => ({ label, count: matching(types).length }));
  const headIn = (types: string[]) =>
    matching(types).reduce((sum, record) => sum + animalsTouchedBy(record), 0);

  const added = headIn(['Birth', 'Births', 'Purchase']);
  const removed = headIn(['Sale', 'Death', 'Deaths']);

  return {
    rows,
    individualRecords: periodRecords.filter((record) => !record.collectiveUid).length,
    collectiveRecords: periodRecords.filter((record) => Boolean(record.collectiveUid)).length,
    totalRecords: periodRecords.length,
    added,
    removed,
    net: added - removed,
  };
}

export type FinancialSummary = {
  currencyCode: string;
  salesTotal: number;
  purchasesTotal: number;
  /**
   * Running costs — Feed and the free-text Other type, which together are how
   * a keeper logs any spend that is not buying an animal. Kept apart from
   * `purchasesTotal` so "what did I spend on stock" and "what did it cost me
   * to keep them" stay answerable separately.
   */
  costsTotal: number;
  feedCostsTotal: number;
  otherCostsTotal: number;
  net: number;
  salesRecordCount: number;
  purchasesRecordCount: number;
  costsRecordCount: number;
  excludedRecordCount: number;
  /** Who the stock went to and came from, by value. */
  byBuyer: BreakdownRow[];
  bySeller: BreakdownRow[];
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
  let feedCostsTotal = 0;
  let otherCostsTotal = 0;
  let salesRecordCount = 0;
  let purchasesRecordCount = 0;
  let costsRecordCount = 0;
  let excludedRecordCount = 0;
  const sales: { record: RecordEntry; amount: number }[] = [];
  const purchases: { record: RecordEntry; amount: number }[] = [];

  const carriesCost = (record: RecordEntry) =>
    (record.type === 'Feed' || record.type === 'Other') && Boolean(record.cost?.trim());

  periodRecords.forEach((record) => {
    if (record.type !== 'Sale' && record.type !== 'Purchase' && !carriesCost(record)) {
      return;
    }

    const recordCurrency = (record.currencyCode?.trim() || normalizedBase).toUpperCase();

    if (recordCurrency !== normalizedBase) {
      excludedRecordCount += 1;
      return;
    }

    const amount = parseAmount(
      record.type === 'Sale'
        ? record.salePrice
        : record.type === 'Purchase'
          ? record.purchasePrice
          : record.cost,
    );

    if (amount === null) {
      return;
    }

    if (record.type === 'Sale') {
      salesTotal += amount;
      salesRecordCount += 1;
      sales.push({ record, amount });
    } else if (record.type === 'Purchase') {
      purchasesTotal += amount;
      purchasesRecordCount += 1;
      purchases.push({ record, amount });
    } else {
      if (record.type === 'Feed') {
        feedCostsTotal += amount;
      } else {
        otherCostsTotal += amount;
      }

      costsRecordCount += 1;
    }
  });

  return {
    currencyCode: normalizedBase,
    salesTotal,
    purchasesTotal,
    costsTotal: feedCostsTotal + otherCostsTotal,
    feedCostsTotal,
    otherCostsTotal,
    net: salesTotal - purchasesTotal - feedCostsTotal - otherCostsTotal,
    salesRecordCount,
    purchasesRecordCount,
    costsRecordCount,
    excludedRecordCount,
    byBuyer: groupSum(
      sales,
      (entry) => entry.record.buyer?.trim() || 'Buyer not recorded',
      (entry) => entry.amount,
    ),
    bySeller: groupSum(
      purchases,
      (entry) => entry.record.seller?.trim() || 'Seller not recorded',
      (entry) => entry.amount,
    ),
  };
}

export type ProductionSummary = {
  feedRecordCount: number;
  /** Feed fed or delivered, totalled per unit — kg and bales don't add up. */
  feedByUnit: BreakdownRow[];
  feedByType: BreakdownRow[];
  eggRecordCount: number;
  eggsCollected: number;
  eggsDamaged: number;
  eggsSellable: number;
};

/**
 * What the farm put in and what it got out — the two collective-only record
 * types that carry a quantity of their own (Feed and Egg Production) rather
 * than a head count. Feed is totalled per unit because a report that adds
 * kilos to bales is worse than no total at all.
 */
export function buildProductionSummary(records: RecordEntry[], period: ReportPeriod): ProductionSummary {
  const periodRecords = records.filter((record) => isDateInPeriod(record.date, period));
  const feedRecords = periodRecords.filter((record) => record.type === 'Feed');
  const eggRecords = periodRecords.filter((record) => record.type === 'Egg Production');

  const sumField = (entries: RecordEntry[], field: (record: RecordEntry) => string | undefined) =>
    entries.reduce((sum, record) => sum + (parseAmount(field(record)) ?? 0), 0);

  const eggsCollected = sumField(eggRecords, (record) => record.eggsCollected);
  const eggsDamaged = sumField(eggRecords, (record) => record.eggsDamaged);

  return {
    feedRecordCount: feedRecords.length,
    feedByUnit: groupSum(
      feedRecords.filter((record) => parseAmount(record.feedQuantity) !== null),
      (record) => record.feedUnit?.trim() || 'kg',
      (record) => parseAmount(record.feedQuantity) ?? 0,
    ),
    feedByType: groupCount(feedRecords, (record) => record.feedType?.trim() || 'Feed type not recorded'),
    eggRecordCount: eggRecords.length,
    eggsCollected,
    eggsDamaged,
    eggsSellable: Math.max(0, eggsCollected - eggsDamaged),
  };
}

export type HealthSummary = {
  vaccinations: number;
  medications: number;
  healthChecks: number;
  deaths: number;
  animalsInWithdrawal: number;
  /** Herds and flocks still inside a withdrawal period, same live reckoning. */
  collectivesInWithdrawal: number;
  /** Which medicines and vaccines were actually given, most-used first. */
  treatmentsByProduct: BreakdownRow[];
  byRoute: BreakdownRow[];
  deathsByCause: BreakdownRow[];
  deathsByDisposal: BreakdownRow[];
  healthCheckStatuses: BreakdownRow[];
  vetVisits: number;
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
  collectives: Collective[] = [],
  now: Date = new Date(),
): HealthSummary {
  const periodRecords = records.filter((record) => isDateInPeriod(record.date, period));
  const countOf = (types: string[]) => periodRecords.filter((record) => types.includes(record.type)).length;

  const activeUids = new Set(
    animals.filter((animal) => animal.status === 'Active').map((animal) => animal.uid),
  );
  const activeCollectiveUids = new Set(
    collectives.filter((collective) => collective.status === 'Active').map((collective) => collective.uid),
  );
  const withdrawalUids = new Set<string>();
  const collectiveWithdrawalUids = new Set<string>();

  records.forEach((record) => {
    if (record.type !== 'Medication' && record.type !== 'Vaccination') {
      return;
    }

    // Meat and milk withdrawal run from the same treatment date but expire
    // separately, so the animal is still restricted until the longer of the
    // two has run out.
    const meatDays = Number(record.withdrawal ?? '');
    const milkDays = Number(record.milkWithdrawal ?? '');
    const withdrawalDays = Math.max(
      Number.isFinite(meatDays) ? meatDays : 0,
      Number.isFinite(milkDays) ? milkDays : 0,
    );

    if (withdrawalDays <= 0) {
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

    if (record.collectiveUid) {
      if (activeCollectiveUids.has(record.collectiveUid)) {
        collectiveWithdrawalUids.add(record.collectiveUid);
      }

      return;
    }

    (record.animalUids ?? []).forEach((uid) => {
      if (activeUids.has(uid)) {
        withdrawalUids.add(uid);
      }
    });
  });

  const treatmentRecords = periodRecords.filter(
    (record) => record.type === 'Medication' || record.type === 'Vaccination',
  );
  const deathRecords = periodRecords.filter(
    (record) => record.type === 'Death' || record.type === 'Deaths',
  );
  const healthCheckRecords = periodRecords.filter((record) => record.type === 'Health Check');

  return {
    vaccinations: countOf(['Vaccination']),
    medications: countOf(['Medication']),
    healthChecks: healthCheckRecords.length,
    deaths: deathRecords.length,
    animalsInWithdrawal: withdrawalUids.size,
    collectivesInWithdrawal: collectiveWithdrawalUids.size,
    treatmentsByProduct: groupCount(
      treatmentRecords,
      (record) => record.medicine?.trim() || 'Product not recorded',
    ),
    byRoute: groupCount(
      treatmentRecords.filter((record) => Boolean(record.route?.trim())),
      (record) => record.route?.trim() ?? '',
    ),
    deathsByCause: groupCount(deathRecords, (record) => record.causeOfDeath?.trim() || 'Cause not recorded'),
    deathsByDisposal: groupCount(
      deathRecords.filter((record) => Boolean(record.disposalMethod?.trim())),
      (record) => record.disposalMethod?.trim() ?? '',
    ),
    healthCheckStatuses: groupCount(
      healthCheckRecords,
      (record) => record.healthStatus?.trim() || 'Status not recorded',
    ),
    vetVisits: healthCheckRecords.filter((record) => record.vetSeen === 'Yes').length,
  };
}

export type SetupSummary = {
  farmCount: number;
  locationCount: number;
  labelCount: number;
  medicineCount: number;
  vaccineCount: number;
  farms: BreakdownRow[];
  locations: BreakdownRow[];
  labels: BreakdownRow[];
  medicines: BreakdownRow[];
  vaccines: BreakdownRow[];
};

/**
 * The farm's own reference data — the farms, locations, labels, medicines and
 * vaccines set up in Setup — reported with the fields each one carries and how
 * much stock or how many treatments actually sit against it. An entry nothing
 * points at still appears, at zero: an unused location is a fact worth seeing,
 * not a row to hide.
 *
 * Counts are head, so an entry covering a flock reports the birds in it rather
 * than the single group record they are kept as.
 */
export function buildSetupSummary({
  farms,
  locations,
  labels,
  medicines,
  animals,
  collectives,
  records,
  dateFormat,
}: {
  farms: FarmEntity[];
  locations: LocationEntity[];
  labels: LabelEntity[];
  medicines: MedicineEntity[];
  animals: Animal[];
  collectives: Collective[];
  records: RecordEntry[];
  dateFormat?: AppDateFormat;
}): SetupSummary {
  const activeAnimals = animals.filter((animal) => animal.status === 'Active');
  const activeCollectives = collectives.filter((collective) => collective.status === 'Active');

  const headInFarm = (farm: FarmEntity) => {
    const animalCount = activeAnimals.filter(
      (animal) => resolveAnimalFarmName(animal, farms).trim() === farm.name.trim(),
    ).length;
    const collectiveHead = activeCollectives
      .filter((collective) => resolveFarmName(collective.farmUid, collective.farm, farms).trim() === farm.name.trim())
      .reduce((sum, collective) => sum + getCollectiveCount(collective), 0);

    return animalCount + collectiveHead;
  };

  const headInLocation = (location: LocationEntity) => {
    const animalCount = activeAnimals.filter(
      (animal) => resolveAnimalLocationName(animal, locations).trim() === location.name.trim(),
    ).length;
    const collectiveHead = activeCollectives
      .filter(
        (collective) =>
          resolveLocationName(collective.locationUid, collective.location, locations).trim() === location.name.trim(),
      )
      .reduce((sum, collective) => sum + getCollectiveCount(collective), 0);

    return animalCount + collectiveHead;
  };

  const headWithLabel = (label: LabelEntity) => {
    const animalCount = activeAnimals.filter((animal) =>
      resolveLabelNames(animal, labels).some((name) => name === label.name.trim()),
    ).length;
    const collectiveHead = activeCollectives
      .filter((collective) => resolveLabelNames(collective, labels).some((name) => name === label.name.trim()))
      .reduce((sum, collective) => sum + getCollectiveCount(collective), 0);

    return animalCount + collectiveHead;
  };

  const treatmentUseCount = (medicine: MedicineEntity) =>
    records.filter(
      (record) =>
        (record.type === 'Medication' || record.type === 'Vaccination') &&
        record.medicine?.trim().toLowerCase() === medicine.name.trim().toLowerCase(),
    ).length;

  const treatmentRow = (medicine: MedicineEntity): BreakdownRow => ({
    label: medicine.name.trim() || 'Untitled',
    count: treatmentUseCount(medicine),
    detail: [
      medicine.activeIngredient.trim(),
      medicine.defaultDose.trim() ? `Dose ${medicine.defaultDose.trim()} ${medicine.doseUnit.trim()}`.trim() : '',
      medicine.defaultRoute.trim(),
      medicine.meatWithdrawalPeriod.trim() ? `Meat ${medicine.meatWithdrawalPeriod.trim()} days` : '',
      medicine.milkWithdrawalPeriod.trim() ? `Milk ${medicine.milkWithdrawalPeriod.trim()} days` : '',
      medicine.expiryDate.trim() ? `Expires ${formatDateForDisplay(medicine.expiryDate.trim(), dateFormat)}` : '',
    ]
      .filter(Boolean)
      .join(' • '),
  });

  const medicineEntries = medicines.filter((entry) => entry.treatmentType !== 'vaccine');
  const vaccineEntries = medicines.filter((entry) => entry.treatmentType === 'vaccine');

  return {
    farmCount: farms.length,
    locationCount: locations.length,
    labelCount: labels.length,
    medicineCount: medicineEntries.length,
    vaccineCount: vaccineEntries.length,
    farms: farms.map((farm) => {
      const locationCount = locations.filter((location) => location.farm.trim() === farm.name.trim()).length;

      return {
        label: farm.name.trim() || 'Untitled farm',
        count: headInFarm(farm),
        detail: [
          farm.holdingId.trim() ? `Holding ID ${farm.holdingId.trim()}` : '',
          `${locationCount} location${locationCount === 1 ? '' : 's'}`,
        ]
          .filter(Boolean)
          .join(' • '),
      };
    }),
    locations: locations.map((location) => ({
      label: location.name.trim() || 'Untitled location',
      count: headInLocation(location),
      detail: location.farm.trim(),
    })),
    labels: labels.map((label) => ({
      label: label.name.trim() || 'Untitled label',
      count: headWithLabel(label),
    })),
    medicines: medicineEntries.map(treatmentRow),
    vaccines: vaccineEntries.map(treatmentRow),
  };
}

export type WeightHistoryPoint = {
  recordId: string;
  date: string;
  value: number;
  unit: string;
  /** Collectives only: how many animals were on the scales. */
  sampleSize?: string;
};

// Chronological (oldest first) weight readings for one herd or flock. A
// collective is weighed by sample rather than bird by bird, so `sampleSize`
// rides along — an average off five birds and one off fifty are not the same
// claim, and the section that renders these says so.
export function buildCollectiveWeightHistory(
  collectiveUid: string,
  records: RecordEntry[],
): WeightHistoryPoint[] {
  return records
    .filter((record) => record.type === 'Weight' && record.collectiveUid === collectiveUid)
    .map((record) => ({
      recordId: record.id,
      date: record.date,
      value: parseAmount(record.weight),
      unit: record.weightUnit?.trim() || 'kg',
      sampleSize: record.sampleSize?.trim() || '',
    }))
    .flatMap((point) => (point.value === null ? [] : [{ ...point, value: point.value }]))
    .sort((left, right) => (parseStoredDate(left.date)?.getTime() ?? 0) - (parseStoredDate(right.date)?.getTime() ?? 0));
}

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
