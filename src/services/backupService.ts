import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { isStoredAnimal, normalizeStoredAnimal } from '../context/AnimalsContext';
import { ensureUniqueRecordIds, isStoredRecord } from '../context/RecordsContext';
import {
  isStoredSetup,
  normalizeStoredSetup,
  type FarmEntity,
  type GroupEntity,
  type MedicineEntity,
  type PaddockEntity,
} from '../context/SetupContext';
import { DEFAULT_ACCOUNT_PROFILE, type AccountProfile } from '../entities/account';
import type { Animal } from '../entities/animal';
import type { RecordEntry } from '../entities/record';
import { resolveRecordAnimalUids } from '../utils/recordAnimals';

// Single source of truth for what a LivestockBook backup file contains and
// how it's built/read/validated/applied. Every collection type here is
// imported straight from the app's real persisted models (Animal,
// RecordEntry, FarmEntity, ...) rather than a hand-rolled second shape, so a
// backup always carries every field those models carry — add a field to
// Animal and it's automatically included in the next backup, no changes
// needed here.

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_APP_NAME = 'LivestockBook';

// Only the subset of AccountProfile that is genuinely portable "my
// LivestockBook configuration" — deliberately excludes:
//  - plan: subscription entitlement always comes from RevenueCat/App Store
//    (see SubscriptionContext), never from a backup file. The account
//    storage layer already normalizes any stored 'Pro' back to 'Basic' on
//    load for the same reason (see accountStorage.loadAccountProfile).
//  - lastExportedAt / backupNudgeSnoozedUntil: device-local reminder
//    bookkeeping, not configuration — meaningless (or actively misleading)
//    to carry onto a different device.
export type BackupProfileData = Pick<
  AccountProfile,
  | 'name'
  | 'email'
  | 'country'
  | 'currency'
  | 'industry'
  | 'measurementUnits'
  | 'dateFormat'
  | 'businessName'
  | 'businessAddress'
  | 'businessLogoUri'
>;

export type LivestockBookBackup = {
  backupFormatVersion: number;
  app: string;
  createdAt: string;
  data: {
    animals: Animal[];
    records: RecordEntry[];
    farms: FarmEntity[];
    paddocks: PaddockEntity[];
    groups: GroupEntity[];
    medicines: MedicineEntity[];
    profile: Partial<BackupProfileData>;
  };
};

export type BuildBackupInput = {
  animals: Animal[];
  records: RecordEntry[];
  farmEntities: FarmEntity[];
  paddockEntities: PaddockEntity[];
  groupEntities: GroupEntity[];
  medicineEntities: MedicineEntity[];
  profile: AccountProfile;
};

export function buildBackup(input: BuildBackupInput): LivestockBookBackup {
  return {
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    app: BACKUP_APP_NAME,
    createdAt: new Date().toISOString(),
    data: {
      animals: input.animals,
      records: input.records,
      farms: input.farmEntities,
      paddocks: input.paddockEntities,
      groups: input.groupEntities,
      medicines: input.medicineEntities,
      profile: pickBackupProfileFields(input.profile),
    },
  };
}

function pickBackupProfileFields(profile: AccountProfile): BackupProfileData {
  return {
    name: profile.name,
    email: profile.email,
    country: profile.country,
    currency: profile.currency,
    industry: profile.industry,
    measurementUnits: profile.measurementUnits,
    dateFormat: profile.dateFormat,
    businessName: profile.businessName,
    businessAddress: profile.businessAddress,
    businessLogoUri: profile.businessLogoUri,
  };
}

export function buildBackupFilename(date: Date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `LivestockBook-Backup-${year}-${month}-${day}.json`;
}

// ---------------------------------------------------------------------------
// File I/O — writing a backup out, and reading a candidate backup back in.
// Mirrors the existing PDF/CSV export pattern (see utils/pdfExport.ts and
// (tabs)/export.tsx's writeAndShareCsv): write to cache, then hand off to the
// native share sheet.
// ---------------------------------------------------------------------------

export async function createBackupFile(backup: LivestockBookBackup): Promise<string> {
  const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

  if (!directory) {
    throw new Error('No writable location is available on this device.');
  }

  const uri = `${directory}${buildBackupFilename()}`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(backup, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return uri;
}

export async function shareBackupFile(uri: string) {
  const sharingAvailable = await Sharing.isAvailableAsync();

  if (!sharingAvailable) {
    throw new Error('This device cannot open the share sheet right now.');
  }

  await Sharing.shareAsync(uri, { UTI: 'public.json', mimeType: 'application/json' });
}

export type PickedBackupFile = { canceled: true } | { canceled: false; uri: string };

// Deliberately unfiltered (rather than type: 'application/json') — a custom
// JSON file's MIME/UTI can be reported inconsistently across iOS share
// sources (Files, iCloud Drive, AirDrop), and a filter that's too strict
// risks hiding a perfectly valid backup from the picker. The real
// validation happens after reading the file's contents, in validateBackupText.
export async function pickBackupFile(): Promise<PickedBackupFile> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    multiple: false,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) {
    return { canceled: true };
  }

  return { canceled: false, uri: result.assets[0].uri };
}

