import * as SQLite from 'expo-sqlite';

import { DEFAULT_ACCOUNT_PROFILE, type AccountProfile } from '../entities/account';

const DATABASE_NAME = 'livestock-tracker.db';
const PROFILE_KEY = 'account_profile';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }

  const database = await databasePromise;

  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  return database;
}

export async function loadAccountProfile() {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    PROFILE_KEY,
  );

  if (!row?.value) {
    return DEFAULT_ACCOUNT_PROFILE;
  }

  try {
    const parsed = JSON.parse(row.value) as Partial<AccountProfile>;

    return {
      ...DEFAULT_ACCOUNT_PROFILE,
      ...parsed,
    };
  } catch {
    return DEFAULT_ACCOUNT_PROFILE;
  }
}

export async function saveAccountProfile(profile: AccountProfile) {
  const database = await getDatabase();

  await database.runAsync(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
    PROFILE_KEY,
    JSON.stringify(profile),
  );
}

export async function clearAccountProfile() {
  const database = await getDatabase();

  await database.runAsync('DELETE FROM app_settings WHERE key = ?', PROFILE_KEY);
}
