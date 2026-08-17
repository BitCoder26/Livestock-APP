import AsyncStorage from 'expo-sqlite/kv-store';
import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  ANIMALS_STORAGE_KEY,
  type AnimalMutationResult,
  type CreateAnimalInput,
  useAnimals,
} from './AnimalsContext';
import type { Animal } from '../entities/animal';
import type { RecordEntry, RecordSpeciesTone } from '../entities/record';
import { createUuid } from '../utils/createLocalId';
import { parseStoredDate } from '../utils/dateFormat';
import { findRecordAnimals, resolveRecordAnimalUids } from '../utils/recordAnimals';
import { resolveFarmName, resolvePaddockName } from '../utils/recordLocations';
import { type FarmEntity, type PaddockEntity, useSetup } from './SetupContext';

export type CreateRecordInput = Omit<RecordEntry, 'id' | 'speciesTone'>;

type AnimalMutationFailureReason = Extract<AnimalMutationResult, { ok: false }>['reason'];

type BirthTransactionResult =
  | { ok: true; animal: Animal; record: RecordEntry }
  | { ok: false; reason: AnimalMutationFailureReason | 'record-not-found' | 'storage-error' | 'transaction-in-progress' };

export type RecordMutationResult =
  | { ok: true; record?: RecordEntry }
  | { ok: false; reason: 'record-not-found' | 'storage-error' | 'transaction-in-progress' };

// Describes an animal whose derived current weight/location/status would
// change as a side effect of editing or deleting a record — surfaced so the
// UI can warn before silently changing what an animal card shows.
export type RecordImpactChange = {
  animalUid: string;
  animalLabel: string;
  dimension: 'weight' | 'location' | 'status';
  before: string;
  after: string;
};

// Result of looking up an animal's Movement-derived location as of a given
// date. 'found' means an actual prior Movement record was located. The two
// "nothing found" cases are deliberately distinguished because they call for
// different fallbacks: an animal with no Movement history at all has never
// had its farm/paddock overwritten by rebuildAnimalsState, so its current
// `farm`/`paddock` fields still hold the true original value — safe to use
// as the answer. An animal that *does* have Movement history, just none
// dated on/before the date in question, has no reliable answer at all (its
// pre-history location was already overwritten by whichever Movement came
// first) — callers should treat that as "can't verify" rather than guess.
export type AnimalLocationAsOfResult =
  | { status: 'found'; farm: string; paddock: string }
  | { status: 'no-prior-movement' }
  | { status: 'no-movement-history' };

export type RecordFilters = {
  searchQuery: string;
  startDate: string | null;
  endDate: string | null;
  species: string[];
  recordTypes: string[];
  farms: string[];
  paddocks: string[];
  animalIdQuery: string;
  animalNameQuery: string;
};

type RecordsContextValue = {
  records: RecordEntry[];
  isLoaded: boolean;
  filteredRecords: RecordEntry[];
  filters: RecordFilters;
  setFilters: (filters: RecordFilters) => void;
  clearFilters: () => void;
  addRecord: (record: CreateRecordInput) => Promise<RecordMutationResult>;
  updateRecord: (recordId: string, record: CreateRecordInput) => Promise<RecordMutationResult>;
  deleteRecord: (recordId: string) => Promise<RecordMutationResult>;
  resetRecords: () => Promise<RecordMutationResult>;
  previewUpdateRecordImpact: (recordId: string, record: CreateRecordInput) => RecordImpactChange[];
  previewDeleteRecordImpact: (recordId: string) => RecordImpactChange[];
  // Point-in-time location lookup for validating a Movement record's "From"
  // location against history as of that record's own date, rather than the
  // animal's current (most-recent) location — see AnimalLocationAsOfResult.
  previewAnimalLocationAsOf: (
    animalUid: string,
    date: string,
    excludeRecordId?: string,
  ) => AnimalLocationAsOfResult;
  addBirthRecord: (record: CreateRecordInput, newborn: CreateAnimalInput) => Promise<BirthTransactionResult>;
  updateBirthRecord: (
    recordId: string,
    record: CreateRecordInput,
    newbornUid: string,
    newborn: CreateAnimalInput,
  ) => Promise<BirthTransactionResult>;
  // Restore-only escape hatches (see AccountContext.restoreFromBackup),
  // mirroring AnimalsContext's getAnimalsSnapshot/replaceAnimalsFromTransaction:
  // the caller is responsible for persisting nextRecords itself (as part of a
  // larger cross-store transaction) before syncing this context's state.
  getRecordsSnapshot: () => RecordEntry[];
  replaceRecordsFromTransaction: (nextRecords: RecordEntry[]) => void;
};

