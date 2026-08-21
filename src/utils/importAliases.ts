import type { AnimalSex, AnimalSource, AnimalStatus, AnimalWeightUnit } from '../entities/animal';

/**
 * The vocabulary of animal import: what a column can be mapped to, and which
 * spellings of a header or a cell value are recognised automatically.
 *
 * Two layers, and they solve different halves of the same problem:
 *
 * 1. Header aliases decide which column is which. A header that isn't
 *    recognised isn't a failure — the import screen shows the column and the
 *    user picks the field by hand, which is what makes a file in any language
 *    importable without a translation table for every language on earth.
 *
 * 2. Value aliases decide what a cell in one of the four closed-vocabulary
 *    columns (species, sex, status, source) actually means. The same rule
 *    applies: an unrecognised value is never guessed and never silently
 *    dropped — it is collected and asked about once, however many rows use it.
 *    This is the layer that stops a status of `sale` from quietly becoming
 *    `Active`.
 *
 * The tables below cover English thoroughly and carry the commonest terms from
 * a few other languages, because those are free to add and save the user a
 * tap. They are a head start on the mapping step, never a replacement for it.
 */

export type AnimalImportField =
  | 'tag'
  | 'name'
  | 'species'
  | 'eid'
  | 'sex'
  | 'breed'
  | 'dateOfBirth'
  | 'status'
  | 'farm'
  | 'location'
  | 'label'
  | 'weight'
  | 'source'
  | 'farmEntryDate'
  | 'notes';

export type AnimalImportFieldDefinition = {
  id: AnimalImportField;
  label: string;
  /** Shown under the label in the column mapping step. */
  hint: string;
  /** Only the tag is required — an animal with no identifier is not a record. */
  required?: boolean;
};

/**
 * Field order here is the order the mapping step lists them in, and it matches
 * the column order of the app's own CSV export so a round-tripped file reads
 * top to bottom.
 */
export const ANIMAL_IMPORT_FIELDS: AnimalImportFieldDefinition[] = [
  { id: 'tag', label: 'Tag / ID', hint: 'The identifier in the ear tag', required: true },
  { id: 'eid', label: 'EID', hint: 'Electronic tag or bolus number' },
  { id: 'name', label: 'Name', hint: 'Optional herd name' },
  { id: 'species', label: 'Species', hint: 'Cattle, Sheep, Pig…' },
  { id: 'sex', label: 'Sex', hint: 'Female or male' },
  { id: 'breed', label: 'Breed', hint: 'Free text' },
  { id: 'dateOfBirth', label: 'Date of birth', hint: 'Any common date format' },
  { id: 'status', label: 'Status', hint: 'Active, Sold or Deceased' },
  { id: 'farm', label: 'Farm', hint: 'Matched to your farms' },
  { id: 'location', label: 'Location', hint: 'Matched to your locations' },
  { id: 'label', label: 'Label', hint: 'Matched to your labels' },
  { id: 'weight', label: 'Weight', hint: 'Number, with or without a unit' },
  { id: 'source', label: 'Source', hint: 'How the animal joined the farm' },
  { id: 'farmEntryDate', label: 'Acquired date', hint: 'When it joined this farm' },
  { id: 'notes', label: 'Notes', hint: 'Free text' },
];

export const ANIMAL_IMPORT_FIELD_LABELS: Record<AnimalImportField, string> = ANIMAL_IMPORT_FIELDS.reduce(
  (labels, field) => ({ ...labels, [field.id]: field.label }),
  {} as Record<AnimalImportField, string>,
);

/** The four columns whose values are a closed set, so unknown ones must be mapped. */
export const MAPPED_VALUE_FIELDS = ['species', 'sex', 'status', 'source'] as const;

export type MappedValueField = (typeof MAPPED_VALUE_FIELDS)[number];

// ---------------------------------------------------------------------------
// Header aliases
// ---------------------------------------------------------------------------