export async function readBackupFileText(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}

// ---------------------------------------------------------------------------
// Validation — must fully succeed before a single byte of existing data is
// touched. Reuses the same structural guards (isStoredAnimal, isStoredRecord,
// isStoredSetup) the app already applies when loading its own storage on
// launch, so "valid enough to restore" means exactly the same thing here as
// it does everywhere else in the app.
// ---------------------------------------------------------------------------

export type BackupValidationFailureReason =
  | 'invalid-json'
  | 'invalid-format'
  | 'newer-version'
  | 'missing-collections'
  | 'invalid-entities';

export type BackupValidationResult =
  | { ok: true; backup: LivestockBookBackup }
  | { ok: false; reason: BackupValidationFailureReason };

export function validateBackupText(text: string): BackupValidationResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }

  return validateBackupValue(parsed);
}

function validateBackupValue(value: unknown): BackupValidationResult {
  if (!value || typeof value !== 'object') {
    return { ok: false, reason: 'invalid-format' };
  }

  const candidate = value as Partial<LivestockBookBackup>;

  if (
    typeof candidate.backupFormatVersion !== 'number' ||
    !Number.isInteger(candidate.backupFormatVersion) ||
    candidate.backupFormatVersion < 1 ||
    candidate.app !== BACKUP_APP_NAME ||
    typeof candidate.createdAt !== 'string' ||
    !candidate.data ||
    typeof candidate.data !== 'object'
  ) {
    return { ok: false, reason: 'invalid-format' };
  }

  // Support today is version 1 only, but the check is already
  // forward-looking: an older/lower version number is treated as a format
  // problem (there is nothing to migrate from yet), while a *higher* one
  // gets its own explicit "update the app" message below, rather than being
  // silently misread as version 1.
  if (candidate.backupFormatVersion > BACKUP_FORMAT_VERSION) {
    return { ok: false, reason: 'newer-version' };
  }

  const data = candidate.data as Record<string, unknown>;

  // isStoredSetup only checks farms/paddocks/groups/medicines — checked via a
  // narrower view so its `typeof EMPTY_SETUP` guard doesn't erase `data`'s
  // other keys (animals/records/profile) from the type below.
  if (!isStoredSetup({ farms: data.farms, paddocks: data.paddocks, groups: data.groups, medicines: data.medicines })) {
    return { ok: false, reason: 'missing-collections' };
  }

  if (!Array.isArray(data.animals) || !Array.isArray(data.records)) {
    return { ok: false, reason: 'missing-collections' };
  }

  const farms = data.farms as unknown[];
  const paddocks = data.paddocks as unknown[];
  const groups = data.groups as unknown[];
  const medicines = data.medicines as unknown[];

  if (
    !data.animals.every(isStoredAnimal) ||
    !data.records.every(isStoredRecord) ||
    !farms.every(isNamedEntity) ||
    !paddocks.every(isNamedEntity) ||
    !groups.every(isNamedEntity) ||
    !medicines.every(isNamedEntity)
  ) {
    return { ok: false, reason: 'invalid-entities' };
  }

  const profile = data.profile && typeof data.profile === 'object' ? (data.profile as Partial<BackupProfileData>) : {};

  return {
    ok: true,
    backup: {
      backupFormatVersion: candidate.backupFormatVersion,
      app: candidate.app,
      createdAt: candidate.createdAt,
      data: {
        animals: data.animals as Animal[],
        records: data.records as RecordEntry[],
        farms: farms as FarmEntity[],
        paddocks: paddocks as PaddockEntity[],
        groups: groups as GroupEntity[],
        medicines: medicines as MedicineEntity[],
        profile,
      },
    },
  };
}

function isNamedEntity(value: unknown): value is { name: string } {
  return Boolean(value) && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string';
}

export function describeBackupValidationFailure(reason: BackupValidationFailureReason): {
  title: string;
  message: string;
} {
  if (reason === 'newer-version') {
    return {
      title: 'Update required',
      message: 'This backup was created by a newer version of LivestockBook. Update the app before restoring it.',
    };
  }

  return {
    title: 'Invalid backup file',
    message: 'This file could not be read as a LivestockBook backup. Choose a different file and try again.',
  };
}