const RecordsContext = createContext<RecordsContextValue | null>(null);
export const RECORDS_STORAGE_KEY = 'livestockbook.records.v1';

export const DEFAULT_RECORD_FILTERS: RecordFilters = {
  searchQuery: '',
  startDate: null,
  endDate: null,
  species: [],
  recordTypes: [],
  farms: [],
  paddocks: [],
  animalIdQuery: '',
  animalNameQuery: '',
};

export function RecordsProvider({ children }: PropsWithChildren) {
  const { farmEntities, paddockEntities } = useSetup();
  const {
    animals,
    isLoaded: animalsLoaded,
    getAnimalsSnapshot,
    prepareAnimalAddition,
    prepareAnimalUpdate,
    replaceAnimalsFromTransaction,
  } = useAnimals();
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const recordsRef = useRef<RecordEntry[]>([]);
  const hasStartedRestore = useRef(false);
  const recordTransactionInProgress = useRef(false);
  const [filters, setFilters] = useState<RecordFilters>(DEFAULT_RECORD_FILTERS);
  const [hasLoadedStoredRecords, setHasLoadedStoredRecords] = useState(false);

  useEffect(() => {
    if (!animalsLoaded || hasStartedRestore.current) {
      return;
    }
    hasStartedRestore.current = true;

    let isActive = true;

    const restoreRecords = async () => {
      try {
        const storedRecords = await AsyncStorage.getItem(RECORDS_STORAGE_KEY);

        if (storedRecords && isActive) {
          const parsedRecords: unknown = JSON.parse(storedRecords);

          if (Array.isArray(parsedRecords)) {
            const validRecords = ensureUniqueRecordIds(parsedRecords.filter(isStoredRecord)).map((record) => {
              if (record.animalUids) {
                return record;
              }

              const animalUids = resolveRecordAnimalUids(record, animals);
              return animalUids.length > 0 ? { ...record, animalUids } : record;
            });
            recordsRef.current = validRecords;
            setRecords(validRecords);
            await AsyncStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(validRecords));
          }
        }
      } catch {
        // Keep the recovered records if local storage cannot be read.
      } finally {
        if (isActive) {
          setHasLoadedStoredRecords(true);
        }
      }
    };

    void restoreRecords();

    return () => {
      isActive = false;
    };
  }, [animals, animalsLoaded]);

  const sortedRecords = useMemo(
    () => [...records].sort((left, right) => getRecordTimestamp(right.date) - getRecordTimestamp(left.date)),
    [records],
  );

  const filteredRecords = useMemo(() => {
    const lookup = buildAnimalLookup(animals);
    return sortedRecords.filter((record) => recordMatchesFilters(record, filters, animals, lookup));
  }, [animals, filters, sortedRecords]);

  const value = useMemo<RecordsContextValue>(
    () => {
      const replaceRecords = (nextRecords: RecordEntry[]) => {
        recordsRef.current = nextRecords;
        setRecords(nextRecords);
      };

      const buildNewRecord = (record: CreateRecordInput) => {
        let id = createUuid();
        const existingIds = new Set(recordsRef.current.map((entry) => entry.id));

        while (existingIds.has(id)) {
          id = createUuid();
        }

        return buildRecord(record, id);
      };

      const addBirthRecord = async (
        record: CreateRecordInput,
        newborn: CreateAnimalInput,
      ): Promise<BirthTransactionResult> => {
        if (recordTransactionInProgress.current) {
          return { ok: false, reason: 'transaction-in-progress' };
        }

        recordTransactionInProgress.current = true;
        const preparedAnimal = prepareAnimalAddition(newborn);

        if (!preparedAnimal.ok) {
          recordTransactionInProgress.current = false;
          return preparedAnimal;
        }

        const relatedRecord = buildNewRecord(withAnimalRelation(record, preparedAnimal.animal));
        const nextAnimals = [preparedAnimal.animal, ...getAnimalsSnapshot()];
        const nextRecords = [relatedRecord, ...recordsRef.current];

        try {
          await AsyncStorage.multiSet([
            [ANIMALS_STORAGE_KEY, JSON.stringify(nextAnimals)],
            [RECORDS_STORAGE_KEY, JSON.stringify(nextRecords)],
          ]);
        } catch {
          recordTransactionInProgress.current = false;
          return { ok: false, reason: 'storage-error' };
        }

        replaceAnimalsFromTransaction(nextAnimals);
        replaceRecords(nextRecords);
        recordTransactionInProgress.current = false;
        return { ok: true, animal: preparedAnimal.animal, record: relatedRecord };
      };

      const updateBirthRecord = async (
        recordId: string,
        record: CreateRecordInput,
        newbornUid: string,
        newborn: CreateAnimalInput,
      ): Promise<BirthTransactionResult> => {
        if (recordTransactionInProgress.current) {
          return { ok: false, reason: 'transaction-in-progress' };
        }

        recordTransactionInProgress.current = true;
        const existingRecord = recordsRef.current.find((entry) => entry.id === recordId);

        if (!existingRecord) {
          recordTransactionInProgress.current = false;
          return { ok: false, reason: 'record-not-found' };
        }

        const preparedAnimal = prepareAnimalUpdate(newbornUid, newborn);

        if (!preparedAnimal.ok) {
          recordTransactionInProgress.current = false;
          return preparedAnimal;
        }

        const relatedRecord = buildRecord(
          withAnimalRelation(record, preparedAnimal.animal),
          existingRecord.id,
        );
        const nextAnimals = getAnimalsSnapshot().map((animal) =>
          animal.uid === newbornUid ? preparedAnimal.animal : animal,
        );
        const nextRecords = recordsRef.current.map((entry) =>
          entry.id === recordId ? relatedRecord : entry,
        );

        try {
          await AsyncStorage.multiSet([
            [ANIMALS_STORAGE_KEY, JSON.stringify(nextAnimals)],
            [RECORDS_STORAGE_KEY, JSON.stringify(nextRecords)],
          ]);
        } catch {
          recordTransactionInProgress.current = false;
          return { ok: false, reason: 'storage-error' };
        }

        replaceAnimalsFromTransaction(nextAnimals);
        replaceRecords(nextRecords);
        recordTransactionInProgress.current = false;
        return { ok: true, animal: preparedAnimal.animal, record: relatedRecord };
      };

      return {
        records: sortedRecords,
        isLoaded: hasLoadedStoredRecords,
        filteredRecords,
        filters,
        setFilters,
        clearFilters: () => setFilters(DEFAULT_RECORD_FILTERS),
        addBirthRecord,
        updateBirthRecord,
        getRecordsSnapshot: () => recordsRef.current,
        replaceRecordsFromTransaction: replaceRecords,
        addRecord: async (record) => {
          if (recordTransactionInProgress.current) {
            return { ok: false, reason: 'transaction-in-progress' };
          }

          recordTransactionInProgress.current = true;
          const nextRecord = buildNewRecord(record);
          const nextRecords = [nextRecord, ...recordsRef.current];
          const nextAnimals = rebuildAnimalsState(
            nextRecord.animalUids ?? [],
            nextRecords,
            getAnimalsSnapshot(),
            farmEntities,
            paddockEntities,
          );

          try {
            await AsyncStorage.multiSet([
              [ANIMALS_STORAGE_KEY, JSON.stringify(nextAnimals)],
              [RECORDS_STORAGE_KEY, JSON.stringify(nextRecords)],
            ]);
          } catch {
            recordTransactionInProgress.current = false;
            return { ok: false, reason: 'storage-error' };
          }

          replaceAnimalsFromTransaction(nextAnimals);
          replaceRecords(nextRecords);
          recordTransactionInProgress.current = false;
          return { ok: true, record: nextRecord };
        },
        updateRecord: async (recordId, record) => {
          if (recordTransactionInProgress.current) {
            return { ok: false, reason: 'transaction-in-progress' };
          }

          const existingRecord = recordsRef.current.find((entry) => entry.id === recordId);
          if (!existingRecord) {
            return { ok: false, reason: 'record-not-found' };
          }

          recordTransactionInProgress.current = true;
          const nextRecord = buildRecord(record, recordId);
          const nextRecords = recordsRef.current.map((entry) =>
            entry.id === recordId ? nextRecord : entry,
          );
          // Rebuild every animal that was on the record either before or after
          // the edit (union, not just the new list) from the full remaining
          // record history, so the animal always reflects whichever record is
          // genuinely the latest by date — not just "undo what this record did".
          const affectedUids = Array.from(
            new Set([...(existingRecord.animalUids ?? []), ...(nextRecord.animalUids ?? [])]),
          );
          const nextAnimals = rebuildAnimalsState(
            affectedUids,
            nextRecords,
            getAnimalsSnapshot(),
            farmEntities,
            paddockEntities,
          );

          try {
            await AsyncStorage.multiSet([
              [ANIMALS_STORAGE_KEY, JSON.stringify(nextAnimals)],
              [RECORDS_STORAGE_KEY, JSON.stringify(nextRecords)],
            ]);
          } catch {
            recordTransactionInProgress.current = false;
            return { ok: false, reason: 'storage-error' };
          }

          replaceAnimalsFromTransaction(nextAnimals);
          replaceRecords(nextRecords);
          recordTransactionInProgress.current = false;
          return { ok: true, record: nextRecord };
        },
        deleteRecord: async (recordId) => {
          if (recordTransactionInProgress.current) {
            return { ok: false, reason: 'transaction-in-progress' };
          }

          const existingRecord = recordsRef.current.find((entry) => entry.id === recordId);
          if (!existingRecord) {
            return { ok: false, reason: 'record-not-found' };
          }

          recordTransactionInProgress.current = true;
          const nextRecords = recordsRef.current.filter((entry) => entry.id !== recordId);
          const nextAnimals = rebuildAnimalsState(
            existingRecord.animalUids ?? [],
            nextRecords,
            getAnimalsSnapshot(),
            farmEntities,
            paddockEntities,
          );

          try {
            await AsyncStorage.multiSet([
              [ANIMALS_STORAGE_KEY, JSON.stringify(nextAnimals)],
              [RECORDS_STORAGE_KEY, JSON.stringify(nextRecords)],
            ]);
          } catch {
            recordTransactionInProgress.current = false;
            return { ok: false, reason: 'storage-error' };
          }

          replaceAnimalsFromTransaction(nextAnimals);
          replaceRecords(nextRecords);
          recordTransactionInProgress.current = false;
          return { ok: true };
        },
        resetRecords: async () => {
          try {
            await AsyncStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify([]));
          } catch {
            return { ok: false, reason: 'storage-error' };
          }

          replaceRecords([]);
          setFilters(DEFAULT_RECORD_FILTERS);
          return { ok: true };
        },
        previewUpdateRecordImpact: (recordId, record) => {
          const existingRecord = recordsRef.current.find((entry) => entry.id === recordId);
          if (!existingRecord) {
            return [];
          }

          const nextRecord = buildRecord(record, recordId);
          const nextRecords = recordsRef.current.map((entry) => (entry.id === recordId ? nextRecord : entry));
          const affectedUids = Array.from(
            new Set([...(existingRecord.animalUids ?? []), ...(nextRecord.animalUids ?? [])]),
          );

          return computeRecordMutationImpact(affectedUids, nextRecords, getAnimalsSnapshot(), farmEntities, paddockEntities);
        },
        previewAnimalLocationAsOf: (animalUid, date, excludeRecordId) => {
          const targetTimestamp = parseStoredDate(date)?.getTime() ?? 0;
          let hasAnyMovement = false;
          let latest: RecordEntry | null = null;
          let latestIndex = -1;

          recordsRef.current.forEach((record, index) => {
            if (record.id === excludeRecordId) {
              return;
            }

            if (record.type !== 'Movement' || !record.animalUids?.includes(animalUid)) {
              return;
            }

            hasAnyMovement = true;
            const recordTimestamp = parseStoredDate(record.date)?.getTime() ?? 0;

            if (recordTimestamp > targetTimestamp) {
              return;
            }

            if (!latest) {
              latest = record;
              latestIndex = index;
              return;
            }

            const latestTimestamp = parseStoredDate(latest.date)?.getTime() ?? 0;

            if (recordTimestamp > latestTimestamp || (recordTimestamp === latestTimestamp && index < latestIndex)) {
              latest = record;
              latestIndex = index;
            }
          });

          if (latest) {
            const foundRecord = latest as RecordEntry;
            return {
              status: 'found',
              farm: resolveFarmName(foundRecord.toFarmUid, foundRecord.toFarm, farmEntities),
              paddock: resolvePaddockName(foundRecord.toPaddockUid, foundRecord.toPaddock, paddockEntities),
            };
          }

          return hasAnyMovement ? { status: 'no-prior-movement' } : { status: 'no-movement-history' };
        },
        previewDeleteRecordImpact: (recordId) => {
          const existingRecord = recordsRef.current.find((entry) => entry.id === recordId);
          if (!existingRecord) {
            return [];
          }

          const nextRecords = recordsRef.current.filter((entry) => entry.id !== recordId);

          return computeRecordMutationImpact(
            existingRecord.animalUids ?? [],
            nextRecords,
            getAnimalsSnapshot(),
            farmEntities,
            paddockEntities,
          );
        },
      };
    },
    [
      filteredRecords,
      filters,
      farmEntities,
      getAnimalsSnapshot,
      prepareAnimalAddition,
      prepareAnimalUpdate,
      paddockEntities,
      replaceAnimalsFromTransaction,
      sortedRecords,
      hasLoadedStoredRecords,
    ],
  );

  return <RecordsContext.Provider value={value}>{children}</RecordsContext.Provider>;
}

