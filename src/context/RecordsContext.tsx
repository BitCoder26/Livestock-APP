import type { PropsWithChildren } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';

import { useAnimals } from './AnimalsContext';
import type { Animal } from '../entities/animal';
import type { RecordEntry, RecordSpeciesTone } from '../entities/record';

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
  resetRecords: () => void;
};

const RecordsContext = createContext<RecordsContextValue | null>(null);

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

  const filteredRecords = useMemo(
    () => records.filter((record) => recordMatchesFilters(record, filters, animals)),
    [animals, filters, records],
  );

  const value = useMemo<RecordsContextValue>(
    () => ({
      records,
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
      resetRecords: () => {
        setRecords([]);
        setFilters(DEFAULT_RECORD_FILTERS);
      },
    }),
    [filteredRecords, filters, records],
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

  if (record.animalIds?.length) {
    for (const id of record.animalIds) {
      idParts.add(id.toLowerCase());
    }
  }

  return animals.filter((animal) => idParts.has(animal.id.toLowerCase()) || nameParts.has(animal.name.toLowerCase()));
}

function splitValues(value: string) {
  return value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function equalsIgnoreCase(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function parseRecordDate(value: string) {
  const [dayPart, monthPart, yearPart] = value.trim().split(/\s+/);

  if (!dayPart || !monthPart || !yearPart) {
    return null;
  }

  const day = Number(dayPart);
  const year = Number(yearPart);
  const month = MONTH_INDEX[monthPart.toLowerCase()];

  if (!Number.isFinite(day) || !Number.isFinite(year) || month === undefined) {
    return null;
  }

  return new Date(year, month, day);
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};
