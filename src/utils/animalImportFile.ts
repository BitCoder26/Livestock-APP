import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { toCsv } from './csv';
import { ANIMAL_IMPORT_FIELDS } from './importAliases';

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
  const example = [
    ['UK123456700001', 'Bess', 'Cattle', 'Female', 'Aberdeen Angus', '2021-03-14', 'Active',
      'Home Farm', 'North Field', 'Breeding', '540', 'Born on farm', '2021-03-14', 'Twin'],
    ['UK123456700002', '', 'Cattle', 'Male', '', '2022-05-02', 'Active',
      'Home Farm', 'North Field', '', '480', 'Purchased', '2022-09-10', ''],
  ];

  return toCsv([headers, ...example]);
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
