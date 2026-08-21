import AsyncStorage from 'expo-sqlite/kv-store';
import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { Animal, AnimalStatus, AnimalStatusChange, AnimalTone } from '../entities/animal';
import { createUniqueUuid } from '../utils/createLocalId';
import { filterAccessibleImageUris } from '../utils/imageStorage';
import { type FarmEntity, type LabelEntity, type LocationEntity, useSetup } from './SetupContext';

export type CreateAnimalInput = Omit<Animal, 'uid' | 'tone' | 'ageLabel'>;

export type AnimalMutationResult =
  | { ok: true; animal: Animal }
  | { ok: false; reason: 'duplicate-tag' | 'invalid-tag' | 'not-found' | 'storage-error' };

export type AnimalDeleteResult =
  | { ok: true }
  | { ok: false; reason: 'storage-error' };

export type AnimalBatchSkip = {
  /** Position in the submitted list, so the caller can name the row. */
  index: number;
  tag: string;
  reason: 'duplicate-tag' | 'invalid-tag';
};

export type AnimalBatchResult =
  | { ok: true; added: Animal[]; skipped: AnimalBatchSkip[] }
  | { ok: false; reason: 'storage-error' };

type AnimalsContextValue = {
  animals: Animal[];
  isLoaded: boolean;
  addAnimal: (animal: CreateAnimalInput) => Promise<AnimalMutationResult>;
  addAnimalsBatch: (animals: CreateAnimalInput[]) => Promise<AnimalBatchResult>;
  updateAnimal: (animalUid: string, animal: CreateAnimalInput) => Promise<AnimalMutationResult>;
  deleteAnimal: (animalUid: string) => Promise<AnimalDeleteResult>;
  resetAnimals: () => Promise<AnimalDeleteResult>;
  prepareAnimalAddition: (animal: CreateAnimalInput) => AnimalMutationResult;
  prepareAnimalUpdate: (animalUid: string, animal: CreateAnimalInput) => AnimalMutationResult;
  /** Sets a status directly, for cases the Death/Sale/Purchase records cannot
   *  express — lost, stolen, given away, or a historical import. */
  setAnimalStatusManually: (
    animalUid: string,
    status: AnimalStatus,
  ) => Promise<AnimalMutationResult>;
  /**
   * Drops one dated line from the animal's status history. The animal's
   * current `status` is deliberately left alone — this removes a line from the
   * record of what happened, not the state itself, which the status dropdown
   * owns. Removing the line that set the current status therefore leaves the
   * animal on that status with nothing on the timeline explaining it.
   */
  removeAnimalStatusChange: (
    animalUid: string,
    changeId: string,
  ) => Promise<AnimalMutationResult>;
  getAnimalsSnapshot: () => Animal[];
  replaceAnimalsFromTransaction: (nextAnimals: Animal[]) => void;
};

const AnimalsContext = createContext<AnimalsContextValue | null>(null);
export const ANIMALS_STORAGE_KEY = 'livestockbook.animals.v1';