export function useRecords() {
  const context = useContext(RecordsContext);

  if (!context) {
    throw new Error('useRecords must be used within a RecordsProvider');
  }

  return context;
}

function buildRecord(record: CreateRecordInput, id: string): RecordEntry {
  return {
    ...record,
    id,
    speciesTone: inferRecordSpeciesTone(record.species),
  };
}

function withAnimalRelation(record: CreateRecordInput, animal: Animal): CreateRecordInput {
  return {
    ...record,
    animal: animal.name.trim() || animal.id,
    animalTag: animal.id,
    animalIds: [animal.id],
    animalUids: [animal.uid],
  };
}

// Weight/location/status are never written directly onto an animal by a
// mutation; they're recomputed from scratch from whichever record is
// genuinely the latest (by date) for that animal + dimension. This is what
// guarantees "the latest record's value is what shows on the animal" stays
// true even when a record is backdated, edited to drop an animal, or
// deleted — there's no separate undo/rollback path to keep in sync.
function rebuildAnimalsState(
  animalUids: string[],
  records: RecordEntry[],
  animals: Animal[],
  farms: FarmEntity[],
  paddocks: PaddockEntity[],
): Animal[] {
  if (animalUids.length === 0) {
    return animals;
  }

  const targetUids = new Set(animalUids);

  return animals.map((animal): Animal => {
    if (!targetUids.has(animal.uid)) {
      return animal;
    }

    let next = animal;

    const latestWeightRecord = findLatestDimensionRecord(records, animal.uid, 'weight');
    if (latestWeightRecord?.weight?.trim()) {
      next = {
        ...next,
        weight: latestWeightRecord.weight.trim(),
        weightUnit: latestWeightRecord.weightUnit === 'lb' ? 'lb' : 'kg',
      };
    }

    const latestMovementRecord = findLatestDimensionRecord(records, animal.uid, 'location');
    if (latestMovementRecord) {
      // Prefer the uid link so a farm/paddock rename is picked up here too —
      // frozen toFarm/toPaddock text is only the fallback, for records
      // saved before the uid fields existed or a since-deleted farm.
      const destinationFarm = latestMovementRecord.toFarmUid
        ? farms.find((farm) => farm.uid === latestMovementRecord.toFarmUid)
        : farms.find((farm) => equalsIgnoreCase(farm.name, latestMovementRecord.toFarm ?? ''));
      const destinationPaddock = latestMovementRecord.toPaddockUid
        ? paddocks.find((paddock) => paddock.uid === latestMovementRecord.toPaddockUid)
        : paddocks.find(
            (paddock) =>
              equalsIgnoreCase(paddock.name, latestMovementRecord.toPaddock ?? '') &&
              (!destinationFarm?.uid || paddock.farmUid === destinationFarm.uid),
          );
      next = {
        ...next,
        farmUid: destinationFarm?.uid,
        farm: destinationFarm?.name ?? latestMovementRecord.toFarm?.trim() ?? '',
        paddockUid: destinationPaddock?.uid,
        paddock: destinationPaddock?.name ?? latestMovementRecord.toPaddock?.trim() ?? '',
      };
    }

    const latestLifecycleRecord = findLatestDimensionRecord(records, animal.uid, 'status');
    if (latestLifecycleRecord) {
      const nextStatus =
        latestLifecycleRecord.type === 'Death' ? 'Deceased' : latestLifecycleRecord.type === 'Sale' ? 'Sold' : 'Active';
      next = { ...next, status: nextStatus };
    }

    return next;
  });
}

