export type AnimalSex = 'female' | 'male';

export type AnimalStatus = 'Active' | 'Sold' | 'Deceased';

export type AnimalAgeUnit = 'days old' | 'months old' | 'years old';

export type AnimalWeightUnit = 'kg' | 'lb' | 'st';

export type AnimalTone = 'cow' | 'pig' | 'sheep' | 'goat' | 'poultry' | 'equine' | 'camelid' | 'neutral';

export type Animal = {
  id: string;
  species: string;
  sex: AnimalSex;
  name: string;
  ageValue: string;
  ageUnit: AnimalAgeUnit;
  ageLabel: string;
  breed: string;
  dateOfBirth: string;
  weight: string;
  weightUnit: AnimalWeightUnit;
  status: AnimalStatus;
  farm: string;
  paddock: string;
  group: string;
  notes: string;
  imageUris?: string[];
  tone: AnimalTone;
};