const HEADER_ALIASES: Record<AnimalImportField, string[]> = {
  tag: [
    'tag', 'tag no', 'tag number', 'tag id', 'ear tag', 'eartag', 'ear tag no', 'eartag number',
    'id', 'animal id', 'animal', 'animal no', 'animal number', 'number', 'no', 'ref', 'reference',
    'identifier', 'uid', 'visual id', 'management tag', 'herd number', 'flock number',
    // Spanish / French / German / Italian / Portuguese / Dutch / Greek
    'crotal', 'numero', 'num', 'boucle', 'ohrmarke', 'lebensohrnummer', 'marca auricular',
    'oormerk', 'ενωτιο', 'κωδικος', 'αριθμος',
  ],
  name: [
    'name', 'animal name', 'given name', 'nickname', 'nombre', 'nom', 'name des tieres',
    'nome', 'naam', 'ονομα',
  ],
  species: [
    'species', 'animal type', 'type', 'kind', 'livestock type', 'stock type', 'class',
    'especie', 'espece', 'tierart', 'art', 'specie', 'especie animal', 'soort', 'ειδος',
  ],
  sex: ['sex', 'gender', 'm f', 'sexo', 'sexe', 'geschlecht', 'sesso', 'geslacht', 'φυλο'],
  breed: ['breed', 'breeding', 'raza', 'race', 'rasse', 'razza', 'raca', 'ras', 'ρατσα', 'φυλη'],
  dateOfBirth: [
    'date of birth', 'dob', 'birth date', 'birthdate', 'born', 'born on', 'birth', 'birthday',
    'calving date', 'lambing date',
    'fecha de nacimiento', 'nacimiento', 'date de naissance', 'naissance', 'geburtsdatum',
    'geburt', 'data di nascita', 'data de nascimento', 'geboortedatum', 'ημερομηνια γεννησης',
  ],
  status: [
    'status', 'state', 'animal status', 'current status', 'condition', 'disposition', 'outcome',
    'estado', 'statut', 'etat', 'zustand', 'stato', 'situacao', 'κατασταση',
  ],
  farm: [
    'farm', 'holding', 'holding number', 'cph', 'premises', 'property', 'unit', 'site', 'location',
    'granja', 'finca', 'ferme', 'exploitation', 'betrieb', 'hof', 'azienda', 'fazenda', 'bedrijf',
    'φαρμα', 'εκμεταλλευση',
  ],
  // 'paddock' stays accepted: spreadsheets people already keep — and anything
  // exported before the Locations rename — carry that header.
  eid: [
    'eid', 'e.i.d', 'electronic id', 'electronic identification', 'electronic tag',
    'rfid', 'transponder', 'bolus', 'eid number', 'eid tag', 'edt',
  ],
  location: [
    'location', 'locations',
    'paddock', 'field', 'pasture', 'pen', 'shed', 'barn', 'yard', 'house', 'block',
    'potrero', 'parcela', 'parcelle', 'enclos', 'koppel', 'weide', 'campo', 'pascolo',
    'βοσκοτοπος', 'σταβλος',
  ],
  // 'group' and its translations stay accepted: spreadsheets people already
  // keep — and any exported before the Labels rename — carry that header.
  label: [
    'label', 'labels', 'tag', 'tags',
    'group', 'mob', 'batch', 'lot', 'management group', 'grouping', 'category',
    'grupo', 'groupe', 'gruppe', 'gruppo', 'groep', 'ομαδα',
    'etiqueta', 'etiquette', 'etikett', 'etichetta', 'ετικετα',
  ],
  weight: [
    'weight', 'live weight', 'liveweight', 'lw', 'bodyweight', 'body weight', 'kg', 'weight kg',
    'peso', 'poids', 'gewicht', 'βαρος',
  ],
  source: [
    'source', 'origin', 'acquired', 'acquisition', 'how acquired', 'entry type', 'obtained',
    'origen', 'procedencia', 'origine', 'herkunft', 'origem', 'herkomst', 'προελευση',
  ],
  farmEntryDate: [
    'acquired date', 'date acquired', 'farm entry date', 'entry date', 'date of entry',
    'arrival date', 'arrived', 'date in', 'purchase date', 'date purchased', 'moved in',
    'fecha de entrada', 'date entree', 'zugangsdatum', 'data di ingresso', 'ημερομηνια εισοδου',
  ],
  notes: [
    'notes', 'note', 'comment', 'comments', 'remarks', 'remark', 'description', 'details', 'memo',
    'notas', 'observaciones', 'remarques', 'bemerkungen', 'notizen', 'anmerkungen', 'note',
    'observacoes', 'opmerkingen', 'σημειωσεις', 'παρατηρησεις',
  ],
};

// ---------------------------------------------------------------------------
// Value aliases
// ---------------------------------------------------------------------------

