import { Alert } from 'react-native';

import type { AppDateFormat } from '../entities/account';
import type { Animal } from '../entities/animal';
import type { RecordEntry } from '../entities/record';
import { formatDateForDisplay, parseStoredDate } from './dateFormat';
import { resolveRecordAnimalUids } from './recordAnimals';
import { isValidNonNegativeInteger } from './validation';

/**
 * Withdrawal is derived, never stored. A treatment record already carries the
 * date it happened and the two periods the keeper entered (`withdrawal` for
 * meat, `milkWithdrawal` for milk — see `RecordEntry`), so the date the animals
 * come clear is arithmetic, not a new field: nothing here needs migrating,
 * backing up, or keeping in step with the records it is read from.
 *
 * These are the keeper's own figures off their own medicine cabinet, not a
 * regulatory lookup — surfaces showing them should say when they clear, and
 * never that an animal is "safe" to sell.
 */
export type WithdrawalKind = 'meat' | 'milk';

export type ActiveWithdrawal = {
  kind: WithdrawalKind;
  /** The first day the animals are clear of this period. */
  clearDate: Date;
  /** Whole days still to run from the reference date. Always at least 1. */
  daysRemaining: number;
  /** The treatment the period was read from. */
  sourceRecordId: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function withdrawalDays(record: RecordEntry, kind: WithdrawalKind) {
  const raw = kind === 'meat' ? record.withdrawal : record.milkWithdrawal;

  if (!raw || !isValidNonNegativeInteger(raw)) {
    return null;
  }

  const days = Number.parseInt(raw.trim(), 10);
  // A withdrawal of zero is a real answer on the form — it just never puts an
  // animal inside a period, so there is nothing to show for it.
  return days > 0 ? days : null;
}

/**
 * The day the period runs out: a 7-day withdrawal entered against a treatment
 * on the 1st covers the seven days that follow and comes clear on the 8th.
 */
function clearDateFor(record: RecordEntry, kind: WithdrawalKind) {
  const days = withdrawalDays(record, kind);

  if (days === null) {
    return null;
  }

  const treatedOn = parseStoredDate(record.date);

  if (!treatedOn) {
    return null;
  }

  return new Date(treatedOn.getFullYear(), treatedOn.getMonth(), treatedOn.getDate() + days);
}

export function carriesWithdrawal(record: RecordEntry) {
  return clearDateFor(record, 'meat') !== null || clearDateFor(record, 'milk') !== null;
}

/**
 * The periods still running over `asOf`, at most one per kind: where treatments
 * overlap the furthest-out date is the one that matters, since a second
 * treatment can only ever extend a period, never cut it short.
 */
export function activeWithdrawals(records: RecordEntry[], asOf: Date = new Date()): ActiveWithdrawal[] {
  const reference = startOfDay(asOf).getTime();
  const found: ActiveWithdrawal[] = [];

  (['meat', 'milk'] as const).forEach((kind) => {
    let latest: ActiveWithdrawal | null = null;

    records.forEach((record) => {
      const clearDate = clearDateFor(record, kind);

      if (!clearDate || clearDate.getTime() <= reference) {
        return;
      }

      if (!latest || clearDate.getTime() > latest.clearDate.getTime()) {
        latest = {
          kind,
          clearDate,
          // Rounded rather than floored: local midnights are 23 or 25 hours
          // apart across a daylight-saving change.
          daysRemaining: Math.max(1, Math.round((clearDate.getTime() - reference) / DAY_MS)),
          sourceRecordId: record.id,
        };
      }
    });

    if (latest) {
      found.push(latest);
    }
  });

  return found;
}

export type WithdrawalIndex = {
  byAnimalUid: Map<string, ActiveWithdrawal[]>;
  byCollectiveUid: Map<string, ActiveWithdrawal[]>;
};

function push(map: Map<string, RecordEntry[]>, key: string, record: RecordEntry) {
  const existing = map.get(key);

  if (existing) {
    existing.push(record);
    return;
  }

  map.set(key, [record]);
}

/**
 * Built once per screen rather than per row: resolving a record's animals is
 * the expensive half, and a list of a thousand animals would otherwise repeat
 * it for every one of them. Records carrying no withdrawal are dropped first,
 * which on most farms leaves a handful out of thousands.
 */
export function buildWithdrawalIndex(
  records: RecordEntry[],
  animals: Animal[],
  asOf: Date = new Date(),
): WithdrawalIndex {
  const animalRecords = new Map<string, RecordEntry[]>();
  const collectiveRecords = new Map<string, RecordEntry[]>();

  records.filter(carriesWithdrawal).forEach((record) => {
    if (record.collectiveUid) {
      push(collectiveRecords, record.collectiveUid, record);
      return;
    }

    resolveRecordAnimalUids(record, animals).forEach((uid) => push(animalRecords, uid, record));
  });

  const toIndex = (source: Map<string, RecordEntry[]>) => {
    const index = new Map<string, ActiveWithdrawal[]>();

    source.forEach((entries, uid) => {
      const active = activeWithdrawals(entries, asOf);

      if (active.length > 0) {
        index.set(uid, active);
      }
    });

    return index;
  };

  return { byAnimalUid: toIndex(animalRecords), byCollectiveUid: toIndex(collectiveRecords) };
}

export function withdrawalsForAnimal(
  animalUid: string,
  records: RecordEntry[],
  animals: Animal[],
  asOf: Date = new Date(),
) {
  return buildWithdrawalIndex(records, animals, asOf).byAnimalUid.get(animalUid) ?? [];
}

export function withdrawalsForCollective(
  collectiveUid: string,
  records: RecordEntry[],
  asOf: Date = new Date(),
) {
  const entries = records.filter((record) => record.collectiveUid === collectiveUid);
  return activeWithdrawals(entries, asOf);
}

export function withdrawalKindLabel(kind: WithdrawalKind) {
  return kind === 'meat' ? 'Meat' : 'Milk';
}

export function formatWithdrawalLine(withdrawal: ActiveWithdrawal, dateFormat: AppDateFormat) {
  const days = withdrawal.daysRemaining === 1 ? '1 day left' : `${withdrawal.daysRemaining} days left`;
  return `${withdrawalKindLabel(withdrawal.kind)} withdrawal until ${formatDateForDisplay(
    withdrawal.clearDate,
    dateFormat,
  )} · ${days}`;
}

/** The furthest-out period per kind across several animals or records. */
export function latestPerKind(entries: ActiveWithdrawal[]): ActiveWithdrawal[] {
  const byKind = new Map<WithdrawalKind, ActiveWithdrawal>();

  entries.forEach((entry) => {
    const existing = byKind.get(entry.kind);

    if (!existing || entry.clearDate.getTime() > existing.clearDate.getTime()) {
      byKind.set(entry.kind, entry);
    }
  });

  // Meat first, milk second, always — the same order the animal's own screen
  // lists them in.
  return (['meat', 'milk'] as const)
    .map((kind) => byKind.get(kind))
    .filter((entry): entry is ActiveWithdrawal => Boolean(entry));
}

/**
 * Asked rather than refused, and kept here so both Add Record screens word it
 * the same way: a sale inside a withdrawal is not necessarily wrong — an animal
 * can be sold on to another keeper rather than into the food chain — so the
 * app's job is to make sure the keeper knows, not to overrule them.
 *
 * Covers milk as well as meat. Selling a cow still inside her milk withdrawal
 * does not end the risk, it hands it to a buyer who may milk her that evening,
 * and a prompt that stayed silent on it would be quieter than the animal's own
 * screen, which shows both.
 */
export function confirmSaleWithinWithdrawal(
  subject: string,
  withdrawals: ActiveWithdrawal[],
  dateFormat: AppDateFormat,
): Promise<boolean> {
  if (withdrawals.length === 0) {
    return Promise.resolve(true);
  }

  const clauses = withdrawals.map(
    (withdrawal) =>
      `for ${withdrawal.kind} until ${formatDateForDisplay(withdrawal.clearDate, dateFormat)}`,
  );

  return new Promise((resolve) => {
    Alert.alert(
      'Still within withdrawal',
      `${subject} is not clear ${clauses.join(', or ')}. Save this sale anyway?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Save anyway', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}
