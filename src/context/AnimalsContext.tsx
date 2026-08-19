import AsyncStorage from 'expo-sqlite/kv-store';
import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { Animal, AnimalStatusChange, AnimalTone } from '../entities/animal';
import { createUniqueUuid } from '../utils/createLocalId';
import { filterAccessibleImageUris } from '../utils/imageStorage';
import { type FarmEntity, type GroupEntity, type PaddockEntity, useSetup } from './SetupContext';

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
  /** Sets a status by hand and records why, for cases the three record types
   *  cannot express — lost, stolen, given away, or historical imports. */
  setAnimalStatusManually: (
    animalUid: string,
    change: Omit<AnimalStatusChange, 'id' | 'manual'>,
  ) => Promise<AnimalMutationResult>;
  getAnimalsSnapshot: () => Animal[];
  replaceAnimalsFromTransaction: (nextAnimals: Animal[]) => void;
};

const AnimalsContext = createContext<AnimalsContextValue | null>(null);
export const ANIMALS_STORAGE_KEY = 'livestockbook.animals.v1';

export function AnimalsProvider({ children }: PropsWithChildren) {
  const {
    farmEntities,
    paddockEntities,
    groupEntities,
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
                paddockEntities,
                groupEntities,
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
  }, [farmEntities, groupEntities, paddockEntities, setupLoaded]);

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
        setAnimalStatusManually: async (animalUid, change) => {
        const existing = animalsRef.current.find((item) => item.uid === animalUid);

        if (!existing) {
          return { ok: false, reason: 'not-found' };
        }

        const updated: Animal = {
          ...existing,
          status: change.status,
          statusHistory: [
            ...(existing.statusHistory ?? []),
            { ...change, id: createUniqueUuid(new Set()), manual: true },
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
  paddocks: PaddockEntity[],
  groups: GroupEntity[],
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
  const paddock = paddocks.find(
    (entry) =>
      (entry.uid === animal.paddockUid || equalsIgnoreCase(entry.name, animal.paddock)) &&
      (!farm?.uid || entry.farmUid === farm.uid || equalsIgnoreCase(entry.farm, farm.name)),
  );
  const group = groups.find(
    (entry) => entry.uid === animal.groupUid || equalsIgnoreCase(entry.name, animal.group),
  );

  return {
    ...animal,
    uid,
    farmUid: farm?.uid,
    paddockUid: paddock?.uid,
    groupUid: group?.uid,
    sex: animal.sex === 'male' ? 'male' : 'female',
    ageLabel: formatAgeLabel(animal.ageValue ?? '', animal.ageUnit ?? 'years old'),
    imageUris,
    showImageOnCard: imageUris.length > 0 && animal.showImageOnCard === true,
    tone: inferAnimalTone(animal.species),
    createdAt: isValidCreatedAt(animal.createdAt) ? animal.createdAt : synthesizeCreatedAt(index, total),
    // Animals stored before these fields existed won't have them at all.
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
      reason: typeof entry.reason === 'string' ? entry.reason : '',
      notes: typeof entry.notes === 'string' ? entry.notes : '',
      manual: entry.manual !== false,
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
