import type { Animal } from '../entities/animal';
import type { RecordEntry } from '../entities/record';

export function resolveRecordAnimalUids(record: RecordEntry, animals: Animal[]) {
  if (record.animalUids) {
    const existingUids = new Set(animals.map((animal) => animal.uid));
    return unique(record.animalUids.filter((uid) => existingUids.has(uid)));
  }

  const tags = record.animalIds?.filter(Boolean) ?? splitValues(record.animalTag);
  const names = splitValues(record.animal);
  const resolvedUids: string[] = [];
  const itemCount = Math.max(tags.length, names.length);

  for (let index = 0; index < itemCount; index += 1) {
    const tag = tags[index]?.trim();
    const name = names[index]?.trim();
    let candidates = tag
      ? animals.filter((animal) => equalsIgnoreCase(animal.id, tag))
      : [];

    if (candidates.length > 1 && name) {
      candidates = candidates.filter((animal) => equalsIgnoreCase(animal.name, name));
    }

    // Legacy records can contain the old tag after an animal was renamed. A
    // unique matching name safely reconnects those records during migration.
    if (candidates.length === 0 && name) {
      candidates = animals.filter((animal) => equalsIgnoreCase(animal.name, name));
    }

    if (candidates.length === 1) {
      resolvedUids.push(candidates[0].uid);
    }
  }

  return unique(resolvedUids);
}

export function findRecordAnimals(record: RecordEntry, animals: Animal[]) {
  const relatedUids = new Set(resolveRecordAnimalUids(record, animals));
  return animals.filter((animal) => relatedUids.has(animal.uid));
}

// A record's `animal`/`animalTag` strings are a frozen snapshot taken when
// the record was created — renaming or re-tagging an animal afterward never
// touches them. These resolve each animal slot to its *current* name/tag via
// `animalUids`, falling back to the frozen text only when the live animal
// can't be found anymore (deleted, or a legacy record with no uid link).
export function resolveRecordDisplayNames(record: RecordEntry, animals: Animal[]): string[] {
  const fallbackNames = splitValues(record.animal);

  if (!record.animalUids || record.animalUids.length === 0) {
    return fallbackNames;
  }

  return record.animalUids.map((uid, index) => {
    const animal = animals.find((entry) => entry.uid === uid);
    return animal ? animal.name.trim() || animal.id : fallbackNames[index] ?? '';
  });
}

export function resolveRecordDisplayTags(record: RecordEntry, animals: Animal[]): string[] {
  const fallbackTags = splitValues(record.animalTag);

  if (!record.animalUids || record.animalUids.length === 0) {
    return fallbackTags;
  }

  return record.animalUids.map((uid, index) => {
    const animal = animals.find((entry) => entry.uid === uid);
    return animal ? animal.id : fallbackTags[index] ?? '';
  });
}

function splitValues(value: string) {
  return value
    .split(/[,:;|•]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function equalsIgnoreCase(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function unique(values: string[]) {
  return [...new Set(values)];
}
