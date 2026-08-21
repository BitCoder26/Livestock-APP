import type { AppIconName } from '../components/AppIcon';

export const RECORD_TYPES = [
  'Movement',
  'Weight',
  'Death',
  'Birth',
  'Vaccination',
  'Medication',
  'Health Check',
  'Sale',
  'Purchase',
  'Other',
] as const;

/**
 * Record types offered when the record belongs to a herd or flock rather than
 * an individual animal. Deliberately not the same list as `RECORD_TYPES`: a
 * collective has no single identity, so deaths and births are plural and carry
 * a head count, weight is an average across a sample, and `Headcount` exists
 * for putting a miscounted total right.
 *
 * Ordered to mirror `RECORD_TYPES` above, so the chips sit in the same places
 * on both Add Record screens and the collective types that have no individual
 * counterpart (Feed, Egg Production, Headcount) gather at the end before the
 * catch-all.
 */
export const COLLECTIVE_RECORD_TYPES = [
  'Movement',
  'Weight',
  'Deaths',
  'Births',
  'Vaccination',
  'Medication',
  'Health Check',
  'Sale',
  'Purchase',
  'Feed',
  'Egg Production',
  'Headcount',
  'Other',
] as const;

export type CollectiveRecordType = (typeof COLLECTIVE_RECORD_TYPES)[number];

/**
 * Collective types that only make sense for birds, so a sheep keeper never
 * sees them. Everything else in `COLLECTIVE_RECORD_TYPES` is universal —
 * feed in particular, because bought feed is the largest input cost on most
 * farms whatever the species.
 */
const POULTRY_ONLY_RECORD_TYPES: CollectiveRecordType[] = ['Egg Production'];

/**
 * Species kept as birds. Drives both the poultry-only record types and the
 * Births/Hatch wording — a flock of layers hatches chicks, it does not give
 * birth. Matches the `SPECIES_OPTIONS` labels below.
 */
export const POULTRY_SPECIES = ['Chicken', 'Duck', 'Turkey', 'Goose', 'Ostrich'];

export function isPoultrySpecies(species: string) {
  return POULTRY_SPECIES.includes(species.trim());
}

/** The record types a given species' herd or flock should be offered. */
export function collectiveRecordTypesForSpecies(species: string): CollectiveRecordType[] {
  if (isPoultrySpecies(species)) {
    return [...COLLECTIVE_RECORD_TYPES];
  }

  return COLLECTIVE_RECORD_TYPES.filter((type) => !POULTRY_ONLY_RECORD_TYPES.includes(type));
}

/**
 * What a stored type is called on screen for this species. The type itself is
 * canonical and never varies — only the wording does, so a hatch and a lambing
 * still group together in Reports and in the records filter.
 */
export function collectiveRecordTypeLabel(type: string, species: string) {
  if (type === 'Births' && isPoultrySpecies(species)) {
    return 'Hatch';
  }

  return type;
}

/**
 * Types renamed after they shipped in a build. Stored records carry their type
 * as a plain string, so anything loaded from storage is mapped through this
 * before the app sees it — see `migrateRecordType` in RecordsContext.
 */
export const LEGACY_RECORD_TYPE_RENAMES: Record<string, string> = {
  'Average Weight': 'Weight',
  'Count Correction': 'Headcount',
  'Count Adjustment': 'Headcount',
};

/**
 * Every type a saved record can carry, for the screens that filter or group
 * across the whole record list and so have to offer both kinds. Order follows
 * `RECORD_TYPES` first so the familiar list stays where farmers expect it.
 */
export const ALL_RECORD_TYPES: string[] = Array.from(
  new Set<string>([...RECORD_TYPES, ...COLLECTIVE_RECORD_TYPES]),
);

export const SPECIES_OPTIONS: Array<{ icon: AppIconName; label: string }> = [
  { icon: 'cow-copy', label: 'Cattle' },
  { icon: 'sheep-black', label: 'Sheep' },
  { icon: 'pig', label: 'Pig' },
  { icon: 'goat', label: 'Goat' },
  { icon: 'chicken', label: 'Chicken' },
  { icon: 'duck', label: 'Duck' },
  { icon: 'turkey', label: 'Turkey' },
  { icon: 'goose', label: 'Goose' },
  { icon: 'donkey', label: 'Donkey' },
  { icon: 'horse', label: 'Horse' },
  { icon: 'bison', label: 'Buffalo' },
  { icon: 'rabbit', label: 'Rabbit' },
  { icon: 'alpaca', label: 'Alpaca' },
  { icon: 'llama', label: 'Llama' },
  { icon: 'camel', label: 'Camel' },
  { icon: 'ostrich', label: 'Ostrich' },
];
