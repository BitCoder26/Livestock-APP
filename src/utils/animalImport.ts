import type { CreateAnimalInput } from '../context/AnimalsContext';
import type { FarmEntity, LabelEntity, LocationEntity } from '../context/SetupContext';
import type { AppDateFormat } from '../entities/account';
import type {
  Animal,
  AnimalSex,
  AnimalSource,
  AnimalStatus,
  AnimalWeightUnit,
} from '../entities/animal';
import { detectUnreadable, isBlankRow, parseCsv, type CsvDelimiter, type CsvUnreadableReason } from './csv';
import { formatDateForStorage } from './dateFormat';
import {
  MAPPED_VALUE_FIELDS,
  matchHeaderField,
  matchMappedValue,
  matchWeightUnit,
  normalizeLookupKey,
  type AnimalImportField,
  type MappedValueField,
} from './importAliases';

/**
 * Turns parsed CSV (or a typed list of tags) into animals, and — before
 * anything is written — into an honest account of what would happen.
 *
 * The governing rule throughout: nothing is ever guessed. A value that isn't
 * understood produces an issue on its row, which the import screen either asks
 * the user to resolve or reports as a skipped row. It never becomes a default
 * that quietly misfiles an animal.
 */

/** Which field each column feeds. `null` means the column is ignored. */
export type ImportColumnMapping = Array<AnimalImportField | null>;

export type ImportTable = {
  /** Header labels, or `Column 1`-style placeholders when the file has none. */
  headers: string[];
  hasHeaderRow: boolean;
  /** Data rows only — banner and header rows are already removed. */
  rows: string[][];
  /** Line number in the original file for each data row, for error messages. */
  rowNumbers: number[];
  delimiter: CsvDelimiter;
};

export type BuildTableFailure = CsvUnreadableReason | 'empty';

export type BuildTableResult =
  | { ok: true; table: ImportTable }
  | { ok: false; reason: BuildTableFailure };

/**
 * Values used for any field a file doesn't carry a column for. The typed-tags
 * path supplies all of them and maps only the tag; a CSV supplies them for
 * whatever it is missing.
 */
export type ImportDefaults = {
  species: string;
  sex: AnimalSex;
  status: AnimalStatus;
  breed: string;
  farm: string;
  location: string;
  label: string;
  source: AnimalSource | '';
  dateOfBirth: string;
  farmEntryDate: string;
  weightUnit: AnimalWeightUnit;
};

export const DEFAULT_IMPORT_DEFAULTS: ImportDefaults = {
  species: '',
  sex: 'female',
  status: 'Active',
  breed: '',
  farm: '',
  location: '',
  label: '',
  source: '',
  dateOfBirth: '',
  farmEntryDate: '',
  weightUnit: 'kg',
};

/**
 * The user's answers for cell values the alias tables didn't recognise, keyed
 * by field then by normalised value. An empty string means "leave it blank",
 * which is a deliberate answer rather than an unresolved one.
 */
export type ImportValueOverrides = Partial<Record<MappedValueField, Record<string, string>>>;

export type ImportRowIssue =
  | { kind: 'missing-tag' }
  | { kind: 'duplicate-in-file'; firstRowNumber: number }
  | { kind: 'duplicate-existing' }
  | { kind: 'unmapped-value'; field: MappedValueField; value: string }
  | { kind: 'invalid-date'; field: 'dateOfBirth' | 'farmEntryDate'; value: string }
  | { kind: 'invalid-weight'; value: string };

/**
 * - `ready`   — will be imported.
 * - `skipped` — a duplicate. Not an error: the animal already exists, so
 *               importing it again would either fail or double it up.
 * - `blocked` — something must be answered or fixed before this row can go in.
 */
export type ImportRowStatus = 'ready' | 'skipped' | 'blocked';

export type ImportRowResult = {
  rowNumber: number;
  tag: string;
  status: ImportRowStatus;
  issues: ImportRowIssue[];
  /** Populated for `ready` rows only. */
  animal: CreateAnimalInput | null;
};

export type UnmappedValue = {
  field: MappedValueField;
  /** The value exactly as written in the file, for showing back to the user. */
  value: string;
  /** How many rows use it — asked once, however many rows that is. */
  count: number;
};

export type ImportAnalysis = {
  rows: ImportRowResult[];
  readyCount: number;
  skippedCount: number;
  blockedCount: number;
  /** Distinct unrecognised values across the four closed-vocabulary columns. */
  unmappedValues: UnmappedValue[];
  /** Farm/location/label names in the file that don't exist in Setup yet. */
  newFarms: string[];
  newLocations: string[];
  newLabels: string[];
};

// ---------------------------------------------------------------------------
// Reading a file into a table
// ---------------------------------------------------------------------------

/** How many rows from the top are considered when hunting for the header. */
const HEADER_SEARCH_DEPTH = 5;