// ---------------------------------------------------------------------------
// Restore preparation — turns a validated backup into the exact next state
// for every store, reusing the same normalization the app already runs when
// loading its own storage (normalizeStoredAnimal, normalizeStoredSetup,
// ensureUniqueRecordIds) so IDs are preserved wherever possible and
// relationships resolve the same way they would on a fresh app launch.
//
// Deliberately NOT reusing rebuildAnimalsState/addRecord's business logic
// (status/location/weight recomputed from record history) — a restore must
// write back the exact final state the backup captured, not re-derive it,
// or a historical Death record would end up "processed" twice.
// ---------------------------------------------------------------------------

export type PreparedRestoreData = {
  animals: Animal[];
  records: RecordEntry[];
  farms: FarmEntity[];
  paddocks: PaddockEntity[];
  groups: GroupEntity[];
  medicines: MedicineEntity[];
  profile: AccountProfile;
  expectedCounts: {
    animals: number;
    records: number;
    farms: number;
    paddocks: number;
    groups: number;
    medicines: number;
  };
};

export function prepareRestoreData(backup: LivestockBookBackup, currentProfile: AccountProfile): PreparedRestoreData {
  const { data } = backup;

  const setup = normalizeStoredSetup({
    farms: data.farms,
    paddocks: data.paddocks,
    groups: data.groups,
    medicines: data.medicines,
  });

  const usedAnimalUids = new Set<string>();
  const animals = data.animals.map((animal, index) =>
    normalizeStoredAnimal(animal, usedAnimalUids, setup.farms, setup.paddocks, setup.groups, index, data.animals.length),
  );

  const animalUidSet = new Set(animals.map((animal) => animal.uid));
  const records = ensureUniqueRecordIds(data.records).map((record) => {
    if (record.animalUids && record.animalUids.length > 0 && record.animalUids.some((uid) => animalUidSet.has(uid))) {
      return record;
    }

    // Same legacy backfill the app already applies when loading records from
    // storage (see RecordsContext's restore effect) — resolves animalUids
    // from the tag/name text fields for records that arrived without them.
    const resolvedUids = resolveRecordAnimalUids(record, animals);
    return resolvedUids.length > 0 ? { ...record, animalUids: resolvedUids } : record;
  });

  return {
    animals,
    records,
    farms: setup.farms,
    paddocks: setup.paddocks,
    groups: setup.groups,
    medicines: setup.medicines,
    profile: {
      ...DEFAULT_ACCOUNT_PROFILE,
      ...currentProfile,
      ...normalizeBackupProfileFields(data.profile),
    },
    expectedCounts: {
      animals: data.animals.length,
      records: data.records.length,
      farms: data.farms.length,
      paddocks: data.paddocks.length,
      groups: data.groups.length,
      medicines: data.medicines.length,
    },
  };
}

function normalizeBackupProfileFields(profile: Partial<BackupProfileData>): Partial<AccountProfile> {
  const next: Partial<AccountProfile> = {};

  if (typeof profile.name === 'string') next.name = profile.name;
  if (typeof profile.email === 'string') next.email = profile.email;
  if (typeof profile.country === 'string') next.country = profile.country;
  if (typeof profile.currency === 'string') next.currency = profile.currency;
  if (typeof profile.industry === 'string') next.industry = profile.industry as AccountProfile['industry'];
  if (typeof profile.measurementUnits === 'string') {
    next.measurementUnits = profile.measurementUnits as AccountProfile['measurementUnits'];
  }
  if (typeof profile.dateFormat === 'string') next.dateFormat = profile.dateFormat as AccountProfile['dateFormat'];
  if (typeof profile.businessName === 'string') next.businessName = profile.businessName;
  if (typeof profile.businessAddress === 'string') next.businessAddress = profile.businessAddress;
  if (typeof profile.businessLogoUri === 'string') next.businessLogoUri = profile.businessLogoUri;

  return next;
}

// Final safety check, run immediately before the transactional write —
// confirms nothing was silently dropped while building the prepared state
// above. Normalization only ever re-keys/backfills entries, never removes
// them, so a mismatch here means a bug rather than a real-world data
// scenario — treated as a hard failure either way (see AccountContext.
// restoreFromBackup) rather than persisting something that doesn't match
// what the backup said it contained.
export function verifyRestoreCounts(prepared: PreparedRestoreData): boolean {
  return (
    prepared.animals.length === prepared.expectedCounts.animals &&
    prepared.records.length === prepared.expectedCounts.records &&
    prepared.farms.length === prepared.expectedCounts.farms &&
    prepared.paddocks.length === prepared.expectedCounts.paddocks &&
    prepared.groups.length === prepared.expectedCounts.groups &&
    prepared.medicines.length === prepared.expectedCounts.medicines
  );
}
