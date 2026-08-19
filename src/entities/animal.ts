export type AnimalSex = 'female' | 'male';

export type AnimalStatus = 'Active' | 'Sold' | 'Deceased';

export type AnimalAgeUnit = 'days old' | 'months old' | 'years old';

export type AnimalWeightUnit = 'kg' | 'lb' | 'st';

export type AnimalTone = 'cow' | 'pig' | 'sheep' | 'goat' | 'poultry' | 'equine' | 'camelid' | 'neutral';

export type AnimalSource = 'Born on farm' | 'Purchased' | 'Transferred in' | 'Other';

/**
 * Why a status was set by hand. The three statuses cannot express what actually
 * happened — an animal that was lost, stolen or given away is none of Sold or
 * Deceased — so the reason carries the intent the status can't.
 */
export type AnimalStatusReason =
  | 'Sold'
  | 'Died'
  | 'Lost'
  | 'Stolen'
  | 'Given away'
  | 'Culled'
  | 'Historical record'
  | 'Correction';

export const ANIMAL_STATUS_REASONS: AnimalStatusReason[] = [
  'Sold',
  'Died',
  'Lost',
  'Stolen',
  'Given away',
  'Culled',
  'Historical record',
  'Correction',
];

/**
 * A change to an animal's status. Kept on the animal rather than as a
 * RecordEntry for two reasons: the Records tab logs what happened *to the
 * animal*, not changes to the bookkeeping, and a status fix-up after a bulk
 * import would otherwise burn through the free plan's record allowance.
 */
export type AnimalStatusChange = {
  id: string;
  /** When the status changed, not when it was typed in. */
  date: string;
  status: AnimalStatus;
  reason: AnimalStatusReason | '';
  notes: string;
  /** false when a Death/Sale/Purchase record produced this change. */
  manual: boolean;
};

export type Animal = {
  /** Immutable internal identifier. The editable livestock tag is stored in `id`. */
  uid: string;
  id: string;
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
  paddockUid?: string;
  paddock: string;
  groupUid?: string;
  group: string;
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