export function buildImportTable(text: string): BuildTableResult {
  const unreadable = detectUnreadable(text);

  if (unreadable) {
    return { ok: false, reason: unreadable };
  }

  const { rows, delimiter } = parseCsv(text);
  // Keep each row's original line number before the blanks are dropped, so an
  // error can name the line the user sees in their spreadsheet.
  const numbered = rows
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter((entry) => !isBlankRow(entry.row));

  if (numbered.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  const headerIndex = findHeaderRowIndex(numbered.map((entry) => entry.row));

  if (headerIndex === null) {
    // No recognisable header. Everything is data, and the columns are named
    // positionally for the mapping step to work with.
    const width = Math.max(...numbered.map((entry) => entry.row.length));

    return {
      ok: true,
      table: {
        headers: Array.from({ length: width }, (_, index) => `Column ${index + 1}`),
        hasHeaderRow: false,
        rows: numbered.map((entry) => entry.row),
        rowNumbers: numbered.map((entry) => entry.rowNumber),
        delimiter,
      },
    };
  }

  const dataEntries = numbered.slice(headerIndex + 1);

  return {
    ok: true,
    table: {
      headers: numbered[headerIndex].row.map((header) => header.trim()),
      hasHeaderRow: true,
      rows: dataEntries.map((entry) => entry.row),
      rowNumbers: dataEntries.map((entry) => entry.rowNumber),
      delimiter,
    },
  };
}

/**
 * Finds the header row, which is not always the first one: this app's own CSV
 * export opens with a `LivestockBook` banner and a blank line, and plenty of
 * spreadsheets carry a title above the table. The header is whichever of the
 * first few rows recognises the most field names.
 */
function findHeaderRowIndex(rows: string[][]): number | null {
  let best: { index: number; matches: number } | null = null;

  for (let index = 0; index < Math.min(rows.length, HEADER_SEARCH_DEPTH); index += 1) {
    const matches = rows[index].filter((cell) => cell.trim() && matchHeaderField(cell) !== null).length;

    if (matches > (best?.matches ?? 0)) {
      best = { index, matches };
    }
  }

  // One match is enough when it is the only column — a file that is just a
  // list of tags under a `Tag` heading is a real and common shape.
  if (!best || best.matches === 0) {
    return null;
  }

  if (best.matches === 1 && rows[best.index].filter((cell) => cell.trim()).length > 2) {
    // A single hit in a wide row is more likely a data value that happens to
    // read like a field name (`Sold`, `Cattle`) than a header.
    return null;
  }

  return best.index;
}

/** First-pass column mapping. Every column the aliases recognise, in order. */
export function autoMapColumns(headers: string[]): ImportColumnMapping {
  const used = new Set<AnimalImportField>();

  return headers.map((header) => {
    const field = matchHeaderField(header);

    // A file with two columns both reading as `Notes` maps the first and
    // leaves the second for the user, rather than silently overwriting.
    if (!field || used.has(field)) {
      return null;
    }

    used.add(field);
    return field;
  });
}

/**
 * Splits typed or pasted text into tags: one per line, and commas inside a
 * line treated as separators too, since people paste both shapes.
 */
export function splitTagList(text: string): string[] {
  return text
    .split(/[\n\r,;]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** Builds the single-column table the typed-tags path analyses. */
export function buildTagTable(text: string): ImportTable {
  const tags = splitTagList(text);

  return {
    headers: ['Tag / ID'],
    hasHeaderRow: false,
    rows: tags.map((tag) => [tag]),
    rowNumbers: tags.map((_, index) => index + 1),
    delimiter: ',',
  };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export type AnalyzeImportOptions = {
  table: ImportTable;
  mapping: ImportColumnMapping;
  defaults: ImportDefaults;
  valueOverrides: ImportValueOverrides;
  dateFormat: AppDateFormat;
  existingAnimals: Animal[];
  farms: FarmEntity[];
  locations: LocationEntity[];
  labels: LabelEntity[];
};

export function analyzeImport({
  table,
  mapping,
  defaults,
  valueOverrides,
  dateFormat,
  existingAnimals,
  farms,
  locations,
  labels,
}: AnalyzeImportOptions): ImportAnalysis {
  const existingTags = new Set(existingAnimals.map((animal) => normalizeTag(animal.id)));
  const seenTags = new Map<string, number>();
  const unmappedValues = new Map<string, UnmappedValue>();
  const newFarms = new Map<string, string>();
  const newLocations = new Map<string, string>();
  const newLabels = new Map<string, string>();

  const rows = table.rows.map((row, index) => {
    const rowNumber = table.rowNumbers[index] ?? index + 1;
    const issues: ImportRowIssue[] = [];
    const cell = (field: AnimalImportField) => {
      const columnIndex = mapping.indexOf(field);
      return columnIndex === -1 ? '' : (row[columnIndex] ?? '').trim();
    };

    const tag = cell('tag');

    if (!tag) {
      return { rowNumber, tag: '', status: 'blocked' as const, issues: [{ kind: 'missing-tag' as const }], animal: null };
    }

    const normalizedTag = normalizeTag(tag);
    const firstRowNumber = seenTags.get(normalizedTag);

    if (firstRowNumber !== undefined) {
      return {
        rowNumber,
        tag,
        status: 'skipped' as const,
        issues: [{ kind: 'duplicate-in-file' as const, firstRowNumber }],
        animal: null,
      };
    }

    seenTags.set(normalizedTag, rowNumber);

    if (existingTags.has(normalizedTag)) {
      return {
        rowNumber,
        tag,
        status: 'skipped' as const,
        issues: [{ kind: 'duplicate-existing' as const }],
        animal: null,
      };
    }

    // Closed-vocabulary columns. An unrecognised value with no answer from the
    // user blocks the row — it is never defaulted away.
    const resolveMapped = (field: MappedValueField, fallback: string): string | null => {
      const raw = cell(field);

      if (!raw) {
        return fallback;
      }

      const matched = matchMappedValue(field, raw);

      if (matched) {
        return matched;
      }

      const override = valueOverrides[field]?.[normalizeLookupKey(raw)];

      if (override !== undefined) {
        // An empty override is the user choosing "leave blank", which means
        // fall back to the default for this field.
        return override === '' ? fallback : override;
      }

      const key = `${field}:${normalizeLookupKey(raw)}`;
      const existing = unmappedValues.get(key);

      if (existing) {
        existing.count += 1;
      } else {
        unmappedValues.set(key, { field, value: raw, count: 1 });
      }

      issues.push({ kind: 'unmapped-value', field, value: raw });
      return null;
    };

    const species = resolveMapped('species', defaults.species);
    const sexValue = resolveMapped('sex', defaults.sex);
    const statusValue = resolveMapped('status', defaults.status);
    const sourceValue = resolveMapped('source', defaults.source);

    const dateOfBirth = resolveDate(cell('dateOfBirth'), defaults.dateOfBirth, dateFormat, issues, 'dateOfBirth');
    const farmEntryDate = resolveDate(
      cell('farmEntryDate'),
      defaults.farmEntryDate,
      dateFormat,
      issues,
      'farmEntryDate',
    );

    const weightCell = cell('weight');
    const weight = parseWeight(weightCell, defaults.weightUnit);

    if (weightCell && !weight) {
      issues.push({ kind: 'invalid-weight', value: weightCell });
    }

    const farmName = cell('farm') || defaults.farm;
    const locationName = cell('location') || defaults.location;
    const labelName = cell('label') || defaults.label;

    const farm = farms.find((entry) => equalsIgnoreCase(entry.name, farmName));
    const location = locations.find(
      (entry) =>
        equalsIgnoreCase(entry.name, locationName) &&
        (!farm || entry.farmUid === farm.uid || equalsIgnoreCase(entry.farm, farm.name)),
    );
    const label = labels.find((entry) => equalsIgnoreCase(entry.name, labelName));

    if (farmName && !farm) {
      newFarms.set(normalizeLookupKey(farmName), farmName);
    }

    if (locationName && !location) {
      newLocations.set(normalizeLookupKey(locationName), locationName);
    }

    if (labelName && !label) {
      newLabels.set(normalizeLookupKey(labelName), labelName);
    }

    if (issues.length > 0) {
      return { rowNumber, tag, status: 'blocked' as const, issues, animal: null };
    }

    const animal: CreateAnimalInput = {
      id: tag,
      eid: cell('eid'),
      name: cell('name'),
      species: species ?? '',
      sex: (sexValue as AnimalSex) || 'female',
      ageValue: '',
      ageUnit: 'years old',
      breed: cell('breed') || defaults.breed,
      dateOfBirth,
      weight: weight?.value ?? '',
      weightUnit: weight?.unit ?? defaults.weightUnit,
      status: (statusValue as AnimalStatus) || 'Active',
      farmUid: farm?.uid,
      farm: farmName,
      locationUid: location?.uid,
      location: locationName,
      // One label column in, one label out — an animal can carry several, but
      // a spreadsheet row only ever names one.
      labelUids: label?.uid ? [label.uid] : [],
      labels: labelName ? [labelName] : [],
      source: (sourceValue as AnimalSource) || '',
      farmEntryDate,
      notes: cell('notes'),
      imageUris: [],
      showImageOnCard: false,
    };

    return { rowNumber, tag, status: 'ready' as const, issues, animal };
  });

  return {
    rows,
    readyCount: rows.filter((row) => row.status === 'ready').length,
    skippedCount: rows.filter((row) => row.status === 'skipped').length,
    blockedCount: rows.filter((row) => row.status === 'blocked').length,
    unmappedValues: [...unmappedValues.values()].sort(
      (left, right) =>
        MAPPED_VALUE_FIELDS.indexOf(left.field) - MAPPED_VALUE_FIELDS.indexOf(right.field) ||
        right.count - left.count,
    ),
    newFarms: [...newFarms.values()],
    newLocations: [...newLocations.values()],
    newLabels: [...newLabels.values()],
  };
}

/** The animals an analysis would actually write. */
export function readyAnimals(analysis: ImportAnalysis): CreateAnimalInput[] {
  return analysis.rows
    .filter((row): row is ImportRowResult & { animal: CreateAnimalInput } => row.status === 'ready' && !!row.animal)
    .map((row) => row.animal);
}

// ---------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Dates are the one place a file is genuinely ambiguous: `03/04/2025` is two
 * different days depending on who wrote it. Rules, in order:
 *
 * 1. An unambiguous component decides it — a 25 can only be a day.
 * 2. Otherwise the user's own date format setting decides, because that is the
 *    best evidence available of how they write dates.
 *
 * The resolved date is shown back in the preview, so a wrong guess is visible
 * before anything is imported rather than discovered months later.
 */
export function parseImportDate(value: string, dateFormat: AppDateFormat): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  const iso = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);

  if (iso) {
    return buildIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const numeric = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);

  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = expandYear(Number(numeric[3]), numeric[3].length);

    if (first > 12 && second <= 12) {
      return buildIsoDate(year, second, first);
    }

    if (second > 12 && first <= 12) {
      return buildIsoDate(year, first, second);
    }

    return dateFormat === 'MM/DD/YYYY'
      ? buildIsoDate(year, first, second)
      : buildIsoDate(year, second, first);
  }

  // `12 Mar 2020`, `12 March 2020`
  const dayFirst = trimmed.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s-]+(\d{2}|\d{4})$/);

  if (dayFirst) {
    const monthIndex = MONTH_INDEX[dayFirst[2].slice(0, 3).toLowerCase()];
    return monthIndex === undefined
      ? null
      : buildIsoDate(expandYear(Number(dayFirst[3]), dayFirst[3].length), monthIndex + 1, Number(dayFirst[1]));
  }

  // `Mar 12 2020`, `March 12, 2020`
  const monthFirst = trimmed.match(/^([A-Za-z]{3,})[\s-]+(\d{1,2}),?[\s-]+(\d{2}|\d{4})$/);

  if (monthFirst) {
    const monthIndex = MONTH_INDEX[monthFirst[1].slice(0, 3).toLowerCase()];
    return monthIndex === undefined
      ? null
      : buildIsoDate(expandYear(Number(monthFirst[3]), monthFirst[3].length), monthIndex + 1, Number(monthFirst[2]));
  }

  return null;
}

