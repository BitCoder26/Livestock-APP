import type { AppIconName } from '../components/AppIcon';

export const RECORD_TYPES = [
  'Movement',
  'Weight',
  'Death',
  'Birth',
  'Vaccination',
  'Medication',
  'Health Check',
  'Sale',
  'Purchase',
  'Other',
] as const;

export const SPECIES_OPTIONS: Array<{ icon: AppIconName; label: string }> = [
  { icon: 'cow-copy', label: 'Cattle' },
  { icon: 'sheep-black', label: 'Sheep' },
  { icon: 'pig', label: 'Pig' },
  { icon: 'goat', label: 'Goat' },
  { icon: 'chicken', label: 'Chicken' },
  { icon: 'duck', label: 'Duck' },
  { icon: 'turkey', label: 'Turkey' },
  { icon: 'goose', label: 'Goose' },
  { icon: 'donkey', label: 'Donkey' },
  { icon: 'horse', label: 'Horse' },
  { icon: 'bison', label: 'Buffalo' },
  { icon: 'rabbit', label: 'Rabbit' },
  { icon: 'alpaca', label: 'Alpaca' },
  { icon: 'llama', label: 'Llama' },
  { icon: 'camel', label: 'Camel' },
  { icon: 'ostrich', label: 'Ostrich' },
];