// Among all records tying this animal to the given dimension, returns the
// one with the latest date. Same-day ties break on stored list order (index
// 0 = most recently added), matching how new records are unshifted onto the
// front of the list.
function findLatestDimensionRecord(
  records: RecordEntry[],
  animalUid: string,
  dimension: NonNullable<ReturnType<typeof getRecordEffectDimension>>,
): RecordEntry | null {
  let latest: RecordEntry | null = null;
  let latestIndex = -1;

  records.forEach((record, index) => {
    if (!record.animalUids?.includes(animalUid) || getRecordEffectDimension(record.type) !== dimension) {
      return;
    }

    if (!latest) {
      latest = record;
      latestIndex = index;
      return;
    }

    const candidateTimestamp = parseStoredDate(record.date)?.getTime() ?? 0;
    const latestTimestamp = parseStoredDate(latest.date)?.getTime() ?? 0;

    if (candidateTimestamp > latestTimestamp || (candidateTimestamp === latestTimestamp && index < latestIndex)) {
      latest = record;
      latestIndex = index;
    }
  });

  return latest;
}

function getRecordEffectDimension(recordType: string): 'location' | 'status' | 'weight' | null {
  if (recordType === 'Movement') return 'location';
  if (recordType === 'Death' || recordType === 'Sale' || recordType === 'Purchase') return 'status';
  if (recordType === 'Weight') return 'weight';
  return null;
}