export function AnimalsProvider({ children }: PropsWithChildren) {
  const {
    farmEntities,
    locationEntities,
    labelEntities,
    isLoaded: setupLoaded,
  } = useSetup();
  const [animals, setAnimals] = useState<Animal[]>([]);
  const animalsRef = useRef<Animal[]>([]);
  const hasStartedRestore = useRef(false);
  const [hasLoadedStoredAnimals, setHasLoadedStoredAnimals] = useState(false);

  useEffect(() => {
    if (!setupLoaded || hasStartedRestore.current) {
      return;
    }
    hasStartedRestore.current = true;

    let isActive = true;

    const restoreAnimals = async () => {
      try {
        const storedAnimals = await AsyncStorage.getItem(ANIMALS_STORAGE_KEY);

        if (storedAnimals && isActive) {
          const parsedAnimals: unknown = JSON.parse(storedAnimals);

          if (Array.isArray(parsedAnimals)) {
            const usedUids = new Set<string>();
            const storedAnimalsList = parsedAnimals.filter(isStoredAnimal);
            const validAnimals = storedAnimalsList.map((animal, index) =>
              normalizeStoredAnimal(
                animal,
                usedUids,
                farmEntities,
                locationEntities,
                labelEntities,
                index,
                storedAnimalsList.length,
              ),
            );

            if (validAnimals.length > 0 || parsedAnimals.length === 0) {
              animalsRef.current = validAnimals;
              setAnimals(validAnimals);
              await AsyncStorage.setItem(ANIMALS_STORAGE_KEY, JSON.stringify(validAnimals));
            }
          }
        }
      } catch {
        // Keep the initial animals if local storage cannot be read.
      } finally {
        if (isActive) {
          setHasLoadedStoredAnimals(true);
        }
      }
    };

    void restoreAnimals();

    return () => {
      isActive = false;
    };
  }, [farmEntities, labelEntities, locationEntities, setupLoaded]);

  const value = useMemo<AnimalsContextValue>(
    () => {
      const replaceAnimals = (nextAnimals: Animal[]) => {
        animalsRef.current = nextAnimals;
        setAnimals(nextAnimals);
      };

      const persistAndReplaceAnimals = async (nextAnimals: Animal[]) => {
        try {
          await AsyncStorage.setItem(ANIMALS_STORAGE_KEY, JSON.stringify(nextAnimals));
        } catch {
          return false;
        }

        replaceAnimals(nextAnimals);
        return true;
      };

      const prepareAnimalAddition = (animal: CreateAnimalInput): AnimalMutationResult => {
        const current = animalsRef.current;

        if (!animal.id.trim()) {
          return { ok: false, reason: 'invalid-tag' };
        }

        if (hasDuplicateTag(current, animal.id)) {
          return { ok: false, reason: 'duplicate-tag' };
        }

        return {
          ok: true,
          animal: buildAnimal(
            // Stamp createdAt once, here, rather than trusting the caller to
            // supply it — it should only ever be set at true creation time.
            { ...animal, createdAt: animal.createdAt ?? new Date().toISOString() },
            createUniqueUuid(current.map((entry) => entry.uid)),
          ),
        };
      };

      const prepareAnimalUpdate = (animalUid: string, animal: CreateAnimalInput): AnimalMutationResult => {
        const current = animalsRef.current;
        const existing = current.find((entry) => entry.uid === animalUid);

        if (!existing) {
          return { ok: false, reason: 'not-found' };
        }

        if (!animal.id.trim()) {
          return { ok: false, reason: 'invalid-tag' };
        }

        if (hasDuplicateTag(current, animal.id, animalUid)) {
          return { ok: false, reason: 'duplicate-tag' };
        }

        // Edits never change createdAt, regardless of what the form sends —
        // it always keeps whatever it was stamped with at creation.
        return { ok: true, animal: buildAnimal({ ...animal, createdAt: existing.createdAt }, existing.uid) };
      };

      return {
        animals,
        isLoaded: hasLoadedStoredAnimals,
        prepareAnimalAddition,
        prepareAnimalUpdate,
        setAnimalStatusManually: async (animalUid, status) => {
        const existing = animalsRef.current.find((item) => item.uid === animalUid);

        if (!existing) {
          return { ok: false, reason: 'not-found' };
        }

        // Picking the status the animal already has is a no-op, not an event —
        // it shouldn't leave a "Marked Active" line on the timeline.
        if (existing.status === status) {
          return { ok: true, animal: existing };
        }

        const updated: Animal = {
          ...existing,
          status,
          statusHistory: [
            ...(existing.statusHistory ?? []),
            {
              id: createUniqueUuid(new Set()),
              date: new Date().toISOString().slice(0, 10),
              status,
            },
          ],
        };
        const next = animalsRef.current.map((item) =>
          item.uid === animalUid ? updated : item,
        );

        if (!(await persistAndReplaceAnimals(next))) {
          return { ok: false, reason: 'storage-error' };
        }

        return { ok: true, animal: updated };
      },
      removeAnimalStatusChange: async (animalUid, changeId) => {
        const existing = animalsRef.current.find((item) => item.uid === animalUid);

        if (!existing) {
          return { ok: false, reason: 'not-found' };
        }

        const statusHistory = (existing.statusHistory ?? []).filter(
          (change) => change.id !== changeId,
        );

        if (statusHistory.length === (existing.statusHistory ?? []).length) {
          return { ok: true, animal: existing };
        }

        const updated: Animal = { ...existing, statusHistory };
        const next = animalsRef.current.map((item) => (item.uid === animalUid ? updated : item));

        if (!(await persistAndReplaceAnimals(next))) {
          return { ok: false, reason: 'storage-error' };
        }

        return { ok: true, animal: updated };
      },
      getAnimalsSnapshot: () => animalsRef.current,
        replaceAnimalsFromTransaction: replaceAnimals,
        addAnimal: async (animal) => {
          const result = prepareAnimalAddition(animal);

          if (result.ok) {
            const didPersist = await persistAndReplaceAnimals([result.animal, ...animalsRef.current]);

            if (!didPersist) {
              return { ok: false, reason: 'storage-error' };
            }
          }

          return result;
        },
        // Import adds hundreds of animals at once. Doing that through
        // addAnimal would mean one AsyncStorage write and one state update per
        // animal, and would leave the register half-filled if a write failed
        // partway. This validates the whole list against the accumulating set
        // — so duplicates inside the batch are caught, not just duplicates of
        // what is already stored — and then writes once.
        addAnimalsBatch: async (inputs) => {
          const current = animalsRef.current;
          const usedUids = new Set(current.map((entry) => entry.uid));
          const usedTags = new Set(current.map((entry) => normalizeTag(entry.id)));
          const added: Animal[] = [];
          const skipped: AnimalBatchSkip[] = [];
          // Timestamps step backwards through the list so the first row sorts
          // as the most recent. A single shared timestamp would leave
          // "Recently Added" with no order at all inside the batch.
          const baseTime = Date.now();

          inputs.forEach((input, index) => {
            const tag = input.id.trim();

            if (!tag) {
              skipped.push({ index, tag: input.id, reason: 'invalid-tag' });
              return;
            }

            const normalizedTag = normalizeTag(tag);

            if (usedTags.has(normalizedTag)) {
              skipped.push({ index, tag, reason: 'duplicate-tag' });
              return;
            }

            usedTags.add(normalizedTag);
            const uid = createUniqueUuid(usedUids);
            usedUids.add(uid);
            added.push(
              buildAnimal(
                { ...input, createdAt: input.createdAt ?? new Date(baseTime - index).toISOString() },
                uid,
              ),
            );
          });

          if (added.length === 0) {
            return { ok: true, added, skipped };
          }

          const didPersist = await persistAndReplaceAnimals([...added, ...current]);

          if (!didPersist) {
            return { ok: false, reason: 'storage-error' };
          }

          return { ok: true, added, skipped };
        },
        updateAnimal: async (animalUid, animal) => {
          const result = prepareAnimalUpdate(animalUid, animal);

          if (result.ok) {
            const didPersist = await persistAndReplaceAnimals(
              animalsRef.current.map((entry) =>
                entry.uid === animalUid ? result.animal : entry,
              ),
            );

            if (!didPersist) {
              return { ok: false, reason: 'storage-error' };
            }
          }

          return result;
        },
        deleteAnimal: async (animalUid) => {
          const didPersist = await persistAndReplaceAnimals(
            animalsRef.current.filter((entry) => entry.uid !== animalUid),
          );
          return didPersist ? { ok: true } : { ok: false, reason: 'storage-error' };
        },
        resetAnimals: async () => {
          const didPersist = await persistAndReplaceAnimals([]);
          return didPersist ? { ok: true } : { ok: false, reason: 'storage-error' };
        },
      };
    },
    [animals, hasLoadedStoredAnimals],
  );

  return <AnimalsContext.Provider value={value}>{children}</AnimalsContext.Provider>;
}

