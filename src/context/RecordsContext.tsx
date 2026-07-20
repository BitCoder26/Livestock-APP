import AsyncStorage from 'expo-sqlite/kv-store';
import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useAnimals } from './AnimalsContext';
import type { Animal } from '../entities/animal';
import type { RecordEntry, RecordSpeciesTone } from '../entities/record';
import { parseStoredDate } from '../utils/dateFormat';

type CreateRecordInput = Omit<RecordEntry, 'id' | 'speciesTone'>;

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
  filteredRecords: RecordEntry[];
  filters: RecordFilters;
  setFilters: (filters: RecordFilters) => void;
  clearFilters: () => void;
  addRecord: (record: CreateRecordInput) => void;
  updateRecord: (recordId: string, record: CreateRecordInput) => void;
  deleteRecord: (recordId: string) => void;
  resetRecords: () => void;
};

const RecordsContext = createContext<RecordsContextValue | null>(null);
const RECORDS_STORAGE_KEY = 'livestockbook.records.v1';

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
  const { animals } = useAnimals();
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [filters, setFilters] = useState<RecordFilters>(DEFAULT_RECORD_FILTERS);
  const [hasLoadedStoredRecords, setHasLoadedStoredRecords] = useState(false);

  useEffect(() => {
    let isActive = true;

    const restoreRecords = async () => {
      try {
        const storedRecords = await AsyncStorage.getItem(RECORDS_STORAGE_KEY);

        if (storedRecords && isActive) {
          const parsedRecords: unknown = JSON.parse(storedRecords);

          if (Array.isArray(parsedRecords)) {
            setRecords(parsedRecords.filter(isStoredRecord));
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
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredRecords) {
      return;
    }

    void AsyncStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records));
  }, [hasLoadedStoredRecords, records]);

  const sortedRecords = useMemo(
    () => [...records].sort((left, right) => getRecordTimestamp(right.date) - getRecordTimestamp(left.date)),
    [records],
  );

  const filteredRecords = useMemo(
    () => sortedRecords.filter((record) => recordMatchesFilters(record, filters, animals)),
    [animals, filters, sortedRecords],
  );

  const value = useMemo<RecordsContextValue>(
    () => ({
      records: sortedRecords,
      filteredRecords,
      filters,
      setFilters,
      clearFilters: () => setFilters(DEFAULT_RECORD_FILTERS),
      addRecord: (record) => {
        setRecords((current) => [
          {
            ...record,
            id: `${record.date}-${record.type}-${record.animalTag}-${current.length + 1}`,
            speciesTone: inferRecordSpeciesTone(record.species),
          },
          ...current,
        ]);
      },
      updateRecord: (recordId, record) => {
        setRecords((current) =>
          current.map((entry) =>
            entry.id === recordId
              ? {
                  ...entry,
                  ...record,
                  id: recordId,
                  speciesTone: inferRecordSpeciesTone(record.species),
                }
              : entry,
          ),
        );
      },
      deleteRecord: (recordId) => {
        setRecords((current) => current.filter((entry) => entry.id !== recordId));
      },
      resetRecords: () => {
        setRecords([]);
        setFilters(DEFAULT_RECORD_FILTERS);
      },
    }),
    [filteredRecords, filters, sortedRecords],
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

function isStoredRecord(value: unknown): value is RecordEntry {
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

function recordMatchesFilters(record: RecordEntry, filters: RecordFilters, animals: Animal[]) {
  const relatedAnimals = findRelatedAnimals(record, animals);
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

function findRelatedAnimals(record: RecordEntry, animals: Animal[]) {
  const idParts = new Set(splitValues(record.animalTag));
  const nameParts = new Set(splitValues(record.animal));
  const combinedReference = [record.animalTag, record.animal, ...(record.animalIds ?? [])]
    .join(' ')
    .trim()
    .toLowerCase();

  if (record.animalIds?.length) {
    for (const id of record.animalIds) {
      idParts.add(id.toLowerCase().trim());
    }
  }

  return animals.filter((animal) => {
    const normalizedId = animal.id.trim().toLowerCase();
    const normalizedName = animal.name.trim().toLowerCase();

    return (
      idParts.has(normalizedId) ||
      nameParts.has(normalizedName) ||
      (normalizedId.length > 0 && combinedReference.includes(normalizedId)) ||
      (normalizedName.length > 0 && combinedReference.includes(normalizedName))
    );
  });
}

function splitValues(value: string) {
  return value
    .split(/[,:;|•]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
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