/**
 * Species aliases resolve to the exact `SPECIES_OPTIONS` labels — the species
 * string drives the animal's tone and therefore its whole card treatment, so a
 * near-miss like `cows` must land on `Cattle` rather than becoming its own
 * unknown species.
 *
 * Sex- and age-specific words (heifer, ewe, sow) are included deliberately:
 * plenty of farm lists use them as the species column. They also appear in the
 * sex table, which is fine — a value is only ever looked up against the table
 * for the column it was mapped to.
 */
const SPECIES_VALUE_ALIASES: Record<string, string[]> = {
  Cattle: [
    'cattle', 'cow', 'cows', 'calf', 'calves', 'heifer', 'heifers', 'bull', 'bulls', 'steer',
    'steers', 'bullock', 'bovine', 'beef', 'dairy', 'ox', 'oxen',
    'vaca', 'vacas', 'bovino', 'ganado', 'vache', 'bovin', 'rind', 'rinder', 'kuh', 'kuhe',
    'mucca', 'gado', 'koe', 'rund', 'αγελαδα', 'βοοειδη', 'μοσχαρι',
  ],
  Sheep: [
    'sheep', 'ewe', 'ewes', 'ram', 'rams', 'lamb', 'lambs', 'hogget', 'wether', 'tup',
    'oveja', 'ovino', 'brebis', 'mouton', 'ovin', 'schaf', 'schafe', 'pecora', 'ovelha',
    'schaap', 'προβατο', 'προβατα', 'αρνι',
  ],
  Pig: [
    'pig', 'pigs', 'swine', 'hog', 'hogs', 'sow', 'sows', 'boar', 'boars', 'piglet', 'piglets',
    'weaner', 'weaners', 'gilt', 'porker', 'porcine',
    'cerdo', 'porcino', 'cochon', 'porc', 'schwein', 'schweine', 'maiale', 'porco', 'varken',
    'γουρουνι', 'χοιρος',
  ],
  Goat: [
    'goat', 'goats', 'doe', 'buck', 'kid', 'kids', 'nanny', 'billy', 'caprine',
    'cabra', 'caprino', 'chevre', 'ziege', 'ziegen', 'capra', 'bode', 'geit', 'κατσικα', 'γιδα',
  ],
  Chicken: [
    'chicken', 'chickens', 'hen', 'hens', 'cock', 'cockerel', 'rooster', 'chick', 'chicks',
    'broiler', 'broilers', 'layer', 'layers', 'pullet', 'poultry', 'fowl',
    'gallina', 'pollo', 'poule', 'poulet', 'huhn', 'huhner', 'hahn', 'gallo', 'galinha',
    'kip', 'κοτα', 'κοτοπουλο', 'ορνιθα',
  ],
  Duck: ['duck', 'ducks', 'drake', 'duckling', 'pato', 'canard', 'ente', 'anatra', 'eend', 'παπια'],
  Turkey: ['turkey', 'turkeys', 'poult', 'pavo', 'dinde', 'pute', 'truthahn', 'tacchino', 'kalkoen', 'γαλοπουλα'],
  Goose: ['goose', 'geese', 'gander', 'gosling', 'ganso', 'oie', 'gans', 'oca', 'χηνα'],
  Donkey: ['donkey', 'donkeys', 'ass', 'jenny', 'jack', 'burro', 'ane', 'esel', 'asino', 'ezel', 'γαιδαρος'],
  Horse: [
    'horse', 'horses', 'equine', 'mare', 'stallion', 'gelding', 'foal', 'colt', 'filly', 'pony',
    'caballo', 'yegua', 'cheval', 'jument', 'pferd', 'stute', 'cavallo', 'cavalo', 'paard',
    'αλογο', 'ιππος',
  ],
  Buffalo: ['buffalo', 'buffaloes', 'bison', 'water buffalo', 'bufalo', 'bufflonne', 'bufalo', 'buffel', 'βουβαλι'],
  Rabbit: ['rabbit', 'rabbits', 'doe rabbit', 'kit', 'conejo', 'lapin', 'kaninchen', 'coniglio', 'konijn', 'κουνελι'],
  Alpaca: ['alpaca', 'alpacas', 'cria', 'alpaka', 'αλπακα'],
  Llama: ['llama', 'llamas', 'lama', 'λαμα'],
  Camel: ['camel', 'camels', 'dromedary', 'camello', 'chameau', 'kamel', 'cammello', 'καμηλα'],
  Ostrich: ['ostrich', 'ostriches', 'avestruz', 'autruche', 'strauss', 'struzzo', 'στρουθοκαμηλος'],
};

