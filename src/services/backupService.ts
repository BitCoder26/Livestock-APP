import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { isStoredAnimal, normalizeStoredAnimal } from '../context/AnimalsContext';
import { isStoredCollective, normalizeStoredCollective } from '../context/CollectivesContext';
import { backfillRecordCreatedAt, ensureUniqueRecordIds, isStoredRecord } from '../context/RecordsContext';
import {
  isStoredSetup,
  normalizeStoredSetup,
  type FarmEntity,
  type LabelEntity,
  type MedicineEntity,
  type LocationEntity,
} from '../context/SetupContext';
import { DEFAULT_ACCOUNT_PROFILE, type AccountProfile } from '../entities/account';
import type { Animal } from '../entities/animal';
import type { Collective } from '../entities/collective';
import type { RecordEntry } from '../entities/record';
import {
  describeStoredImage,
  imageFileFor,
  resolveStoredImageUri,
  storedImageSize,
} from '../utils/imageStorage';
import { resolveRecordAnimalUids } from '../utils/recordAnimals';
import {
  extractZipEntry,
  isZipFile,
  readZipEntries,
  writeZipArchive,
  type ZipEntry,
} from '../utils/zipArchive';

// Single source of truth for what a LivestockBook backup file contains and
// how it's built/read/validated/applied. Every collection type here is
// imported straight from the app's real persisted models (Animal,
// RecordEntry, FarmEntity, ...) rather than a hand-rolled second shape, so a
// backup always carries every field those models carry — add a field to
// Animal and it's automatically included in the next backup, no changes
// needed here.

// 2 adds herds and flocks (`data.collectives`). Version 1 files still
// restore — they simply carry no collectives — but a version 2 file opened by
// an older build is refused outright rather than silently restoring without
// them, which is what the `newer-version` check below is for.
export const BACKUP_FORMAT_VERSION = 2;
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
    collectives: Collective[];
    records: RecordEntry[];
    farms: FarmEntity[];
    locations: LocationEntity[];
    labels: LabelEntity[];
    medicines: MedicineEntity[];
    profile: Partial<BackupProfileData>;
  };
};

