/**
 * Field validation shared by both Add Record screens. The individual screen
 * grew these first; the collective screen had only presence checks, so a herd
 * record could be saved with an average weight of `0` or a withdrawal of half
 * a day. Keeping one copy is what stops the two screens disagreeing again
 * about what counts as a usable number.
 */

/** Whole number of days, `0` allowed — a withdrawal really can be none. */
export function isValidNonNegativeInteger(value: string) {
  return /^\d+$/.test(value.trim());
}

/** A measured quantity: a weight or a dose of `0` is not a reading. */
export function isValidPositiveNumber(value: string) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0;
}

/** Money and tallies, where `0` is a real answer — a gift, an empty collection. */
export function isValidNonNegativeNumber(value: string) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0;
}

export function equalsIgnoreCase(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
