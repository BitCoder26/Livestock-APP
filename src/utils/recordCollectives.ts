import { collectiveRecordTypeLabel, type CollectiveRecordType } from '../constants/records';
import type { Collective, CollectiveCountEventReason } from '../entities/collective';
import type { RecordEntry } from '../entities/record';

/**
 * Which collective record types move the head count, and in which direction.
 * A type that is absent from this map is descriptive only — a vaccination
 * does not change how many animals are in the shed.
 *
 * `Headcount` carries no fixed sign: it asks for the corrected total and the
 * delta falls out of that, so a stock take can move the count either way.
 * Its stored reason stays `Correction` — that is the honest word on the
 * flock's timeline, even where the button the keeper pressed said Headcount.
 */
export const COUNT_CHANGING_RECORD_TYPES: Partial<
  Record<CollectiveRecordType, { reason: CollectiveCountEventReason; sign: 1 | -1 | 0 }>
> = {
  Births: { reason: 'Birth', sign: 1 },
  Purchase: { reason: 'Purchase', sign: 1 },
  Deaths: { reason: 'Death', sign: -1 },
  Sale: { reason: 'Sale', sign: -1 },
  Headcount: { reason: 'Correction', sign: 0 },
};

/**
 * The one count-changing type that asks for a total rather than a quantity.
 * Kept as a named helper because three screens need to branch on it and
 * comparing to a bare string in each is how the two drift apart.
 */
export function isHeadcountRecord(type: string) {
  return type === 'Headcount';
}

/** Types that ask for a head count even though they do not change it. */
const COUNT_DESCRIBING_RECORD_TYPES: CollectiveRecordType[] = [
  'Vaccination',
  'Medication',
  'Health Check',
];

export function changesHeadCount(type: string) {
  return type in COUNT_CHANGING_RECORD_TYPES;
}

export function usesAffectedCount(type: string) {
  if (isHeadcountRecord(type)) {
    // It asks for the corrected total instead — "how many animals" would be
    // asking the same question twice, in a form where the two could disagree.
    return false;
  }

  return changesHeadCount(type) || COUNT_DESCRIBING_RECORD_TYPES.includes(type as CollectiveRecordType);
}

export function isCollectiveRecord(record: RecordEntry) {
  return Boolean(record.collectiveUid);
}

export function findRecordCollective(record: RecordEntry, collectives: Collective[]) {
  if (!record.collectiveUid) {
    return null;
  }

  return collectives.find((collective) => collective.uid === record.collectiveUid) ?? null;
}

/** Display label for a collective, preferring its live name over the snapshot. */
export function collectiveLabel(collective: Collective) {
  return collective.name.trim() || collective.id.trim() || 'Untitled group';
}

/**
 * The group named the way a keeper refers to it on paper: its own reference
 * first, with the friendly name in brackets after. Falls back to whichever
 * half exists, and to the snapshot taken when the record was saved where the
 * group itself has since gone.
 */
function collectiveReference(record: RecordEntry, collective: Collective | null) {
  const reference = (collective ? collective.id : record.collectiveId ?? '').trim();
  const name = (collective ? collective.name : record.collectiveName ?? '').trim();

  if (reference && name) {
    return `${reference} (${name})`;
  }

  return reference || name || 'Herd or flock';
}

/**
 * How many animals the record actually reached. Never the group's own size —
 * that is a different question, and answering it here would put a number on a
 * card that the record never claimed.
 */
function collectiveScope(record: RecordEntry) {
  if (isHeadcountRecord(record.type)) {
    // affectedCount is a signed delta here, not a quantity — reading it as one
    // would render "-12 animals". The typed total is the useful figure.
    return `counted ${record.newCount?.trim() || '0'}`;
  }

  // A move takes the group with it: the form cannot express a partial one, so
  // a number here would claim a precision that does not exist.
  if (record.type === 'Movement') {
    return 'All';
  }

  if (record.type === 'Weight') {
    const average = [record.weight?.trim(), record.weightUnit?.trim()].filter(Boolean).join(' ');
    const sample = record.sampleSize?.trim();

    return [sample ? `${sample} weighed` : '', average ? `${average} avg` : '']
      .filter(Boolean)
      .join(' · ');
  }

  // Every remaining type says how many animals it reached, and nothing else.
  // Never the group's own size: `How Many Animals` is optional on vaccinations,
  // medications and health checks, and standing the head count in when it is
  // blank claims the whole flock was treated when the keeper never said so.
  // Feed, Egg Production and Other have no such figure at all, so they say
  // nothing rather than borrowing one.
  const count = record.affectedCount?.trim();

  if (!count) {
    return '';
  }

  return `${count} ${count === '1' ? 'animal' : 'animals'}`;
}

/**
 * What the record card shows in place of the animal summary. Resolves the live
 * collective where it still exists, and falls back to the snapshot taken when
 * the record was saved where it does not.
 */
export function formatCollectiveSummary(record: RecordEntry, collectives: Collective[]) {
  const collective = findRecordCollective(record, collectives);
  const label = collectiveReference(record, collective);
  const scope = collectiveScope(record);

  return scope ? `${label} · ${scope}` : label;
}

/**
 * What a record calls itself on a card, in a timeline, anywhere it is listed
 * beside others. Two things make this more than `record.type`:
 *
 * - `Other` is the free-text type, so the title the keeper typed *is* the
 *   record's name — showing the literal word "Other" throws away the only
 *   thing that distinguishes one from another.
 * - `Births` reads as `Hatch` for a flock of birds. The stored type never
 *   varies, so a hatch and a lambing still group together in Reports; only
 *   the wording follows the species.
 */
export function recordTypeHeadline(record: RecordEntry) {
  if (record.type === 'Other') {
    const custom = record.recordTitle?.trim();

    if (custom) {
      return custom;
    }
  }

  return collectiveRecordTypeLabel(record.type, record.species);
}