const SEX_VALUE_ALIASES: Record<AnimalSex, string[]> = {
  female: [
    'f', 'female', 'fem', 'girl', 'she', 'cow', 'heifer', 'ewe', 'sow', 'gilt', 'doe', 'nanny',
    'hen', 'mare', 'filly', 'jenny', 'dam',
    'hembra', 'femelle', 'weiblich', 'femmina', 'femea', 'vrouwelijk', 'θηλυ', 'θηλυκο',
  ],
  male: [
    'm', 'male', 'boy', 'he', 'bull', 'steer', 'bullock', 'ox', 'ram', 'tup', 'wether', 'boar',
    'buck', 'billy', 'cock', 'cockerel', 'rooster', 'stallion', 'gelding', 'colt', 'jack', 'sire',
    'macho', 'male animal', 'mannlich', 'maschio', 'mannelijk', 'αρσενικο', 'αρρεν',
  ],
};

/**
 * `sale` mapping to `Sold` is the exact case a header-only alias table would
 * have missed — a sale column written in the noun rather than the participle.
 */
const STATUS_VALUE_ALIASES: Record<AnimalStatus, string[]> = {
  Active: [
    'active', 'alive', 'live', 'current', 'on farm', 'onfarm', 'in herd', 'in flock', 'retained',
    'present', 'open', 'ok', 'healthy', 'yes',
    'activo', 'vivo', 'actif', 'vivant', 'aktiv', 'lebend', 'attivo', 'actief', 'ενεργο', 'ζωντανο',
  ],
  Sold: [
    'sold', 'sale', 'sales', 'for sale', 'sold off', 'slaughtered', 'slaughter', 'culled', 'cull',
    'butchered', 'moved off', 'left farm', 'off farm', 'gone', 'transferred out', 'disposed',
    'vendido', 'venta', 'vendu', 'vente', 'verkauft', 'verkauf', 'venduto', 'verkocht',
    'πωληθηκε', 'πωληση',
  ],
  Deceased: [
    'deceased', 'dead', 'died', 'death', 'mortality', 'lost', 'fallen', 'perished', 'euthanised',
    'euthanized', 'stillborn', 'casualty',
    'muerto', 'fallecido', 'mort', 'decede', 'tot', 'gestorben', 'verendet', 'morto', 'dood',
    'νεκρο', 'θανατος', 'ψοφιο',
  ],
};

const SOURCE_VALUE_ALIASES: Record<Exclude<AnimalSource, ''>, string[]> = {
  'Born on farm': [
    'born on farm', 'born', 'homebred', 'home bred', 'bred', 'birth', 'born here', 'own breeding',
    'nacido', 'nacido en la granja', 'ne sur la ferme', 'geboren', 'eigene nachzucht', 'nato',
    'γεννηθηκε', 'γεννηση',
  ],
  Purchased: [
    'purchased', 'purchase', 'bought', 'buy', 'market', 'auction', 'dealer',
    'comprado', 'compra', 'achete', 'achat', 'gekauft', 'kauf', 'acquistato', 'comprado',
    'gekocht', 'αγορα', 'αγορασθηκε',
  ],
  'Transferred in': [
    'transferred in', 'transfer in', 'transferred', 'transfer', 'moved in', 'moved from',
    'brought in', 'imported', 'gift', 'loan',
    'transferido', 'transfere', 'ubertragen', 'zugang', 'trasferito', 'overgebracht',
    'μεταφορα', 'μεταφερθηκε',
  ],
  Other: ['other', 'unknown', 'n a', 'na', 'misc', 'otro', 'autre', 'sonstige', 'altro', 'overig', 'αλλο'],
};

const WEIGHT_UNIT_ALIASES: Record<AnimalWeightUnit, string[]> = {
  kg: ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms', 'kilogramme', 'kilogrammes', 'κιλα'],
  lb: ['lb', 'lbs', 'pound', 'pounds', 'libra', 'libras'],
  st: ['st', 'stone', 'stones'],
};

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Reduces a header or cell value to a comparison key: lower case, accents
 * removed, punctuation and spacing collapsed. `Ear-Tag No.`, `ear tag no` and
 * `EAR_TAG_NO` all become `ear tag no`, and `Vendu` matches `vendu`.
 */
