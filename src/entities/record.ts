import type { AnimalStatus, AnimalWeightUnit } from './animal';

export type RecordSpeciesTone = 'cow' | 'sheep' | 'pig' | 'goat' | 'neutral';

export type RecordAnimalStateSnapshot = {
  status?: AnimalStatus;
  farmUid?: string;
  farm?: string;
  locationUid?: string;
  location?: string;
  weight?: string;
  weightUnit?: AnimalWeightUnit;
};

export type RecordEntry = {
  id: string;
  date: string;
  /**
   * When the record was entered, as distinct from `date`, which is when the
   * thing it describes happened. The two drift apart the moment someone
   * back-dates a catch-up entry, which is exactly when "show me what I just
   * typed" stops being answerable from `date` alone.
   *
   * Optional because records stored before it existed have none; RecordsContext
   * backfills those from their position in storage on load.
   */
  createdAt?: string;
  animal: string;
  animalTag: string;
  /** Immutable animal references. `animalIds` contains editable tag snapshots. */
  animalUids?: string[];
  /** State captured before an applied record, used for safe deletion rollback. */
  animalStateBefore?: Record<string, RecordAnimalStateSnapshot>;
  animalIds?: string[];
  /**
   * Set when the record belongs to a herd or flock rather than to individually
   * identified animals. A collective record targets exactly one collective —
   * unlike `animalUids`, which is a list — because the head-count change a
   * record carries has to belong to a single group to mean anything.
   * `collectiveId`/`collectiveName` are display snapshots, same pattern as
   * `animalTag` next to `animalUids`.
   */
  collectiveUid?: string;
  collectiveId?: string;
  collectiveName?: string;
  /**
   * How many animals in the collective this record concerns. On the
   * count-changing types (Deaths, Births, Sale, Purchase, Headcount) this is
   * also what drives the collective's dated count event; on the rest it is
   * descriptive only ("120 birds treated").
   *
   * On `Headcount` alone it is a *signed* delta rather than a plain quantity,
   * because a stock take can find either more or fewer animals than the
   * running total. `newCount` holds the figure the keeper actually typed.
   */
  affectedCount?: string;
  /**
   * The corrected total entered on a `Headcount` record. Stored alongside the
   * delta rather than instead of it: the delta is what the collective's count
   * events need, but "I counted 588" is what the keeper wrote down and what
   * View Record has to show back, and re-deriving it later would need the
   * running total as it stood on that date.
   */
  newCount?: string;
  species: string;
  speciesTone: RecordSpeciesTone;
  title: string;
  details: string;
  type: string;
  medicine?: string;
  dose?: string;
  doseUnit?: string;
  route?: string;
  /**
   * Days before the treated animals may enter the food chain. Kept as two
   * separate figures because they are two different rules: `withdrawal` is the
   * meat withdrawal (the field predates the split, so existing records already
   * hold meat days), `milkWithdrawal` the dairy one. A single number could not
   * say which of the two it was, which is not a thing to leave to guesswork.
   */
  withdrawal?: string;
  milkWithdrawal?: string;
  batchNumber?: string;
  expiryDate?: string;
  imageUris?: string[];
  recordTitle?: string;
  weight?: string;
  weightUnit?: string;
  /**
   * How many animals were on the scales for a collective Weight record. A
   * flock is weighed by sample, not bird by bird, so the average means very
   * little without knowing whether it came off five birds or fifty.
   *
   * Deliberately the only sample field: the industry metric for the spread
   * around the average is flock uniformity (the share within ±10% of the mean,
   * or its coefficient of variation), which comes off weighing equipment, not
   * off a keeper writing down the lightest and heaviest bird by hand.
   */
  sampleSize?: string;
  /** Feed record: how much was fed or delivered, and of what. */
  feedQuantity?: string;
  feedUnit?: string;
  feedType?: string;
  /** Egg Production: collected, and how many of those were unsellable. */
  eggsCollected?: string;
  eggsDamaged?: string;
  /**
   * What this record cost, in `currencyCode`. Carried by Feed and by Other,
   * which together are how a keeper logs any spend that is not a Purchase —
   * bought feed, bedding, fencing, a vet call-out typed as a custom record.
   * Kept separate from `purchasePrice` so Reports can tell buying animals
   * apart from running costs.
   */
  cost?: string;
  causeOfDeath?: string;
  disposalMethod?: string;
  healthStatus?: string;
  conditionDiagnosis?: string;
  vetSeen?: 'Yes' | 'No';
  buyer?: string;
  salePrice?: string;
  destination?: string;
  seller?: string;
  purchasePrice?: string;
  currencyCode?: string;
  sourceFarm?: string;
  /** Immutable reference to the selected mother. `motherName` is a display snapshot. */
  motherUid?: string;
  motherName?: string;
  birthTagId?: string;
  birthSpecies?: string;
  birthBreed?: string;
  birthSex?: 'female' | 'male';
  birthWeight?: string;
  birthWeightUnit?: string;
  /** fromFarm/toFarm/fromLocation/toLocation are frozen display-text snapshots
   * taken when the record was saved — used as the fallback when the uid
   * below no longer resolves (the farm/location was deleted). Renaming a
   * farm/location never touches these; live display should prefer resolving
   * the *Uid fields to the entity's current name (see resolveFarmName /
   * resolveLocationName in utils/recordLocations.ts), same pattern as
   * animalUids vs. animal/animalTag. */
  fromFarm?: string;
  fromLocation?: string;
  toFarm?: string;
  toLocation?: string;
  fromFarmUid?: string;
  fromLocationUid?: string;
  toFarmUid?: string;
  toLocationUid?: string;
};
