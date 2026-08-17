import AsyncStorage from 'expo-sqlite/kv-store';
import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePostHog } from 'posthog-react-native';

import type { AccountProfile } from '../entities/account';
import { DEFAULT_ACCOUNT_PROFILE } from '../entities/account';
import { requestDeleteAccount, requestPasswordChange, requestSignOutAllDevices, type BackendActionResult } from '../services/accountBackend';
import { clearAccountProfile, loadAccountProfile, saveAccountProfile } from '../services/accountStorage';
import {
  prepareRestoreData,
  verifyRestoreCounts,
  type LivestockBookBackup,
} from '../services/backupService';
import { ANIMALS_STORAGE_KEY, useAnimals } from './AnimalsContext';
import { RECORDS_STORAGE_KEY, useRecords } from './RecordsContext';
import { SETUP_STORAGE_KEY, useSetup } from './SetupContext';

export type RestoreBackupResult =
  | { ok: true }
  | { ok: false; reason: 'integrity-error' | 'storage-error' };

type AccountContextValue = {
  profile: AccountProfile;
  isLoaded: boolean;
  updateField: <Key extends keyof AccountProfile>(key: Key, value: AccountProfile[Key]) => void;
  resetAppData: () => Promise<void>;
  restoreFromBackup: (backup: LivestockBookBackup) => Promise<RestoreBackupResult>;
  changePassword: (currentPassword: string, nextPassword: string) => Promise<BackendActionResult>;
  signOutAllDevices: () => Promise<BackendActionResult>;
  deleteAccount: () => Promise<BackendActionResult>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

// Profile fields mirrored to PostHog as person properties, for aggregate
// product analytics (e.g. "what industries are our users in"). Deliberately
// excludes anything personally identifying — name, business name/address,
// logo — which stay local-only.
const ANALYTICS_PROFILE_FIELDS = ['industry', 'country'] as const satisfies readonly (keyof AccountProfile)[];

export function AccountProvider({ children }: PropsWithChildren) {
  const { resetAnimals, getAnimalsSnapshot, replaceAnimalsFromTransaction } = useAnimals();
  const { resetRecords, getRecordsSnapshot, replaceRecordsFromTransaction, clearFilters } = useRecords();
  const {
    resetSetup,
    farmEntities,
    paddockEntities,
    groupEntities,
    medicineEntities,
    replaceSetupFromTransaction,
  } = useSetup();
  const posthog = usePostHog();
  const [profile, setProfile] = useState<AccountProfile>(DEFAULT_ACCOUNT_PROFILE);
  const [isLoaded, setIsLoaded] = useState(false);
  const profileWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const hasSyncedAnalyticsProfile = useRef(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const storedProfile = await loadAccountProfile();

        if (active) {
          setProfile(storedProfile);
        }
      } catch {
        // Continue with defaults if the profile database cannot be read.
      } finally {
        if (active) {
          setIsLoaded(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    profileWriteQueue.current = profileWriteQueue.current
      .catch(() => undefined)
      .then(() => saveAccountProfile(profile))
      .catch(() => undefined);
  }, [isLoaded, profile]);

  // Backfills analytics properties for profiles that set these fields before
  // this tracking existed. Runs once per app session, after the stored
  // profile has loaded; ongoing edits are covered by updateField below.
  useEffect(() => {
    if (!isLoaded || hasSyncedAnalyticsProfile.current) {
      return;
    }

    hasSyncedAnalyticsProfile.current = true;

    const knownProperties = ANALYTICS_PROFILE_FIELDS.reduce<Record<string, string>>((acc, field) => {
      const value = profile[field];
      if (typeof value === 'string' && value.trim().length > 0) {
        acc[field] = value;
      }
      return acc;
    }, {});

    if (Object.keys(knownProperties).length > 0) {
      posthog?.setPersonProperties(knownProperties);
    }
  }, [isLoaded, posthog, profile]);

  const value = useMemo<AccountContextValue>(
    () => ({
      profile,
      isLoaded,
      updateField: (key, value) => {
        setProfile((current) => ({
          ...current,
          [key]: value,
        }));

        if (
          (ANALYTICS_PROFILE_FIELDS as readonly string[]).includes(key) &&
          typeof value === 'string' &&
          value.trim().length > 0
        ) {
          posthog?.setPersonProperties({ [key]: value });
        }
      },
      resetAppData: async () => {
        const results = await Promise.all([resetAnimals(), resetRecords(), resetSetup()]);
        if (results.some((result) => !result.ok)) {
          throw new Error('Local data could not be reset completely.');
        }
      },
      restoreFromBackup: async (backup) => {
        const prepared = prepareRestoreData(backup, profile);

        if (!verifyRestoreCounts(prepared)) {
          return { ok: false, reason: 'integrity-error' };
        }

        // Snapshot everything currently on disk so a failure partway through
        // the writes below can be rolled back, rather than leaving the app
        // with some stores restored and others not (see the module-level
        // walkthrough in backupService.ts for the overall restore design).
        const previousAnimals = getAnimalsSnapshot();
        const previousRecords = getRecordsSnapshot();
        const previousSetup = { farms: farmEntities, paddocks: paddockEntities, groups: groupEntities, medicines: medicineEntities };
        const previousProfile = profile;

        const nextSetup = {
          farms: prepared.farms,
          paddocks: prepared.paddocks,
          groups: prepared.groups,
          medicines: prepared.medicines,
        };

        try {
          await AsyncStorage.multiSet([
            [ANIMALS_STORAGE_KEY, JSON.stringify(prepared.animals)],
            [RECORDS_STORAGE_KEY, JSON.stringify(prepared.records)],
            [SETUP_STORAGE_KEY, JSON.stringify(nextSetup)],
          ]);
          await saveAccountProfile(prepared.profile);
        } catch {
          try {
            await AsyncStorage.multiSet([
              [ANIMALS_STORAGE_KEY, JSON.stringify(previousAnimals)],
              [RECORDS_STORAGE_KEY, JSON.stringify(previousRecords)],
              [SETUP_STORAGE_KEY, JSON.stringify(previousSetup)],
            ]);
            await saveAccountProfile(previousProfile);
          } catch {
            // Best-effort rollback — if this also fails there's nothing more
            // to do locally; the original storage-error is still reported.
          }

          return { ok: false, reason: 'storage-error' };
        }

        replaceAnimalsFromTransaction(prepared.animals);
        replaceRecordsFromTransaction(prepared.records);
        replaceSetupFromTransaction(nextSetup);
        clearFilters();
        setProfile(prepared.profile);

        return { ok: true };
      },
      changePassword: async (currentPassword, nextPassword) => {
        void currentPassword;
        void nextPassword;
        return requestPasswordChange();
      },
      signOutAllDevices: async () => requestSignOutAllDevices(),
      deleteAccount: async () => {
        const results = await Promise.all([resetAnimals(), resetRecords(), resetSetup()]);
        if (results.some((result) => !result.ok)) {
          return {
            requiresBackend: false,
            message: 'Local account data could not be cleared completely. Please try again.',
          };
        }
        setProfile(DEFAULT_ACCOUNT_PROFILE);
        await clearAccountProfile();
        return requestDeleteAccount();
      },
    }),
    [
      isLoaded,
      posthog,
      profile,
      resetAnimals,
      resetRecords,
      resetSetup,
      getAnimalsSnapshot,
      getRecordsSnapshot,
      replaceAnimalsFromTransaction,
      replaceRecordsFromTransaction,
      replaceSetupFromTransaction,
      clearFilters,
      farmEntities,
      paddockEntities,
      groupEntities,
      medicineEntities,
    ],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const context = useContext(AccountContext);

  if (!context) {
    throw new Error('useAccount must be used within an AccountProvider');
  }

  return context;
}