// Animals in `animals` already reflect the correct current state for the
// records that exist right now, so "before" is just what's already stored.
// "After" is a fresh rebuild against the hypothetical post-mutation record
// list. Only genuine differences are reported, so unrelated edits (notes,
// buyer name, etc.) never produce a change.
function computeRecordMutationImpact(
  affectedUids: string[],
  nextRecords: RecordEntry[],
  animals: Animal[],
  farms: FarmEntity[],
  paddocks: PaddockEntity[],
): RecordImpactChange[] {
  if (affectedUids.length === 0) {
    return [];
  }

  const targetUids = new Set(affectedUids);
  const afterAnimals = rebuildAnimalsState(affectedUids, nextRecords, animals, farms, paddocks);
  const changes: RecordImpactChange[] = [];

  animals.forEach((animal) => {
    if (!targetUids.has(animal.uid)) {
      return;
    }

    const after = afterAnimals.find((entry) => entry.uid === animal.uid);
    if (!after) {
      return;
    }

    const animalLabel = animal.name.trim() || animal.id;

    (['weight', 'location', 'status'] as const).forEach((dimension) => {
      const before = formatDimensionValue(animal, dimension);
      const afterValue = formatDimensionValue(after, dimension);

      if (before !== afterValue) {
        changes.push({ animalUid: animal.uid, animalLabel, dimension, before, after: afterValue });
      }
    });
  });

  return changes;
}

