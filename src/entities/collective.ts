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
  /** Every hand-made status change, dated, for the group's timeline. */
  statusHistory?: CollectiveStatusChange[];
  farmUid?: string;
  farm: string;
  locationUid?: string;
  location: string;
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
  /**
   * Management tags, the same ones animals carry — "Organic", "Winter shed".
   * A group can hold several. Kept as uid + resolved name in parallel arrays so
   * a label rename shows up here without rewriting every group.
   */
  labelUids?: string[];
  labels: string[];
  imageUris?: string[];
  /**
   * Whether the profile picture replaces the species icon on the herd card. A
   * group photo identifies far less than an individual animal's does — two
   * flocks of brown hens look alike — so the icon stays the default and this is
   * opt-in.
   */
  showImageOnCard?: boolean;
  /**
   * Dated changes to the head count, oldest first. The current count is derived
   * from these rather than stored: a mutable number would lose every previous
   * value, and "how many did I have on 1 December" is exactly the question an
   * annual inventory has to answer.
   */
  countEvents: CollectiveCountEvent[];
};

/**
 * A group is either in use or it is not — and unlike an animal, it is never
 * "sold" or "deceased" as a whole. Animals leave a flock by different routes
 * at different times; the flock itself just stops being one you keep.
 *
 * Deliberately never derived from records. An emptied flock is often only
 * between batches, and the keeper is the one who knows which.
 */
export type CollectiveStatus = 'Active' | 'Inactive';

/** A dated line for the group's timeline whenever its status is changed. */
export type CollectiveStatusChange = {
  id: string;
  date: string;
  status: CollectiveStatus;
};

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
  /**
   * Set when this change was entered as a record rather than typed straight
   * into the herd or flock. Editing or deleting that record rewrites the
   * event it owns — see `syncRecordCountEvent` in CollectivesContext — so the
   * head count can never drift away from the records that explain it.
   */
  recordId?: string;
};

export const COLLECTIVE_STATUSES: CollectiveStatus[] = ['Active', 'Inactive'];

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

/**
 * Counts a mixed list of collectives in the words that actually apply to it:
 * "1 flock", "3 herds", "4 herds & batches". Saying "herds & flocks" over a
 * list that holds neither — or over exactly one of something — reads as a
 * template that was never filled in.
 *
 * Terms are named in a fixed order rather than the order they happen to appear
 * in, so the same mix always reads the same way. Once more than one term is in
 * play every term is plural: the leading number counts the whole list, not any
 * one kind, so "2 herd & flock" would be describing something else.
 */
export function describeCollectiveCount(collectives: Collective[]) {
  const terms = new Set(collectives.map((collective) => collectiveTermForSpecies(collective.species)));
  const present = COLLECTIVE_TERM_ORDER.filter((term) => terms.has(term));
  const count = collectives.length;

  if (present.length === 0) {
    return `0 ${pluralizeCollectiveTerm('herd')} & ${pluralizeCollectiveTerm('flock')}`;
  }

  if (present.length === 1) {
    const term = present[0];
    return `${count} ${count === 1 ? term : pluralizeCollectiveTerm(term)}`;
  }

  const plurals = present.map(pluralizeCollectiveTerm);
  const last = plurals[plurals.length - 1];
  const rest = plurals.slice(0, -1);

  return `${count} ${rest.join(', ')} & ${last}`;
}

const COLLECTIVE_TERM_ORDER = ['herd', 'flock', 'batch'];

function pluralizeCollectiveTerm(term: string) {
  // "batch" is the only term whose plural is not a bare +s.
  return /(?:ch|sh|s|x|z)$/.test(term) ? `${term}es` : `${term}s`;
}

/**
 * What the group's own identifier is called, in the keeper's words: a flock of
 * hens has a flock ID, a pig unit a herd ID. Mirrors the animal side's
 * "Animal ID / Tag" rather than the anonymous "Reference" — a field named after
 * the thing it identifies is one the keeper knows what to type into.
 */
export function collectiveIdLabelForSpecies(species: string) {
  const term = collectiveTermForSpecies(species);
  return `${term.charAt(0).toUpperCase()}${term.slice(1)} ID`;
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
