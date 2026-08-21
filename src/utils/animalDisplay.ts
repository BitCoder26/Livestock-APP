import type { AppIconName } from '../components/AppIcon';

/** "6 years old" → "6 yrs", so the value fits a card or a card's meta line. */
export function abbreviateAgeLabel(ageLabel: string) {
  const trimmed = ageLabel.trim();

  if (!trimmed) {
    return '';
  }

  return trimmed
    .replace(/years old/i, 'yrs')
    .replace(/months old/i, 'mos')
    .replace(/days old/i, 'days');
}

export function getAnimalSexIcon(sex: unknown): Extract<AppIconName, 'female' | 'male'> {
  return sex === 'male' ? 'male' : 'female';
}
