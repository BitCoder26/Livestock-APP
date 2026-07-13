import type { PropsWithChildren } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';

import type { Animal, AnimalTone } from '../entities/animal';

type CreateAnimalInput = Omit<Animal, 'tone' | 'ageLabel'>;

type AnimalsContextValue = {
  animals: Animal[];
  addAnimal: (animal: CreateAnimalInput) => void;
  updateAnimal: (originalId: string, animal: CreateAnimalInput) => void;
  resetAnimals: () => void;
};

const AnimalsContext = createContext<AnimalsContextValue | null>(null);

export function AnimalsProvider({ children }: PropsWithChildren) {
  const [animals, setAnimals] = useState<Animal[]>([]);

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
