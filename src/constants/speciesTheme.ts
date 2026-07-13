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
    tintBackground: '#F8DEDB',
    tintBorder: '#E79D99',
    chipBackground: '#FCE5E4',
    chipBorder: '#E79D99',
    text: '#5B4747',
    icon: '#5B4747',
  },
  pig: {
    tintBackground: '#D9E9F8',
    tintBorder: '#90B9DE',
    chipBackground: '#DCEAF9',
    chipBorder: '#90B9DE',
    text: '#4B6483',
    icon: '#4B6483',
  },
  sheep: {
    tintBackground: '#E2EDD1',
    tintBorder: '#B9CC96',
    chipBackground: '#E8F1DD',
    chipBorder: '#B9CC96',
    text: '#536245',
    icon: '#000000',
  },
  goat: {
    tintBackground: '#E6DDF4',
    tintBorder: '#BBA8DC',
    chipBackground: '#EEE7F8',
    chipBorder: '#BBA8DC',
    text: '#5E4D7E',
    icon: '#5E4D7E',
  },
  poultry: {
    tintBackground: '#F5E9BE',
    tintBorder: '#D7C483',
    chipBackground: '#F7EFD8',
    chipBorder: '#D7C483',
    text: '#786337',
    icon: '#786337',
  },
  equine: {
    tintBackground: '#EED4C2',
    tintBorder: '#C79F84',
    chipBackground: '#F4E2D6',
    chipBorder: '#C79F84',
    text: '#714C37',
    icon: '#714C37',
  },
  camelid: {
    tintBackground: '#D0E8E4',
    tintBorder: '#8CBEB4',
    chipBackground: '#DDF1ED',
    chipBorder: '#8CBEB4',
    text: '#3F6862',
    icon: '#3F6862',
  },
  neutral: {
    tintBackground: '#E7E0E4',
    tintBorder: '#CFC6CB',
    chipBackground: '#ECE7EA',
    chipBorder: '#CFC6CB',
    text: '#5E5A5D',
    icon: '#5E5A5D',
  },
} satisfies Record<AnimalTone, SpeciesTheme>;

export function getSpeciesThemeByTone(tone: AnimalTone) {
  return THEMES[tone];
}

export function getSpeciesThemeByLabel(label: string) {
  return THEMES[inferToneFromSpecies(label)];
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
