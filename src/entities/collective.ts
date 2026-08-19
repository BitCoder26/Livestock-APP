import { SPECIES_OPTIONS } from '../constants/records';
import type { AnimalWeightUnit } from './animal';

/**
 * A collective is a group of animals recorded as one unit rather than
 * individually — a laying flock, a batch of weaners. Distinct from the
 * `GroupEntity` in Setup, which labels animals that each already exist as an
 * individual record.
 *
 * Individual identification is species-dependent in law: cattle and most sheep
 * and goats are identified individually, while pigs carry a herd mark and
 * poultry are not individually identified at all. A collective is the correct
 * model for the latter, not a shortcut.
 */
export type Collective = {
  /** Immutable internal identifier. The editable reference is stored in `id`. */
  uid: string;
  /** Farmer-facing reference — a flock mark, batch number, or shed name. */
  id: string;
  name: string;
  species: string;
  breed: string;
  status: CollectiveStatus;
  farmUid?: string;
  farm: string;
  paddockUid?: string;
  paddock: string;
  /** Date the collective was established or acquired onto this farm. */
  startDate: string;
  /** When the animals were born or hatched — distinct from when they arrived. */
  birthDate: string;
  /** Where they came from: hatchery, market, another keeper. */
  supplier: string;
  /** Purchase cost per animal, in the profile's currency. */
  cost: string;
  /** Representative weight for the group rather than any one animal. */
  averageWeight: string;
  weightUnit: AnimalWeightUnit;
  /** Date it was closed out — sold, cleared, or finished. */
  endDate: string;
  purpose: string;
  notes: string;
  imageUris?: string[];
  /**
   * Dated changes to the head count, oldest first. The current count is derived
   * from these rather than stored: a mutable number would lose every previous
   * value, and "how many did I have on 1 December" is exactly the question an
   * annual inventory has to answer.
   */
  countEvents: CollectiveCountEvent[];
};

export type CollectiveStatus = 'Active' | 'Closed';

export type CollectiveCountEventReason =
  | 'Established'
  | 'Purchase'
  | 'Birth'
  | 'Sale'
  | 'Death'
  | 'Correction';

export type CollectiveCountEvent = {
  id: string;
  date: string;
  /** Signed: positive adds to the collective, negative removes from it. */
  delta: number;
  reason: CollectiveCountEventReason;
  notes: string;
};

export const COLLECTIVE_STATUSES: CollectiveStatus[] = ['Active', 'Closed'];

export const COLLECTIVE_COUNT_REASONS: CollectiveCountEventReason[] = [
  'Established',
  'Purchase',
  'Birth',
  'Sale',
  'Death',
  'Correction',
];

// Which collective noun each species takes. Farmers say "flock" for sheep and
// poultry and "herd" for cattle and pigs; farmed rabbits have no everyday
// collective, so anything unmapped falls back to the neutral "batch".
const SPECIES_COLLECTIVE_TERMS: Record<string, string> = {
  Cattle: 'herd',
  Pig: 'herd',
  Donkey: 'herd',
  Horse: 'herd',
  Llama: 'herd',
  Alpaca: 'herd',
  Camel: 'herd',
  Buffalo: 'herd',
  Sheep: 'flock',
  Goat: 'flock',
  Chicken: 'flock',
  Duck: 'flock',
  Turkey: 'flock',
  Goose: 'flock',
  Ostrich: 'flock',
};

export function collectiveTermForSpecies(species: string) {
  return SPECIES_COLLECTIVE_TERMS[species.trim()] ?? 'batch';
}

/** "Herd or flock" — the label used before a species has been chosen. */
export const COLLECTIVE_GENERIC_LABEL = 'Herd or flock';

export function isKnownSpecies(species: string) {
  return SPECIES_OPTIONS.some((option) => option.label === species);
}

/** Current head count: the sum of every count event. Never negative. */
export function getCollectiveCount(collective: Collective) {
  const total = collective.countEvents.reduce((sum, event) => sum + event.delta, 0);
  return Math.max(0, total);
}

/**
 * Head count as it stood on a given date — what an annual inventory needs.
 * Events dated after `asOf` are excluded.
 */
export function getCollectiveCountOn(collective: Collective, asOf: string) {
  const cutoff = Date.parse(asOf);

  if (Number.isNaN(cutoff)) {
    return getCollectiveCount(collective);
  }

  const total = collective.countEvents.reduce((sum, event) => {
    const eventTime = Date.parse(event.date);

    if (Number.isNaN(eventTime) || eventTime > cutoff) {
      return sum;
    }

    return sum + event.delta;
  }, 0);

  return Math.max(0, total);
}
