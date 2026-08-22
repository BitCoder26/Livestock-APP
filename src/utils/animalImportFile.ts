import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { toCsv } from './csv';
import { ANIMAL_IMPORT_FIELDS, type AnimalImportField } from './importAliases';

/**
 * Getting a CSV in and a template out. Both use the same pieces the backup
 * feature already relies on (`expo-document-picker` for the picker,
 * `expo-file-system` for the read), so importing needs no new native module.
 */

export type PickedCsvFile = { canceled: true } | { canceled: false; uri: string; name: string };

export async function pickCsvFile(): Promise<PickedCsvFile> {
  // `*/*` rather than a CSV MIME type on purpose: iOS reports CSVs coming out
  // of Mail, WhatsApp and third-party cloud drives under a range of types (and
  // sometimes as plain text), so a narrow filter greys out the very file the
  // user is trying to pick. The content is validated after reading instead,
  // which catches a wrong file properly rather than hiding the right one.
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    multiple: false,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) {
    return { canceled: true };
  }

  const asset = result.assets[0];

  return { canceled: false, uri: asset.uri, name: asset.name ?? 'file.csv' };
}

export async function readCsvFileText(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}

/**
 * The blank file to fill in. Its headers are the import field labels, so a
 * template that comes back is recognised column-for-column with nothing for
 * the user to map — the zero-effort path that most people will take.
 */
export function buildTemplateCsv() {
  const headers = ANIMAL_IMPORT_FIELDS.map((field) => field.label);

  // Keyed by field id rather than written as positional rows: the header list
  // comes from ANIMAL_IMPORT_FIELDS, so a row of bare strings has to be kept
  // in step with it by hand, and adding a field silently shifts every example
  // value one column left of the heading it belongs under. That is exactly
  // what happened when `eid` was added, and it is invisible until someone
  // reads the file — a template whose own example is misfiled teaches the
  // wrong shape to the person least able to spot it.
  const examples: Partial<Record<AnimalImportField, string>>[] = [
    {
      tag: 'UK123456700001',
      eid: '982000123456789',
      name: 'Bess',
      species: 'Cattle',
      sex: 'Female',
      breed: 'Aberdeen Angus',
      dateOfBirth: '2021-03-14',
      status: 'Active',
      farm: 'Home Farm',
      location: 'North Field',
      label: 'Breeding',
      weight: '540',
      source: 'Born on farm',
      farmEntryDate: '2021-03-14',
      notes: 'Twin',
    },
    // Deliberately sparse: every column except the tag may be left empty, and
    // the second row is where that is shown rather than described.
    {
      tag: 'UK123456700002',
      species: 'Cattle',
      sex: 'Male',
      dateOfBirth: '2022-05-02',
      status: 'Active',
      farm: 'Home Farm',
      location: 'North Field',
      weight: '480',
      source: 'Purchased',
      farmEntryDate: '2022-09-10',
    },
  ];

  const rows = examples.map((example) =>
    ANIMAL_IMPORT_FIELDS.map((field) => example[field.id] ?? ''),
  );

  return toCsv([headers, ...rows]);
}

export async function shareTemplateCsv() {
  const directory = FileSystem.cacheDirectory;

  if (!directory) {
    return false;
  }

  const uri = `${directory}livestockbook-import-template.csv`;
  await FileSystem.writeAsStringAsync(uri, buildTemplateCsv(), { encoding: FileSystem.EncodingType.UTF8 });

  if (!(await Sharing.isAvailableAsync())) {
    return false;
  }

  await Sharing.shareAsync(uri, {
    UTI: 'public.comma-separated-values-text',
    mimeType: 'text/csv',
    dialogTitle: 'LivestockBook import template',
  });

  return true;
}