function formatDimensionValue(animal: Animal, dimension: 'weight' | 'location' | 'status'): string {
  if (dimension === 'weight') {
    return animal.weight.trim() ? `${animal.weight.trim()} ${animal.weightUnit}` : 'Not set';
  }

  if (dimension === 'location') {
    return [animal.farm.trim(), animal.paddock.trim()].filter(Boolean).join(' • ') || 'Not set';
  }

  return animal.status;
}

export function isStoredRecord(value: unknown): value is RecordEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Partial<RecordEntry>;
  return (
    typeof record.id === 'string' &&
    typeof record.date === 'string' &&
    typeof record.type === 'string' &&
    typeof record.animalTag === 'string'
  );
}

export function ensureUniqueRecordIds(records: RecordEntry[]) {
  const seenIds = new Set<string>();

  return records.map((record) => {
    const storedId = record.id.trim();

    if (storedId && !seenIds.has(storedId)) {
      seenIds.add(storedId);
      return storedId === record.id ? record : { ...record, id: storedId };
    }

    let id = createUuid();

    while (seenIds.has(id)) {
      id = createUuid();
    }

    seenIds.add(id);
    return { ...record, id };
  });
}

function inferRecordSpeciesTone(species: string): RecordSpeciesTone {
  const normalized = species.toLowerCase();

  if (normalized.includes('cow') || normalized.includes('cattle') || normalized.includes('buffalo')) {
    return 'cow';
  }

  if (normalized.includes('sheep')) {
    return 'sheep';
  }

  if (normalized.includes('pig')) {
    return 'pig';
  }

  if (normalized.includes('goat')) {
    return 'goat';
  }

  return 'neutral';
}