export function useAnimals() {
  const context = useContext(AnimalsContext);

  if (!context) {
    throw new Error('useAnimals must be used within an AnimalsProvider');
  }

  return context;
}

function formatAgeLabel(value: string, unit: Animal['ageUnit']) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return '';
  }

  return `${trimmedValue} ${unit}`.trim();
}

function isValidCreatedAt(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

// Animals stored before createdAt existed (or restored from data that never
// set it) have no real timestamp to sort by, so "Recently/Oldest Added"
// collapses them all into the same bucket. Back-fill one derived from the
// animal's position in the stored list instead — storage is always
// newest-first (new animals are unshifted onto the front, see addAnimal),
// so index 0 gets the latest synthetic time and the last index gets the
// earliest, preserving whatever order already existed. These values are
// tiny relative to a real Date.now() timestamp, so any animal with a
// genuine createdAt still always sorts as more recent than a backfilled one.
function synthesizeCreatedAt(index: number, total: number): string {
  const syntheticMs = (total - index) * 1000;
  return new Date(syntheticMs).toISOString();
}

export function isStoredAnimal(value: unknown): value is Animal {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const animal = value as Partial<Animal>;
  return typeof animal.id === 'string' && typeof animal.species === 'string';
}

export function normalizeStoredAnimal(
  animal: Animal,
  usedUids: Set<string>,
  farms: FarmEntity[],
  locations: LocationEntity[],
  labels: LabelEntity[],
  // Position of this animal in the stored (newest-first) list, used to
  // backfill a real createdAt for animals that never had one — see
  // synthesizeCreatedAt below.
  index: number,
  total: number,
): Animal {
  const imageUris = filterAccessibleImageUris(animal.imageUris);
  const storedUid = typeof animal.uid === 'string' ? animal.uid.trim() : '';
  const uid = storedUid && !usedUids.has(storedUid)
    ? storedUid
    : createUniqueUuid(usedUids);
  usedUids.add(uid);
  const farm = farms.find((entry) => entry.uid === animal.farmUid || equalsIgnoreCase(entry.name, animal.farm));
  // Locations were `paddock`/`paddockUid` before the rename; fall back to the
  // old keys so an animal saved earlier keeps where it is kept.
  const legacyLocation = animal as Partial<Animal> & { paddock?: string; paddockUid?: string };
  const storedLocationUid = animal.locationUid ?? legacyLocation.paddockUid;
  const storedLocationName = animal.location ?? legacyLocation.paddock ?? '';

  const location = locations.find(
    (entry) =>
      (entry.uid === storedLocationUid || equalsIgnoreCase(entry.name, storedLocationName)) &&
      (!farm?.uid || entry.farmUid === farm.uid || equalsIgnoreCase(entry.farm, farm.name)),
  );
  // Labels were a single `group`/`groupUid` before the rename. Read the new
  // shape when present, otherwise fold the one stored group into a list — each
  // animal migrates once, on the first load after updating.
  const legacy = animal as Partial<Animal> & { group?: string; groupUid?: string };
  const storedLabelUids = Array.isArray(animal.labelUids)
    ? animal.labelUids
    : legacy.groupUid
      ? [legacy.groupUid]
      : [];
  const storedLabelNames = Array.isArray(animal.labels)
    ? animal.labels
    : typeof legacy.group === 'string' && legacy.group.trim()
      ? [legacy.group]
      : [];

  // Resolve each stored label against live setup, uid first so a rename shows
  // up immediately. Deduplicated by uid, since two stored entries can resolve
  // to the same label once one of them matched only by name.
  const resolvedLabels: LabelEntity[] = [];
  const seenLabelKeys = new Set<string>();

  for (const [index, name] of storedLabelNames.entries()) {
    const uid = storedLabelUids[index];
    const match = labels.find(
      (entry) => (uid && entry.uid === uid) || equalsIgnoreCase(entry.name, name),
    );
    const key = match?.uid ?? name.trim().toLowerCase();

    if (!key || seenLabelKeys.has(key)) {
      continue;
    }

    seenLabelKeys.add(key);
    resolvedLabels.push(match ?? { name: name.trim(), animals: '', notes: '' });
  }

  // Uids with no name alongside them — possible only in hand-edited storage.
  for (const uid of storedLabelUids.slice(storedLabelNames.length)) {
    const match = labels.find((entry) => entry.uid === uid);

    if (match && !seenLabelKeys.has(match.uid ?? '')) {
      seenLabelKeys.add(match.uid ?? '');
      resolvedLabels.push(match);
    }
  }

  return {
    ...animal,
    uid,
    farmUid: farm?.uid,
    locationUid: location?.uid,
    location: location?.name ?? storedLocationName,
    labelUids: resolvedLabels.map((entry) => entry.uid).filter((uid): uid is string => !!uid),
    labels: resolvedLabels.map((entry) => entry.name),
    sex: animal.sex === 'male' ? 'male' : 'female',
    ageLabel: formatAgeLabel(animal.ageValue ?? '', animal.ageUnit ?? 'years old'),
    imageUris,
    showImageOnCard: imageUris.length > 0 && animal.showImageOnCard === true,
    tone: inferAnimalTone(animal.species),
    createdAt: isValidCreatedAt(animal.createdAt) ? animal.createdAt : synthesizeCreatedAt(index, total),
    // Animals stored before these fields existed won't have them at all.
    eid: animal.eid ?? '',
    source: animal.source ?? '',
    farmEntryDate: animal.farmEntryDate ?? '',
    statusHistory: normalizeStatusHistory(animal.statusHistory),
  };
}

function normalizeStatusHistory(value: unknown): AnimalStatusChange[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is AnimalStatusChange => !!entry && typeof entry === 'object')
    .map((entry) => ({
      id: typeof entry.id === 'string' && entry.id ? entry.id : createUniqueUuid(new Set()),
      date: typeof entry.date === 'string' ? entry.date : '',
      status: entry.status === 'Sold' || entry.status === 'Deceased' ? entry.status : 'Active',
    }));
}

