import type { Animal } from '../entities/animal';
import type { RecordEntry } from '../entities/record';
import type { FarmEntity, LabelEntity, LocationEntity } from '../context/SetupContext';

// Resolves a farm's current display name, preferring a live lookup by uid —
// so a rename in Setup shows up everywhere instantly — and falling back to
// a frozen text snapshot only when the uid no longer resolves (the farm was
// deleted). Mirrors the animalUids-vs-animal/animalTag pattern already used
// for animal names on records.
export function resolveFarmName(uid: string | undefined, frozenName: string | undefined, farms: FarmEntity[]): string {
  if (uid) {
    const farm = farms.find((entry) => entry.uid === uid);
    if (farm) {
      return farm.name;
    }
  }

  return frozenName?.trim() ?? '';
}

export function resolveLocationName(
  uid: string | undefined,
  frozenName: string | undefined,
  locations: LocationEntity[],
): string {
  if (uid) {
    const location = locations.find((entry) => entry.uid === uid);
    if (location) {
      return location.name;
    }
  }

  return frozenName?.trim() ?? '';
}

export function formatLocationLabel(farmName: string, locationName: string, separator = ' • '): string {
  return [farmName.trim(), locationName.trim()].filter(Boolean).join(separator);
}

// A Movement record's "From" place, resolved fresh from the current
// farm/location names rather than trusting whatever was baked into
// record.title at save time — so a rename shows up immediately everywhere
// this is used, without ever rewriting a stored record.
export function resolveMovementFromLabel(record: RecordEntry, farms: FarmEntity[], locations: LocationEntity[]): string {
  const farm = resolveFarmName(record.fromFarmUid, record.fromFarm, farms);
  const location = resolveLocationName(record.fromLocationUid, record.fromLocation, locations);
  return formatLocationLabel(farm, location, ' / ');
}

export function resolveMovementToLabel(record: RecordEntry, farms: FarmEntity[], locations: LocationEntity[]): string {
  const farm = resolveFarmName(record.toFarmUid, record.toFarm, farms);
  const location = resolveLocationName(record.toLocationUid, record.toLocation, locations);
  return formatLocationLabel(farm, location, ' / ');
}

export function resolveMovementSummary(record: RecordEntry, farms: FarmEntity[], locations: LocationEntity[]): string {
  const from = resolveMovementFromLabel(record, farms, locations);
  const to = resolveMovementToLabel(record, farms, locations);
  return [from, to].filter(Boolean).join(' to ');
}

// A record's display title — unchanged for every type except Movement,
// where it's recomputed fresh from the current farm/location names instead
// of trusting whatever was baked into record.title when it was saved. Same
// "Movement: X to Y" shape as before, just never stale after a rename.
export function getRecordDisplayTitle(record: RecordEntry, farms: FarmEntity[], locations: LocationEntity[]): string {
  if (record.type !== 'Movement') {
    return record.title;
  }

  const summary = resolveMovementSummary(record, farms, locations);
  return summary ? `Movement: ${summary}` : record.title;
}

// An animal's current farm/location, resolved live via the uid
// rebuildAnimalsState already caches on it — so a farm/location rename shows
// up on every animal card, timeline, and export immediately, without
// needing to eagerly rewrite the animal's own cached farm/location text.
export function resolveAnimalFarmName(animal: Animal, farms: FarmEntity[]): string {
  return resolveFarmName(animal.farmUid, animal.farm, farms);
}

export function resolveAnimalLocationName(animal: Animal, locations: LocationEntity[]): string {
  return resolveLocationName(animal.locationUid, animal.location, locations);
}

export function resolveAnimalLocationLabel(animal: Animal, farms: FarmEntity[], locations: LocationEntity[]): string {
  return formatLocationLabel(resolveAnimalFarmName(animal, farms), resolveAnimalLocationName(animal, locations));
}

// Same live-uid-first pattern as farm/location, applied to an animal's labels
// — a label rename shows up immediately wherever this is used instead of the
// animal's cached label strings going stale. Returns every label the animal
// carries, in stored order.
export function resolveAnimalLabelNames(animal: Animal, labels: LabelEntity[]): string[] {
  const storedNames = animal.labels ?? [];
  const storedUids = animal.labelUids ?? [];

  return storedNames
    .map((name, index) => {
      const uid = storedUids[index];
      const match = uid ? labels.find((entry) => entry.uid === uid) : undefined;
      return (match?.name ?? name).trim();
    })
    .filter(Boolean);
}
