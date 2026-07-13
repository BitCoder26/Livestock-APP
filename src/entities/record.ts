export type RecordSpeciesTone = 'cow' | 'sheep' | 'pig' | 'goat' | 'neutral';

export type RecordEntry = {
  id: string;
  date: string;
  animal: string;
  animalTag: string;
  animalIds?: string[];
  species: string;
  speciesTone: RecordSpeciesTone;
  title: string;
  details: string;
  type: string;
  medicine?: string;
  dose?: string;
  doseUnit?: string;
  route?: string;
  withdrawal?: string;
  imageUris?: string[];
};
