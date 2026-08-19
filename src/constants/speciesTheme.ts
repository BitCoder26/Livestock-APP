import type { AnimalTone } from '../entities/animal';

type SpeciesTheme = {
  tintBackground: string;
  tintBorder: string;
  chipBackground: string;
  chipBorder: string;
  text: string;
  icon: string;
};

const THEMES = {
  cow: {
    tintBackground: '#FBE7E3',
    tintBorder: '#EAB1AB',
    chipBackground: '#F9E9E5',
    chipBorder: '#EAB1AB',
    text: '#6A5452',
    icon: '#6A5452',
  },
  pig: {
    tintBackground: '#E3EEF9',
    tintBorder: '#AAC9E4',
    chipBackground: '#E7F1FB',
    chipBorder: '#AAC9E4',
    text: '#58708B',
    icon: '#58708B',
  },
  sheep: {
    tintBackground: '#EAF2DD',
    tintBorder: '#C7D8A9',
    chipBackground: '#EDF4E2',
    chipBorder: '#C7D8A9',
    text: '#5E6E50',
    icon: '#5E6E50',
  },
  goat: {
    tintBackground: '#EEE7F8',
    tintBorder: '#C9B9E3',
    chipBackground: '#F0EAF9',
    chipBorder: '#C9B9E3',
    text: '#6A5A86',
    icon: '#6A5A86',
  },
  poultry: {
    tintBackground: '#F8EFCB',
    tintBorder: '#DEC98F',
    chipBackground: '#F8F0D6',
    chipBorder: '#DEC98F',
    text: '#816D43',
    icon: '#816D43',
  },
  equine: {
    tintBackground: '#F3DED0',
    tintBorder: '#D1AE97',
    chipBackground: '#F5E4DA',
    chipBorder: '#D1AE97',
    text: '#7A5947',
    icon: '#7A5947',
  },
  camelid: {
    tintBackground: '#DDEFEA',
    tintBorder: '#A3CCC4',
    chipBackground: '#E5F2EE',
    chipBorder: '#A3CCC4',
    text: '#53756F',
    icon: '#53756F',
  },
  neutral: {
    tintBackground: '#EEE9EC',
    tintBorder: '#D8CED3',
    chipBackground: '#EFE8EC',
    chipBorder: '#D8CED3',
    text: '#696366',
    icon: '#696366',
  },
} satisfies Record<AnimalTone, SpeciesTheme>;

export function getSpeciesThemeByTone(tone: AnimalTone) {
  return THEMES[tone];
}

export function getSpeciesThemeByLabel(label: string) {
  return THEMES[inferToneFromSpecies(label)];
}

/** Species label to tone, for records that carry a species but no stored tone. */
export function getToneForSpecies(label: string): AnimalTone {
  return inferToneFromSpecies(label);
}

function inferToneFromSpecies(label: string): AnimalTone {
  const normalized = label.trim().toLowerCase();

  if (normalized.includes('cow') || normalized.includes('cattle') || normalized.includes('buffalo') || normalized.includes('bison')) {
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
