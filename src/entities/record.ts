import type { AnimalStatus, AnimalWeightUnit } from './animal';

export type RecordSpeciesTone = 'cow' | 'sheep' | 'pig' | 'goat' | 'neutral';

export type RecordAnimalStateSnapshot = {
  status?: AnimalStatus;
  farmUid?: string;
  farm?: string;
  paddockUid?: string;
  paddock?: string;
  weight?: string;
  weightUnit?: AnimalWeightUnit;
};

export type RecordEntry = {
  id: string;
  date: string;
  animal: string;
  animalTag: string;
  /** Immutable animal references. `animalIds` contains editable tag snapshots. */
  animalUids?: string[];
  /** State captured before an applied record, used for safe deletion rollback. */
  animalStateBefore?: Record<string, RecordAnimalStateSnapshot>;
  animalIds?: string[];
  species: string;
  speciesTone: RecordSpeciesTone;
  title: string;
  details: string;
  type: string;
  medicine?: string;
  dose?: string;
  doseUnit?: string;
  route?: string;
  withdrawal?: string;
  batchNumber?: string;
  expiryDate?: string;
  imageUris?: string[];
  recordTitle?: string;
  weight?: string;
  weightUnit?: string;
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
  /** fromFarm/toFarm/fromPaddock/toPaddock are frozen display-text snapshots
   * taken when the record was saved — used as the fallback when the uid
   * below no longer resolves (the farm/paddock was deleted). Renaming a
   * farm/paddock never touches these; live display should prefer resolving
   * the *Uid fields to the entity's current name (see resolveFarmName /
   * resolvePaddockName in utils/recordLocations.ts), same pattern as
   * animalUids vs. animal/animalTag. */
  fromFarm?: string;
  fromPaddock?: string;
  toFarm?: string;
  toPaddock?: string;
  fromFarmUid?: string;
  fromPaddockUid?: string;
  toFarmUid?: string;
  toPaddockUid?: string;
};