export type BuildBackupInput = {
  animals: Animal[];
  collectives: Collective[];
  records: RecordEntry[];
  farmEntities: FarmEntity[];
  locationEntities: LocationEntity[];
  labelEntities: LabelEntity[];
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
      collectives: input.collectives,
      records: input.records,
      farms: input.farmEntities,
      locations: input.locationEntities,
      labels: input.labelEntities,
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
// Photo archive
//
// A plain backup carries the data and the *paths* of the photos, but not the
// photos themselves. Including them turns the backup into a zip holding
// `backup.json` plus a `photos/` tree, written straight to disk so a farm with
// a thousand photos never has to fit in memory (see utils/zipArchive.ts).
//
// Opt-in rather than always-on, because the two files are wildly different
// objects: the JSON is tens of kilobytes and goes anywhere — email, a
// messaging app, a cheap cloud drive — while the archive is as big as the
// photo library behind it and often too large to send that way.
// ---------------------------------------------------------------------------

/** Where photos live inside the archive. */
const ARCHIVE_PHOTO_PREFIX = 'photos';
/** The data file inside the archive. */
const ARCHIVE_DATA_ENTRY = 'backup.json';

export type BackupPhoto = {
  /** Path inside the archive. */
  name: string;
  file: File;
  bytes: number;
};

/**
 * Every photo referenced by the data being backed up, de-duplicated. Files in
 * the image directories that nothing points at are deliberately left out — an
 * orphan is not part of the farm's records, and including it would grow the
 * archive for nothing.
 */
export function collectBackupPhotos(input: BuildBackupInput): BackupPhoto[] {
  const seen = new Map<string, BackupPhoto>();

  const add = (value: unknown) => {
    const resolved = resolveStoredImageUri(value);

    if (!resolved) {
      return;
    }

    const described = describeStoredImage(resolved);

    if (!described || seen.has(resolved)) {
      return;
    }

    const bytes = storedImageSize(resolved);

    if (bytes <= 0) {
      return;
    }

    seen.set(resolved, {
      name: `${ARCHIVE_PHOTO_PREFIX}/${described.directoryName}/${described.fileName}`,
      file: new File(resolved),
      bytes,
    });
  };

  input.animals.forEach((animal) => animal.imageUris?.forEach(add));
  input.collectives.forEach((collective) => collective.imageUris?.forEach(add));
  input.records.forEach((record) => record.imageUris?.forEach(add));
  add(input.profile.businessLogoUri);

  return [...seen.values()];
}

export function totalPhotoBytes(photos: BackupPhoto[]) {
  return photos.reduce((total, photo) => total + photo.bytes, 0);
}

export function buildArchiveFilename(date: Date = new Date()) {
  return buildBackupFilename(date).replace(/\.json$/, '.zip');
}

/**
 * Writes the backup as a zip of `backup.json` plus every photo, and returns
 * its uri. The JSON is written to a temporary file first because the archive
 * takes files, not strings — it is removed once the archive is built.
 */
export async function createBackupArchive(
  backup: LivestockBookBackup,
  photos: BackupPhoto[],
  onProgress?: (completed: number, total: number) => void,
): Promise<string> {
  const staging = new Directory(Paths.cache, 'backup-staging');
  staging.create({ idempotent: true, intermediates: true });

  const dataFile = new File(staging, ARCHIVE_DATA_ENTRY);

  if (dataFile.exists) {
    dataFile.delete();
  }

  dataFile.create({ overwrite: true });
  dataFile.write(JSON.stringify(backup, null, 2));

  const archive = new File(Paths.cache, buildArchiveFilename());

  try {
    await writeZipArchive(
      archive,
      [{ name: ARCHIVE_DATA_ENTRY, file: dataFile }, ...photos.map(({ name, file }) => ({ name, file }))],
      onProgress,
    );
  } finally {
    if (dataFile.exists) {
      dataFile.delete();
    }
  }

  return archive.uri;
}

export async function shareBackupArchive(uri: string) {
  const sharingAvailable = await Sharing.isAvailableAsync();

  if (!sharingAvailable) {
    throw new Error('This device cannot open the share sheet right now.');
  }

  await Sharing.shareAsync(uri, { UTI: 'public.zip-archive', mimeType: 'application/zip' });
}

// --- reading a picked file, which may be either shape ----------------------

export type BackupSource = {
  text: string;
  /** Present only when the picked file was an archive with photos in it. */
  archive?: { uri: string; photoEntries: ZipEntry[] };
};

/**
 * Reads a picked backup, accepting both shapes: the plain JSON file and the
 * zip archive. Detection is by content rather than by file extension, since a
 * file that has been renamed or handed over by a messaging app often arrives
 * with the wrong one.
 */
export async function readBackupSource(uri: string): Promise<BackupSource> {
  const picked = new File(uri);

  if (!isZipFile(picked)) {
    return { text: await readBackupFileText(uri) };
  }

  const entries = readZipEntries(picked);
  const dataEntry = entries.find((entry) => entry.name === ARCHIVE_DATA_ENTRY);

  if (!dataEntry) {
    throw new Error('This archive does not contain a LivestockBook backup.');
  }

  const staging = new Directory(Paths.cache, 'restore-staging');
  staging.create({ idempotent: true, intermediates: true });
  const dataFile = new File(staging, ARCHIVE_DATA_ENTRY);
  extractZipEntry(picked, dataEntry, dataFile);

  try {
    return {
      text: await dataFile.text(),
      archive: {
        uri,
        photoEntries: entries.filter((entry) => entry.name.startsWith(`${ARCHIVE_PHOTO_PREFIX}/`)),
      },
    };
  } finally {
    if (dataFile.exists) {
      dataFile.delete();
    }
  }
}

export type PhotoRestoreResult = { restored: number; skipped: number };

/**
 * Writes the archive's photos back into the app's image directories.
 *
 * Runs *after* the data has been restored, and its failures are reported
 * rather than thrown: by that point the records — the part that cannot be
 * recovered from anywhere else — are already safely in place, and losing a
 * photo should not present itself as a failed restore.
 *
 * An entry whose path is not one of the four known image directories is
 * skipped rather than written, so a hand-edited archive cannot drop files
 * anywhere it likes.
 */
export function restoreArchivePhotos(archiveUri: string, entries: ZipEntry[]): PhotoRestoreResult {
  const archive = new File(archiveUri);
  let restored = 0;
  let skipped = 0;

  for (const entry of entries) {
    const parts = entry.name.split('/');

    if (parts.length !== 3 || parts[0] !== ARCHIVE_PHOTO_PREFIX) {
      skipped += 1;
      continue;
    }

    const destination = imageFileFor(parts[1], parts[2]);

    if (!destination) {
      skipped += 1;
      continue;
    }

    try {
      new Directory(Paths.document, parts[1]).create({ idempotent: true, intermediates: true });
      extractZipEntry(archive, entry, destination);
      restored += 1;
    } catch {
      skipped += 1;
    }
  }

  return { restored, skipped };
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

  // Backups written before the Labels rename carry `groups`. Read whichever
  // key this file holds so an older backup still restores — isStoredSetup
  // accepts either, and everything downstream works in `labels`.
  const storedLabels = Array.isArray(data.labels) ? data.labels : data.groups;
  // Backups written before the Locations rename carry `paddocks`.
  const storedLocations = Array.isArray(data.locations) ? data.locations : data.paddocks;

  // isStoredSetup only checks farms/locations/labels/medicines — checked via a
  // narrower view so its `typeof EMPTY_SETUP` guard doesn't erase `data`'s
  // other keys (animals/records/profile) from the type below.
  if (!isStoredSetup({ farms: data.farms, locations: storedLocations, labels: storedLabels, medicines: data.medicines })) {
    return { ok: false, reason: 'missing-collections' };
  }

  if (!Array.isArray(data.animals) || !Array.isArray(data.records)) {
    return { ok: false, reason: 'missing-collections' };
  }

  // Version 1 files predate herds and flocks, so an absent `collectives` key
  // is a valid older backup rather than a malformed one. A present-but-wrong
  // value is still rejected.
  const storedCollectives = data.collectives === undefined ? [] : data.collectives;

  if (!Array.isArray(storedCollectives)) {
    return { ok: false, reason: 'missing-collections' };
  }

  const farms = data.farms as unknown[];
  const locations = storedLocations as unknown[];
  const labels = storedLabels as unknown[];
  const medicines = data.medicines as unknown[];

  if (
    !data.animals.every(isStoredAnimal) ||
    !storedCollectives.every(isStoredCollective) ||
    !data.records.every(isStoredRecord) ||
    !farms.every(isNamedEntity) ||
    !locations.every(isNamedEntity) ||
    !labels.every(isNamedEntity) ||
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
        collectives: storedCollectives as Collective[],
        records: data.records as RecordEntry[],
        farms: farms as FarmEntity[],
        locations: locations as LocationEntity[],
        labels: labels as LabelEntity[],
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
  collectives: Collective[];
  records: RecordEntry[];
  farms: FarmEntity[];
  locations: LocationEntity[];
  labels: LabelEntity[];
  medicines: MedicineEntity[];
  profile: AccountProfile;
  expectedCounts: {
    animals: number;
    collectives: number;
    records: number;
    farms: number;
    locations: number;
    labels: number;
    medicines: number;
  };
};

export function prepareRestoreData(backup: LivestockBookBackup, currentProfile: AccountProfile): PreparedRestoreData {
  const { data } = backup;

  const setup = normalizeStoredSetup({
    farms: data.farms,
    locations: data.locations,
    labels: data.labels,
    medicines: data.medicines,
  });

  const usedAnimalUids = new Set<string>();
  const animals = data.animals.map((animal, index) =>
    normalizeStoredAnimal(animal, usedAnimalUids, setup.farms, setup.locations, setup.labels, index, data.animals.length),
  );

  // Collective uids are preserved as stored. They have to be: a collective
  // record points at one by `collectiveUid`, and each dated count event can
  // carry the `recordId` that caused it, so regenerating uids here would cut
  // every herd and flock loose from its own records.
  const usedCollectiveUids = new Set<string>();
  const collectives = data.collectives.map((collective) =>
    normalizeStoredCollective(collective, usedCollectiveUids),
  );

  const animalUidSet = new Set(animals.map((animal) => animal.uid));
  // Same createdAt backfill the app applies to its own storage on load, so a
  // restored backup written before createdAt existed still sorts by entry time.
  const records = backfillRecordCreatedAt(ensureUniqueRecordIds(data.records)).map((record) => {
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
    collectives,
    records,
    farms: setup.farms,
    locations: setup.locations,
    labels: setup.labels,
    medicines: setup.medicines,
    profile: {
      ...DEFAULT_ACCOUNT_PROFILE,
      ...currentProfile,
      ...normalizeBackupProfileFields(data.profile),
    },
    expectedCounts: {
      animals: data.animals.length,
      collectives: data.collectives.length,
      records: data.records.length,
      farms: data.farms.length,
      locations: data.locations.length,
      labels: data.labels.length,
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
    prepared.collectives.length === prepared.expectedCounts.collectives &&
    prepared.records.length === prepared.expectedCounts.records &&
    prepared.farms.length === prepared.expectedCounts.farms &&
    prepared.locations.length === prepared.expectedCounts.locations &&
    prepared.labels.length === prepared.expectedCounts.labels &&
    prepared.medicines.length === prepared.expectedCounts.medicines
  );
}