function recordMatchesFilters(
  record: RecordEntry,
  filters: RecordFilters,
  animals: Animal[],
  lookup: AnimalLookup,
) {
  const searchQuery = filters.searchQuery.trim().toLowerCase();
  const animalIdQuery = filters.animalIdQuery.trim().toLowerCase();
  const animalNameQuery = filters.animalNameQuery.trim().toLowerCase();
  const recordDate = parseRecordDate(record.date);
  const startDate = filters.startDate ? parseRecordDate(filters.startDate) : null;
  const endDate = filters.endDate ? parseRecordDate(filters.endDate) : null;

  if (searchQuery && !record.title.toLowerCase().includes(searchQuery)) {
    return false;
  }

  if (startDate && recordDate && recordDate < startDate) {
    return false;
  }

  if (endDate && recordDate && recordDate > endDate) {
    return false;
  }

  if (filters.species.length > 0 && !filters.species.some((species) => equalsIgnoreCase(species, record.species))) {
    return false;
  }

  if (filters.recordTypes.length > 0 && !filters.recordTypes.some((type) => equalsIgnoreCase(type, record.type))) {
    return false;
  }

  // Only resolve the record's related animals when a filter that actually
  // needs them is active — this is the expensive step (per-record animal
  // lookups), and most filter passes (plain search, date range, species,
  // record type) never need it at all.
  const needsRelatedAnimals =
    Boolean(animalIdQuery) || Boolean(animalNameQuery) || filters.farms.length > 0 || filters.paddocks.length > 0;
  const relatedAnimals = needsRelatedAnimals ? findRelatedAnimals(record, animals, lookup) : [];

  if (
    animalIdQuery &&
    ![record.animalTag, ...relatedAnimals.map((animal) => animal.id)]
      .some((value) => value.toLowerCase().includes(animalIdQuery))
  ) {
    return false;
  }

  if (
    animalNameQuery &&
    ![record.animal, ...relatedAnimals.map((animal) => animal.name)]
      .some((value) => value.toLowerCase().includes(animalNameQuery))
  ) {
    return false;
  }

  if (
    filters.farms.length > 0 &&
    !relatedAnimals.some((animal) => filters.farms.some((farm) => equalsIgnoreCase(farm, animal.farm)))
  ) {
    return false;
  }

  if (
    filters.paddocks.length > 0 &&
    !relatedAnimals.some((animal) => filters.paddocks.some((paddock) => equalsIgnoreCase(paddock, animal.paddock)))
  ) {
    return false;
  }

  return true;
}

// Precomputed once per filter/search pass and threaded through instead of
// rebuilding a Set/scanning the full animals array inside findRelatedAnimals
// for every single record — with hundreds of animals and thousands of
// records, that per-record rebuild is what turns typing in the search box
// into a laggy keystroke instead of an instant one.
type AnimalLookup = { animalUidSet: Set<string>; animalsByUid: Map<string, Animal> };

function buildAnimalLookup(animals: Animal[]): AnimalLookup {
  return {
    animalUidSet: new Set(animals.map((animal) => animal.uid)),
    animalsByUid: new Map(animals.map((animal) => [animal.uid, animal])),
  };
}

function findRelatedAnimals(record: RecordEntry, animals: Animal[], lookup: AnimalLookup) {
  if (record.animalUids) {
    const { animalUidSet, animalsByUid } = lookup;
    const uids = new Set(record.animalUids.filter((uid) => animalUidSet.has(uid)));
    return Array.from(uids)
      .map((uid) => animalsByUid.get(uid))
      .filter((animal): animal is Animal => Boolean(animal));
  }

  // Rare legacy path — a record without animalUids that couldn't be
  // backfilled on restore (see restoreRecords above). Falls back to the
  // general, slower name/tag matching resolver.
  return findRecordAnimals(record, animals);
}

function equalsIgnoreCase(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function parseRecordDate(value: string) {
  return parseStoredDate(value);
}

function getRecordTimestamp(value: string) {
  return parseStoredDate(value)?.getTime() ?? 0;
}
