import type { PropsWithChildren } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';

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

export function AnimalsProvider({ children }: PropsWithChildren) {
  const [animals, setAnimals] = useState<Animal[]>([createSeedAnimal()]);

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

function createSeedAnimal(): Animal {
  return {
    id: 'LB-001',
    species: 'Cattle',
    sex: 'female',
    name: 'Daisy',
    ageValue: '2',
    ageUnit: 'years old',
    ageLabel: formatAgeLabel('2', 'years old'),
    breed: 'Angus',
    dateOfBirth: '12 Mar 2024',
    weight: '480',
    weightUnit: 'kg',
    status: 'Active',
    farm: 'Home Farm',
    paddock: 'North Paddock',
    group: 'Breeding Herd',
    notes: '',
    tone: inferAnimalTone('Cattle'),
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
