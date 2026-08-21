import { ALL_RECORD_TYPES } from '../constants/records';
import type { RecordEntry } from '../entities/record';

/**
 * The record types worth offering in a filter. `ALL_RECORD_TYPES` spans both
 * individual and collective records, and some of those only exist for one kind
 * of keeper — a sheep farmer has no use for Egg Production. So the filter lists
 * the types actually present in their records, plus anything already ticked so
 * a saved filter never loses an option, falling back to the full list while
 * there is nothing to derive from.
 *
 * Shared by the Records filter and the Export tab: the two list the same
 * records, and a type appearing in one but not the other reads as a bug.
 */
export function deriveRecordTypeOptions(records: RecordEntry[], selected: string[] = []) {
  const knownTypes = new Map<string, string>();

  for (const record of records) {
    if (record.type.trim()) {
      knownTypes.set(record.type.trim().toLowerCase(), record.type.trim());
    }
  }

  for (const type of selected) {
    if (type.trim()) {
      knownTypes.set(type.trim().toLowerCase(), type.trim());
    }
  }

  if (knownTypes.size === 0) {
    return ALL_RECORD_TYPES;
  }

  // Follow the canonical order rather than whatever order records happened to
  // be saved in, so the list does not reshuffle as records are added.
  const ordered = ALL_RECORD_TYPES.filter((type) => knownTypes.delete(type.toLowerCase()));

  return [...ordered, ...knownTypes.values()];
}
