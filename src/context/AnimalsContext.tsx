import AsyncStorage from 'expo-sqlite/kv-store';
import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { Animal, AnimalTone } from '../entities/animal';

type CreateAnimalInput = Omit<Animal, 'tone' | 'ageLabel'>;

type AnimalsContextValue = {
  animals: Animal[];
  addAnimal: (animal: CreateAnimalInput) => void;
  updateAnimal: (originalId: string, animal: CreateAnimalInput) => void;
  deleteAnimal: (animalId: string) => void;
  resetAnimals: () => void;
};

const AnimalsContext = createContext<AnimalsContextValue | null>(null);
const ANIMALS_STORAGE_KEY = 'livestockbook.animals.v1';

export function AnimalsProvider({ children }: PropsWithChildren) {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [hasLoadedStoredAnimals, setHasLoadedStoredAnimals] = useState(false);

  useEffect(() => {
    let isActive = true;

    const restoreAnimals = async () => {
      try {
        const storedAnimals = await AsyncStorage.getItem(ANIMALS_STORAGE_KEY);

        if (storedAnimals && isActive) {
          const parsedAnimals: unknown = JSON.parse(storedAnimals);

          if (Array.isArray(parsedAnimals)) {
            const validAnimals = parsedAnimals
              .filter(isStoredAnimal)
              .map(normalizeStoredAnimal);

            if (validAnimals.length > 0 || parsedAnimals.length === 0) {
              setAnimals(validAnimals);
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
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredAnimals) {
      return;
    }

    void AsyncStorage.setItem(ANIMALS_STORAGE_KEY, JSON.stringify(animals));
  }, [animals, hasLoadedStoredAnimals]);

  const value = useMemo<AnimalsContextValue>(
    () => ({
      animals,
      addAnimal: (animal) => {
        setAnimals((current) => [
          {
            ...animal,
            ageLabel: formatAgeLabel(animal.ageValue, animal.ageUnit),
            tone: inferAnimalTone(animal.species),
          },
          ...current,
        ]);
      },
      updateAnimal: (originalId, animal) => {
        setAnimals((current) =>
          current.map((entry) =>
            entry.id === originalId
              ? {
                  ...animal,
                  ageLabel: formatAgeLabel(animal.ageValue, animal.ageUnit),
                  tone: inferAnimalTone(animal.species),
                }
              : entry,
          ),
        );
      },
      deleteAnimal: (animalId) => {
        setAnimals((current) => current.filter((entry) => entry.id !== animalId));
      },
      resetAnimals: () => {
        setAnimals([]);
      },
    }),
    [animals],
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

function isStoredAnimal(value: unknown): value is Animal {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const animal = value as Partial<Animal>;
  return typeof animal.id === 'string' && typeof animal.species === 'string';
}

function normalizeStoredAnimal(animal: Animal): Animal {
  return {
    ...animal,
    sex: animal.sex === 'male' ? 'male' : 'female',
    ageLabel: formatAgeLabel(animal.ageValue ?? '', animal.ageUnit ?? 'years old'),
    imageUris: animal.imageUris?.slice(0, 1),
    tone: inferAnimalTone(animal.species),
  };
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