export function normalizeLookupKey(value: string) {
  const lowered = value.trim().toLowerCase();
  // Hermes implements String.prototype.normalize, but guard anyway: without
  // it the key simply keeps its accents, which costs a match rather than
  // throwing in the middle of an import.
  const withoutAccents =
    typeof lowered.normalize === 'function'
      ? lowered.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      : lowered;

  return withoutAccents
    .replace(/[_\-./\\()[\]{}#*:;,'"]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildLookup(table: Record<string, string[]>) {
  const lookup = new Map<string, string>();

  for (const [canonical, aliases] of Object.entries(table)) {
    // The canonical spelling is always its own alias, so a table never has to
    // repeat it.
    lookup.set(normalizeLookupKey(canonical), canonical);

    for (const alias of aliases) {
      const key = normalizeLookupKey(alias);

      // First definition wins, so a word shared between two canonical values
      // resolves the same way every time regardless of object key order.
      if (!lookup.has(key)) {
        lookup.set(key, canonical);
      }
    }
  }

  return lookup;
}

const HEADER_LOOKUP = (() => {
  const lookup = new Map<string, AnimalImportField>();

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[AnimalImportField, string[]]>) {
    for (const alias of aliases) {
      const key = normalizeLookupKey(alias);

      if (!lookup.has(key)) {
        lookup.set(key, field);
      }
    }
  }

  // Field labels match too — a file exported from this app has `Tag / ID` and
  // `Date of birth` as its headers.
  for (const field of ANIMAL_IMPORT_FIELDS) {
    const key = normalizeLookupKey(field.label);

    if (!lookup.has(key)) {
      lookup.set(key, field.id);
    }
  }

  return lookup;
})();

const SPECIES_LOOKUP = buildLookup(SPECIES_VALUE_ALIASES);
const SEX_LOOKUP = buildLookup(SEX_VALUE_ALIASES);
const STATUS_LOOKUP = buildLookup(STATUS_VALUE_ALIASES);
const SOURCE_LOOKUP = buildLookup(SOURCE_VALUE_ALIASES);
const WEIGHT_UNIT_LOOKUP = buildLookup(WEIGHT_UNIT_ALIASES);

/** The field a header maps to, or null when the user has to choose. */
export function matchHeaderField(header: string): AnimalImportField | null {
  return HEADER_LOOKUP.get(normalizeLookupKey(header)) ?? null;
}

/** A species label from `SPECIES_OPTIONS`, or null when unrecognised. */
export function matchSpecies(value: string): string | null {
  return SPECIES_LOOKUP.get(normalizeLookupKey(value)) ?? null;
}

export function matchSex(value: string): AnimalSex | null {
  return (SEX_LOOKUP.get(normalizeLookupKey(value)) as AnimalSex | undefined) ?? null;
}

export function matchStatus(value: string): AnimalStatus | null {
  return (STATUS_LOOKUP.get(normalizeLookupKey(value)) as AnimalStatus | undefined) ?? null;
}

export function matchSource(value: string): AnimalSource | null {
  return (SOURCE_LOOKUP.get(normalizeLookupKey(value)) as AnimalSource | undefined) ?? null;
}

export function matchWeightUnit(value: string): AnimalWeightUnit | null {
  return (WEIGHT_UNIT_LOOKUP.get(normalizeLookupKey(value)) as AnimalWeightUnit | undefined) ?? null;
}

/** Every value the mapping step can offer for one of the closed-set columns. */
export function optionsForMappedField(field: MappedValueField): string[] {
  switch (field) {
    case 'species':
      return Object.keys(SPECIES_VALUE_ALIASES);
    case 'sex':
      return Object.keys(SEX_VALUE_ALIASES);
    case 'status':
      return Object.keys(STATUS_VALUE_ALIASES);
    case 'source':
      return Object.keys(SOURCE_VALUE_ALIASES);
  }
}

/** Looks a value up against the table for the column it was mapped to. */
export function matchMappedValue(field: MappedValueField, value: string): string | null {
  switch (field) {
    case 'species':
      return matchSpecies(value);
    case 'sex':
      return matchSex(value);
    case 'status':
      return matchStatus(value);
    case 'source':
      return matchSource(value);
  }
}