function buildAnimal(animal: CreateAnimalInput, uid: string): Animal {
  return {
    ...animal,
    uid,
    id: animal.id.trim(),
    ageLabel: formatAgeLabel(animal.ageValue, animal.ageUnit),
    tone: inferAnimalTone(animal.species),
  };
}

function hasDuplicateTag(animals: Animal[], tag: string, excludingUid?: string) {
  const normalizedTag = normalizeTag(tag);
  return animals.some(
    (animal) => animal.uid !== excludingUid && normalizeTag(animal.id) === normalizedTag,
  );
}

function equalsIgnoreCase(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase();
}

function inferAnimalTone(species: string): AnimalTone {
  const normalized = species.toLowerCase();

  if (normalized.includes('cow') || normalized.includes('cattle') || normalized.includes('buffalo')) {
    return 'cow';
  }

  if (normalized.includes('pig')) {
    return 'pig';
  }

  if (normalized.includes('sheep')) {
    return 'sheep';
  }

  if (normalized.includes('goat')) {
    return 'goat';
  }

  if (
    normalized.includes('chicken') ||
    normalized.includes('duck') ||
    normalized.includes('turkey') ||
    normalized.includes('goose') ||
    normalized.includes('ostrich')
  ) {
    return 'poultry';
  }

  if (
    normalized.includes('horse') ||
    normalized.includes('donkey')
  ) {
    return 'equine';
  }

  if (
    normalized.includes('llama') ||
    normalized.includes('alpaca') ||
    normalized.includes('camel')
  ) {
    return 'camelid';
  }

  return 'neutral';
}