function resolveDate(
  raw: string,
  fallback: string,
  dateFormat: AppDateFormat,
  issues: ImportRowIssue[],
  field: 'dateOfBirth' | 'farmEntryDate',
): string {
  if (!raw) {
    return fallback;
  }

  const parsed = parseImportDate(raw, dateFormat);

  if (parsed === null) {
    issues.push({ kind: 'invalid-date', field, value: raw });
    return '';
  }

  return parsed;
}

function buildIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(year, month - 1, day);

  // Rejects the impossible (31 February) rather than letting Date roll it over
  // into March, which would import a birth date the file never contained.
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return formatDateForStorage(date);
}

/** Two-digit years: `98` is 1998, `24` is 2024 — the usual spreadsheet pivot. */
function expandYear(year: number, digits: number) {
  if (digits === 4) {
    return year;
  }

  return year >= 70 ? 1900 + year : 2000 + year;
}

/**
 * Weight arrives as `62`, `62 kg`, `62,5` (decimal comma) or `9 st`. The unit
 * travels with the number when the file states one; otherwise the import's
 * default unit applies.
 */
export function parseWeight(
  value: string,
  defaultUnit: AnimalWeightUnit,
): { value: string; unit: AnimalWeightUnit } | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return { value: '', unit: defaultUnit };
  }

  const match = trimmed.match(/^([0-9]+(?:[.,][0-9]+)?)\s*([A-Za-zΑ-Ωα-ω]*)$/);

  if (!match) {
    return null;
  }

  const amount = match[1].replace(',', '.');
  const unitText = match[2];
  const unit = unitText ? matchWeightUnit(unitText) : defaultUnit;

  // A number with a trailing word that isn't a weight unit is not a weight —
  // `62 head` should be reported, not imported as 62 kg.
  if (!unit) {
    return null;
  }

  return { value: amount, unit };
}

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase();
}

function equalsIgnoreCase(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
