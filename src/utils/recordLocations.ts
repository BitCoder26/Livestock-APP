import type { Animal } from '../entities/animal';
import type { RecordEntry } from '../entities/record';
import type { FarmEntity, GroupEntity, PaddockEntity } from '../context/SetupContext';

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

export function resolvePaddockName(
  uid: string | undefined,
  frozenName: string | undefined,
  paddocks: PaddockEntity[],
): string {
  if (uid) {
    const paddock = paddocks.find((entry) => entry.uid === uid);
    if (paddock) {
      return paddock.name;
    }
  }

  return frozenName?.trim() ?? '';
}

export function formatLocationLabel(farmName: string, paddockName: string, separator = ' • '): string {
  return [farmName.trim(), paddockName.trim()].filter(Boolean).join(separator);
}

// A Movement record's "From" place, resolved fresh from the current
// farm/paddock names rather than trusting whatever was baked into
// record.title at save time — so a rename shows up immediately everywhere
// this is used, without ever rewriting a stored record.
export function resolveMovementFromLabel(record: RecordEntry, farms: FarmEntity[], paddocks: PaddockEntity[]): string {
  const farm = resolveFarmName(record.fromFarmUid, record.fromFarm, farms);
  const paddock = resolvePaddockName(record.fromPaddockUid, record.fromPaddock, paddocks);
  return formatLocationLabel(farm, paddock, ' / ');
}

export function resolveMovementToLabel(record: RecordEntry, farms: FarmEntity[], paddocks: PaddockEntity[]): string {
  const farm = resolveFarmName(record.toFarmUid, record.toFarm, farms);
  const paddock = resolvePaddockName(record.toPaddockUid, record.toPaddock, paddocks);
  return formatLocationLabel(farm, paddock, ' / ');
}

export function resolveMovementSummary(record: RecordEntry, farms: FarmEntity[], paddocks: PaddockEntity[]): string {
  const from = resolveMovementFromLabel(record, farms, paddocks);
  const to = resolveMovementToLabel(record, farms, paddocks);
  return [from, to].filter(Boolean).join(' to ');
}

// A record's display title — unchanged for every type except Movement,
// where it's recomputed fresh from the current farm/paddock names instead
// of trusting whatever was baked into record.title when it was saved. Same
// "Movement: X to Y" shape as before, just never stale after a rename.
export function getRecordDisplayTitle(record: RecordEntry, farms: FarmEntity[], paddocks: PaddockEntity[]): string {
  if (record.type !== 'Movement') {
    return record.title;
  }

  const summary = resolveMovementSummary(record, farms, paddocks);
  return summary ? `Movement: ${summary}` : record.title;
}

// An animal's current farm/paddock, resolved live via the uid
// rebuildAnimalsState already caches on it — so a farm/paddock rename shows
// up on every animal card, timeline, and export immediately, without
// needing to eagerly rewrite the animal's own cached farm/paddock text.
export function resolveAnimalFarmName(animal: Animal, farms: FarmEntity[]): string {
  return resolveFarmName(animal.farmUid, animal.farm, farms);
}

export function resolveAnimalPaddockName(animal: Animal, paddocks: PaddockEntity[]): string {
  return resolvePaddockName(animal.paddockUid, animal.paddock, paddocks);
}

export function resolveAnimalLocationLabel(animal: Animal, farms: FarmEntity[], paddocks: PaddockEntity[]): string {
  return formatLocationLabel(resolveAnimalFarmName(animal, farms), resolveAnimalPaddockName(animal, paddocks));
}

// Same live-uid-first pattern as farm/paddock, applied to an animal's group
// — a group rename shows up immediately wherever this is used instead of
// the animal's cached group string going stale.
export function resolveAnimalGroupName(animal: Animal, groups: GroupEntity[]): string {
  if (animal.groupUid) {
    const group = groups.find((entry) => entry.uid === animal.groupUid);
    if (group) {
      return group.name;
    }
  }

  return animal.group?.trim() ?? '';
}
