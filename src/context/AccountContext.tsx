import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { AccountProfile } from '../entities/account';
import { DEFAULT_ACCOUNT_PROFILE } from '../entities/account';
import { requestDeleteAccount, requestPasswordChange, requestSignOutAllDevices, type BackendActionResult } from '../services/accountBackend';
import { clearAccountProfile, loadAccountProfile, saveAccountProfile } from '../services/accountStorage';
import { useAnimals } from './AnimalsContext';
import { useRecords } from './RecordsContext';
import { useSetup } from './SetupContext';

type AccountContextValue = {
  profile: AccountProfile;
  isLoaded: boolean;
  updateField: <Key extends keyof AccountProfile>(key: Key, value: AccountProfile[Key]) => void;
  resetAppData: () => Promise<void>;
  changePassword: (currentPassword: string, nextPassword: string) => Promise<BackendActionResult>;
  signOutAllDevices: () => Promise<BackendActionResult>;
  deleteAccount: () => Promise<BackendActionResult>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: PropsWithChildren) {
  const { resetAnimals } = useAnimals();
  const { resetRecords } = useRecords();
  const { resetSetup } = useSetup();
  const [profile, setProfile] = useState<AccountProfile>(DEFAULT_ACCOUNT_PROFILE);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      const storedProfile = await loadAccountProfile();

      if (!active) {
        return;
      }

      setProfile(storedProfile);
      setIsLoaded(true);
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    void saveAccountProfile(profile);
  }, [isLoaded, profile]);

  const value = useMemo<AccountContextValue>(
    () => ({
      profile,
      isLoaded,
      updateField: (key, value) => {
        setProfile((current) => ({
          ...current,
          [key]: value,
        }));
      },
      resetAppData: async () => {
        resetAnimals();
        resetRecords();
        resetSetup();
      },
      changePassword: async (currentPassword, nextPassword) => {
        void currentPassword;
        void nextPassword;
        return requestPasswordChange();
      },
      signOutAllDevices: async () => requestSignOutAllDevices(),
      deleteAccount: async () => {
        resetAnimals();
        resetRecords();
        resetSetup();
        setProfile(DEFAULT_ACCOUNT_PROFILE);
        await clearAccountProfile();
        return requestDeleteAccount();
      },
    }),
    [isLoaded, profile, resetAnimals, resetRecords, resetSetup],
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
