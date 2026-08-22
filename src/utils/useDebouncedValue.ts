import { useEffect, useState } from 'react';

/**
 * Follows `value`, but only after it has stopped changing for `delayMs`.
 *
 * Used for search boxes that filter as you type. The field itself stays fully
 * responsive — it renders every keystroke — while the work behind it (scanning
 * every animal, herd and record, and re-deriving the counts) runs once the
 * typing pauses rather than on each letter. On a handful of animals either
 * approach is fine; the difference shows on a farm with thousands, where
 * filtering on every keystroke is what makes a keyboard feel laggy.
 *
 * An empty value is applied immediately: clearing a search should restore the
 * full list at once, not after a pause.
 */
export function useDebouncedValue<T extends string>(value: T, delayMs = 200): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    if (!value) {
      setSettled(value);
      return;
    }

    const timer = setTimeout(() => setSettled(value), delayMs);

    return () => clearTimeout(timer);
  }, [delayMs, value]);

  return settled;
}
