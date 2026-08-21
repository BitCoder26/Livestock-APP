export type AnimalSex = 'female' | 'male';

export type AnimalStatus = 'Active' | 'Sold' | 'Deceased';

export type AnimalAgeUnit = 'days old' | 'months old' | 'years old';

export type AnimalWeightUnit = 'kg' | 'lb' | 'st';

export type AnimalTone = 'cow' | 'pig' | 'sheep' | 'goat' | 'poultry' | 'equine' | 'camelid' | 'neutral';

export type AnimalSource = 'Born on farm' | 'Purchased' | 'Transferred in' | 'Other';

/**
 * A dated status change. Status is otherwise the only piece of animal state
 * with no "when" — every weight, treatment and movement is dated, so an animal
 * sitting on Deceased should be able to say when. Kept on the animal rather
 * than as a RecordEntry: the Records tab logs what happened to the animal, not
 * changes to the bookkeeping, and a fix-up after a bulk import would otherwise
 * eat the free plan's record allowance.
 */
export type AnimalStatusChange = {
  id: string;
  date: string;
  status: AnimalStatus;
};

export type Animal = {
  /** Immutable internal identifier. The editable livestock tag is stored in `id`. */
  uid: string;
  id: string;
  /**
   * Electronic identifier — the number in the animal's EID tag or bolus, which
   * is a different number from the visual tag held in `id`. Both appear on
   * movement documents and both get checked at an assurance inspection, so one
   * field cannot stand in for the other.
   *
   * Individual identification only: collectives carry a herd or flock mark
   * instead, which is their `id`.
   */
  eid: string;
  species: string;
  sex: AnimalSex;
  name: string;
  ageValue: string;
  ageUnit: AnimalAgeUnit;
  ageLabel: string;
  breed: string;
  dateOfBirth: string;
  weight: string;
  weightUnit: AnimalWeightUnit;
  status: AnimalStatus;
  farmUid?: string;
  farm: string;
  /**
   * Wherever the animal is actually kept — a paddock, shed, pen, hutch or yard.
   * Stored as `paddock`/`paddockUid` before the Locations rename; see
   * normalizeStoredAnimal, which migrates each animal on first load.
   */
  locationUid?: string;
  location: string;
  /**
   * Freely-composable management tags — "Milking cows", "Mothers". An animal
   * carries as many as apply, which is what makes them useful for recording
   * against a set of animals that isn't a herd or flock. Uids are the live
   * link; the names beside them are the resolved display copy.
   *
   * Stored as `group`/`groupUid` (single) before the Labels rename — see
   * normalizeStoredAnimal, which migrates each animal on first load.
   */
  labelUids?: string[];
  labels: string[];
  /** How the animal joined the farm — informational, not derived. */
  source: AnimalSource | '';
  /** Date the animal joined this farm. Distinct from dateOfBirth for
   * purchased/transferred animals; optional for animals born on farm. */
  farmEntryDate: string;
  notes: string;
  imageUris?: string[];
  showImageOnCard?: boolean;
  tone: AnimalTone;
  /** ISO timestamp set once, at creation. Powers "recently/oldest added"
   * sorting — never touched again after that, including on edits. */
  createdAt?: string;
  /** Oldest first. Rendered in the animal's timeline, never in Records. */
  statusHistory?: AnimalStatusChange[];
};
