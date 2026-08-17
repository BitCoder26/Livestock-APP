import AsyncStorage from 'expo-sqlite/kv-store';
import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { createUniqueUuid } from '../utils/createLocalId';

export type SetupCollectionKey = 'farms' | 'paddocks' | 'groups' | 'medicines';
export type SetupSelectionTarget = 'fromFarm' | 'fromPaddock' | 'toFarm' | 'toPaddock';
// address/country are deliberately not tracked here: the account-level
// profile.businessAddress and profile.country already own those concepts
// (businessAddress is what's actually printed on exports; country drives
// the currency/flag defaults) — a per-farm copy would just be an unused
// duplicate, never read by anything except its own card. holdingId stays
// because it's genuinely farm-specific (a holding/registration number is
// unique per physical holding, not per business), with nothing else in the
// app to duplicate it against.
export type FarmEntity = {
  uid?: string;
  name: string;
  holdingId: string;
  notes: string;
};
export type PaddockEntity = {
  uid?: string;
  farmUid?: string;
  name: string;
  farm: string;
  notes: string;
};
// Deliberately not tied to a farm, paddock, or species: an animal's actual
// location already lives on the Animal record (kept live by Movement
// records — see rebuildAnimalsState in RecordsContext), so a farm/paddock
// stored here would go stale the moment the group's animals move, with
// nothing to keep it in sync. Species was dropped for the same reason: there
// is no updateGroup, so a species label set at creation can never be
// corrected once a farmer deliberately mixes species into a group (a
// co-grazing mob, a quarantine pen, a mixed hobby-farm group) — it would
// just silently go wrong with no way to fix it. A Group is just a
// freely-composable management label (e.g. "Dairy A"), independent of where
// its animals are or what species they are.
export type GroupEntity = {
  uid?: string;
  name: string;
  animals: string;
  notes: string;
};
export type TreatmentKind = 'medicine' | 'vaccine';

export type MedicineEntity = {
  uid?: string;
  treatmentType: TreatmentKind;
  name: string;
  activeIngredient: string;
  defaultDose: string;
  doseUnit: string;
  defaultRoute: string;
  meatWithdrawalPeriod: string;
  milkWithdrawalPeriod: string;
  manufacturer: string;
  batchNumber: string;
  expiryDate: string;
  supplier?: string;
  purchaseDate?: string;
  notes: string;
};

export type SetupMutationResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'duplicate' | 'in-use' | 'storage-error' | 'transaction-in-progress' };

type SetupContextValue = {
  farmEntities: FarmEntity[];
  paddockEntities: PaddockEntity[];
  groupEntities: GroupEntity[];
  medicineEntities: MedicineEntity[];
  farms: string[];
  paddocks: string[];
  groups: string[];
  medicines: string[];
  isLoaded: boolean;
  addFarm: (farm: FarmEntity) => Promise<SetupMutationResult>;
  updateFarm: (uid: string, farm: FarmEntity) => Promise<SetupMutationResult>;
  removeFarm: (name: string) => Promise<SetupMutationResult>;
  addPaddock: (paddock: PaddockEntity) => Promise<SetupMutationResult>;
  updatePaddock: (uid: string, paddock: PaddockEntity) => Promise<SetupMutationResult>;
  removePaddock: (name: string) => Promise<SetupMutationResult>;
  addGroup: (group: GroupEntity) => Promise<SetupMutationResult>;
  updateGroup: (uid: string, group: GroupEntity) => Promise<SetupMutationResult>;
  removeGroup: (name: string) => Promise<SetupMutationResult>;
  addMedicine: (medicine: MedicineEntity) => Promise<SetupMutationResult>;
  updateMedicine: (uid: string, medicine: MedicineEntity) => Promise<SetupMutationResult>;
  removeMedicine: (name: string) => Promise<SetupMutationResult>;
  addItem: (collection: SetupCollectionKey, value: string) => Promise<SetupMutationResult>;
  removeItem: (collection: SetupCollectionKey, value: string) => Promise<SetupMutationResult>;
  pendingSetupSelectionTarget: SetupSelectionTarget | null;
  pendingSetupSelectionResult: { target: SetupSelectionTarget; value: string } | null;
  beginSetupSelection: (target: SetupSelectionTarget) => void;
  resolveSetupSelection: (value: string) => void;
  clearSetupSelectionResult: () => void;
  resetSetup: () => Promise<SetupMutationResult>;
  // Restore-only escape hatch (see AccountContext.restoreFromBackup): the
  // caller is responsible for persisting nextSetup itself (as part of a
  // larger cross-store transaction) before syncing this context's state.
  replaceSetupFromTransaction: (nextSetup: {
    farms: FarmEntity[];
    paddocks: PaddockEntity[];
    groups: GroupEntity[];
    medicines: MedicineEntity[];
  }) => void;
};

const EMPTY_SETUP = {
  farms: [] as FarmEntity[],
  paddocks: [] as PaddockEntity[],
  groups: [] as GroupEntity[],
  medicines: [] as MedicineEntity[],
};

export const SETUP_STORAGE_KEY = 'livestockbook.setup.v1';
const SetupContext = createContext<SetupContextValue | null>(null);

export function SetupProvider({ children }: PropsWithChildren) {
  const [farmEntities, setFarmEntities] = useState<FarmEntity[]>(EMPTY_SETUP.farms);
  const [paddockEntities, setPaddockEntities] = useState<PaddockEntity[]>(EMPTY_SETUP.paddocks);
  const [groupEntities, setGroupEntities] = useState<GroupEntity[]>(EMPTY_SETUP.groups);
  const [medicineEntities, setMedicineEntities] = useState<MedicineEntity[]>(EMPTY_SETUP.medicines);
  const setupRef = useRef(EMPTY_SETUP);
  const setupMutationInProgress = useRef(false);
  const [hasLoadedStoredSetup, setHasLoadedStoredSetup] = useState(false);
  const [pendingSetupSelectionTarget, setPendingSetupSelectionTarget] = useState<SetupSelectionTarget | null>(null);
  const [pendingSetupSelectionResult, setPendingSetupSelectionResult] = useState<{ target: SetupSelectionTarget; value: string } | null>(null);

  useEffect(() => {
    let isActive = true;

    const restoreSetup = async () => {
      try {
        const storedSetup = await AsyncStorage.getItem(SETUP_STORAGE_KEY);

        if (storedSetup && isActive) {
          const parsedSetup: unknown = JSON.parse(storedSetup);

          if (isStoredSetup(parsedSetup)) {
            const normalizedSetup = normalizeStoredSetup(parsedSetup);
            setupRef.current = normalizedSetup;
            setFarmEntities(normalizedSetup.farms);
            setPaddockEntities(normalizedSetup.paddocks);
            setGroupEntities(normalizedSetup.groups);
            setMedicineEntities(normalizedSetup.medicines);
            await AsyncStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(normalizedSetup));
          }
        }
      } catch {
        // Keep the recovered setup entities if local storage cannot be read.
      } finally {
        if (isActive) {
          setHasLoadedStoredSetup(true);
        }
      }
    };

    void restoreSetup();

    return () => {
      isActive = false;
    };
  }, []);

  const value = useMemo<SetupContextValue>(
    () => {
      const replaceSetup = (nextSetup: typeof EMPTY_SETUP) => {
        setupRef.current = nextSetup;
        setFarmEntities(nextSetup.farms);
        setPaddockEntities(nextSetup.paddocks);
        setGroupEntities(nextSetup.groups);
        setMedicineEntities(nextSetup.medicines);
      };

      const persistSetup = async (nextSetup: typeof EMPTY_SETUP): Promise<SetupMutationResult> => {
        if (setupMutationInProgress.current) {
          return { ok: false, reason: 'transaction-in-progress' };
        }

        setupMutationInProgress.current = true;
        try {
          await AsyncStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(nextSetup));
        } catch {
          setupMutationInProgress.current = false;
          return { ok: false, reason: 'storage-error' };
        }

        replaceSetup(nextSetup);
        setupMutationInProgress.current = false;
        return { ok: true };
      };

      return {
      farmEntities,
      paddockEntities,
      groupEntities,
      medicineEntities,
      farms: farmEntities.map((farm) => farm.name),
      paddocks: paddockEntities.map((paddock) => paddock.name),
      groups: groupEntities.map((group) => group.name),
      medicines: medicineEntities.map((medicine) => medicine.name),
      isLoaded: hasLoadedStoredSetup,
      pendingSetupSelectionTarget,
      pendingSetupSelectionResult,
      replaceSetupFromTransaction: replaceSetup,
      addFarm: async (rawFarm) => {
        const farm = {
          uid: rawFarm.uid || createUniqueUuid(setupRef.current.farms.map((entry) => entry.uid ?? '')),
          name: rawFarm.name.trim(),
          holdingId: rawFarm.holdingId.trim(),
          notes: rawFarm.notes.trim(),
        };

        if (!farm.name) {
          return { ok: false, reason: 'invalid' };
        }

        if (setupRef.current.farms.some((entry) => equalsIgnoreCase(entry.name, farm.name))) {
          return { ok: false, reason: 'duplicate' };
        }

        return persistSetup({ ...setupRef.current, farms: [...setupRef.current.farms, farm] });
      },
      updateFarm: async (uid, rawFarm) => {
        const existing = setupRef.current.farms.find((entry) => entry.uid === uid);

        if (!existing) {
          return { ok: false, reason: 'invalid' };
        }

        const name = rawFarm.name.trim();

        if (!name) {
          return { ok: false, reason: 'invalid' };
        }

        if (setupRef.current.farms.some((entry) => entry.uid !== uid && equalsIgnoreCase(entry.name, name))) {
          return { ok: false, reason: 'duplicate' };
        }

        const updatedFarm: FarmEntity = {
          uid,
          name,
          holdingId: rawFarm.holdingId.trim(),
          notes: rawFarm.notes.trim(),
        };
        const nameChanged = !equalsIgnoreCase(existing.name, name);

        // Records link to farms by uid and resolve the live name at display
        // time (see resolveFarmName), so a rename shows up on them for
        // free. Paddocks are a much smaller, bounded collection and still
        // carry a denormalized farm-name string alongside farmUid — cheap
        // enough to just keep in sync eagerly here. Groups don't reference a
        // farm at all (see GroupEntity), so there's nothing to sync there.
        return persistSetup({
          ...setupRef.current,
          farms: setupRef.current.farms.map((entry) => (entry.uid === uid ? updatedFarm : entry)),
          paddocks: nameChanged
            ? setupRef.current.paddocks.map((entry) => (entry.farmUid === uid ? { ...entry, farm: name } : entry))
            : setupRef.current.paddocks,
        });
      },
      removeFarm: async (name) => {
        if (setupRef.current.paddocks.some((entry) => equalsIgnoreCase(entry.farm, name))) {
          return { ok: false, reason: 'in-use' };
        }

        return persistSetup({
          ...setupRef.current,
          farms: setupRef.current.farms.filter((entry) => !equalsIgnoreCase(entry.name, name)),
        });
      },
      addPaddock: async (rawPaddock) => {
        const paddock = {
          uid: rawPaddock.uid || createUniqueUuid(setupRef.current.paddocks.map((entry) => entry.uid ?? '')),
          farmUid:
            rawPaddock.farmUid ||
            setupRef.current.farms.find((entry) => equalsIgnoreCase(entry.name, rawPaddock.farm))?.uid,
          name: rawPaddock.name.trim(),
          farm: rawPaddock.farm.trim(),
          notes: rawPaddock.notes.trim(),
        };

        if (!paddock.name || !paddock.farm) {
          return { ok: false, reason: 'invalid' };
        }

        if (!setupRef.current.farms.some((entry) => equalsIgnoreCase(entry.name, paddock.farm))) {
          return { ok: false, reason: 'invalid' };
        }

        if (setupRef.current.paddocks.some((entry) => equalsIgnoreCase(entry.name, paddock.name))) {
          return { ok: false, reason: 'duplicate' };
        }

        return persistSetup({ ...setupRef.current, paddocks: [...setupRef.current.paddocks, paddock] });
      },
      updatePaddock: async (uid, rawPaddock) => {
        const existing = setupRef.current.paddocks.find((entry) => entry.uid === uid);

        if (!existing) {
          return { ok: false, reason: 'invalid' };
        }

        const name = rawPaddock.name.trim();
        const farmName = rawPaddock.farm.trim();

        if (!name || !farmName) {
          return { ok: false, reason: 'invalid' };
        }

        const matchingFarm = setupRef.current.farms.find((entry) => equalsIgnoreCase(entry.name, farmName));

        if (!matchingFarm) {
          return { ok: false, reason: 'invalid' };
        }

        if (setupRef.current.paddocks.some((entry) => entry.uid !== uid && equalsIgnoreCase(entry.name, name))) {
          return { ok: false, reason: 'duplicate' };
        }

        const updatedPaddock: PaddockEntity = {
          uid,
          farmUid: matchingFarm.uid,
          name,
          farm: matchingFarm.name,
          notes: rawPaddock.notes.trim(),
        };

        // Records link to paddocks by uid and resolve the live name at
        // display time, so a rename shows up on them for free. Groups don't
        // reference a paddock at all (see GroupEntity), so there's nothing
        // to sync there.
        return persistSetup({
          ...setupRef.current,
          paddocks: setupRef.current.paddocks.map((entry) => (entry.uid === uid ? updatedPaddock : entry)),
        });
      },
      removePaddock: async (name) => {
        return persistSetup({
          ...setupRef.current,
          paddocks: setupRef.current.paddocks.filter((entry) => !equalsIgnoreCase(entry.name, name)),
        });
      },
      addGroup: async (rawGroup) => {
        const group = {
          uid: rawGroup.uid || createUniqueUuid(setupRef.current.groups.map((entry) => entry.uid ?? '')),
          name: rawGroup.name.trim(),
          animals: rawGroup.animals.trim(),
          notes: rawGroup.notes.trim(),
        };

        if (!group.name) {
          return { ok: false, reason: 'invalid' };
        }

        if (setupRef.current.groups.some((entry) => equalsIgnoreCase(entry.name, group.name))) {
          return { ok: false, reason: 'duplicate' };
        }

        return persistSetup({ ...setupRef.current, groups: [...setupRef.current.groups, group] });
      },
      updateGroup: async (uid, rawGroup) => {
        const existing = setupRef.current.groups.find((entry) => entry.uid === uid);

        if (!existing) {
          return { ok: false, reason: 'invalid' };
        }

        const name = rawGroup.name.trim();

        if (!name) {
          return { ok: false, reason: 'invalid' };
        }

        if (setupRef.current.groups.some((entry) => entry.uid !== uid && equalsIgnoreCase(entry.name, name))) {
          return { ok: false, reason: 'duplicate' };
        }

        // Only name/notes are editable from the Groups screen — everything
        // else (farm/paddock/species links) stays exactly as it was.
        // Animals link to groups by uid and resolve the live name at
        // display time, so a rename shows up on them for free.
        const updatedGroup: GroupEntity = {
          ...existing,
          name,
          notes: rawGroup.notes.trim(),
        };

        return persistSetup({
          ...setupRef.current,
          groups: setupRef.current.groups.map((entry) => (entry.uid === uid ? updatedGroup : entry)),
        });
      },
      removeGroup: async (name) => {
        return persistSetup({
          ...setupRef.current,
          groups: setupRef.current.groups.filter((entry) => !equalsIgnoreCase(entry.name, name)),
        });
      },
      addMedicine: async (rawMedicine) => {
        const medicine = {
          uid: rawMedicine.uid || createUniqueUuid(setupRef.current.medicines.map((entry) => entry.uid ?? '')),
          treatmentType: rawMedicine.treatmentType,
          name: rawMedicine.name.trim(),
          activeIngredient: rawMedicine.activeIngredient.trim(),
          defaultDose: rawMedicine.defaultDose.trim(),
          doseUnit: rawMedicine.doseUnit.trim(),
          defaultRoute: rawMedicine.defaultRoute.trim(),
          meatWithdrawalPeriod: rawMedicine.meatWithdrawalPeriod.trim(),
          milkWithdrawalPeriod: rawMedicine.milkWithdrawalPeriod.trim(),
          manufacturer: rawMedicine.manufacturer.trim(),
          batchNumber: rawMedicine.batchNumber.trim(),
          expiryDate: rawMedicine.expiryDate.trim(),
          supplier: rawMedicine.supplier?.trim() ?? '',
          purchaseDate: rawMedicine.purchaseDate?.trim() ?? '',
          notes: rawMedicine.notes.trim(),
        };

        if (!medicine.name) {
          return { ok: false, reason: 'invalid' };
        }

        if (setupRef.current.medicines.some((entry) => equalsIgnoreCase(entry.name, medicine.name))) {
          return { ok: false, reason: 'duplicate' };
        }

        return persistSetup({ ...setupRef.current, medicines: [...setupRef.current.medicines, medicine] });
      },
      updateMedicine: async (uid, rawMedicine) => {
        const existing = setupRef.current.medicines.find((entry) => entry.uid === uid);

        if (!existing) {
          return { ok: false, reason: 'invalid' };
        }

        const name = rawMedicine.name.trim();

        if (!name) {
          return { ok: false, reason: 'invalid' };
        }

        if (setupRef.current.medicines.some((entry) => entry.uid !== uid && equalsIgnoreCase(entry.name, name))) {
          return { ok: false, reason: 'duplicate' };
        }

        // Editing here only ever updates the reference entry itself — past
        // Medication/Vaccination records already captured their own dose,
        // batch, and withdrawal period as independent snapshots at the time
        // they were logged, and correcting the reference entry later should
        // never rewrite what a record says was actually administered.
        const updatedMedicine: MedicineEntity = {
          uid,
          treatmentType: rawMedicine.treatmentType,
          name,
          activeIngredient: rawMedicine.activeIngredient.trim(),
          defaultDose: rawMedicine.defaultDose.trim(),
          doseUnit: rawMedicine.doseUnit.trim(),
          defaultRoute: rawMedicine.defaultRoute.trim(),
          meatWithdrawalPeriod: rawMedicine.meatWithdrawalPeriod.trim(),
          milkWithdrawalPeriod: rawMedicine.milkWithdrawalPeriod.trim(),
          manufacturer: rawMedicine.manufacturer.trim(),
          batchNumber: rawMedicine.batchNumber.trim(),
          expiryDate: rawMedicine.expiryDate.trim(),
          supplier: rawMedicine.supplier?.trim() ?? '',
          purchaseDate: rawMedicine.purchaseDate?.trim() ?? '',
          notes: rawMedicine.notes.trim(),
        };

        return persistSetup({
          ...setupRef.current,
          medicines: setupRef.current.medicines.map((entry) => (entry.uid === uid ? updatedMedicine : entry)),
        });
      },
      removeMedicine: async (name) => {
        return persistSetup({
          ...setupRef.current,
          medicines: setupRef.current.medicines.filter((entry) => !equalsIgnoreCase(entry.name, name)),
        });
      },
      addItem: async (collection, rawValue) => {
        const value = rawValue.trim();

        if (!value) {
          return { ok: false, reason: 'invalid' };
        }

        if (collection === 'farms') {
          if (setupRef.current.farms.some((entry) => equalsIgnoreCase(entry.name, value))) {
            return { ok: false, reason: 'duplicate' };
          }
          return persistSetup({
            ...setupRef.current,
            farms: [
              ...setupRef.current.farms,
              {
                uid: createUniqueUuid(setupRef.current.farms.map((entry) => entry.uid ?? '')),
                name: value,
                holdingId: '',
                notes: '',
              },
            ],
          });
        }

        if (collection === 'paddocks') {
          return { ok: false, reason: 'invalid' };
        }

        if (collection === 'groups') {
          if (setupRef.current.groups.some((entry) => equalsIgnoreCase(entry.name, value))) {
            return { ok: false, reason: 'duplicate' };
          }
          return persistSetup({
            ...setupRef.current,
            groups: [
              ...setupRef.current.groups,
              {
                uid: createUniqueUuid(setupRef.current.groups.map((entry) => entry.uid ?? '')),
                name: value,
                animals: '',
                notes: '',
              },
            ],
          });
        }

        if (collection === 'medicines') {
          if (setupRef.current.medicines.some((entry) => equalsIgnoreCase(entry.name, value))) {
            return { ok: false, reason: 'duplicate' };
          }
          return persistSetup({
            ...setupRef.current,
            medicines: [
              ...setupRef.current.medicines,
              {
                treatmentType: 'medicine',
                name: value,
                activeIngredient: '',
                defaultDose: '',
                doseUnit: '',
                defaultRoute: '',
                meatWithdrawalPeriod: '',
                milkWithdrawalPeriod: '',
                manufacturer: '',
                batchNumber: '',
                expiryDate: '',
                notes: '',
              },
            ],
          });
        }

        return { ok: false, reason: 'invalid' };
      },
      beginSetupSelection: (target) => {
        setPendingSetupSelectionTarget(target);
        setPendingSetupSelectionResult(null);
      },
      resolveSetupSelection: (rawValue) => {
        const value = rawValue.trim();

        if (!value || !pendingSetupSelectionTarget) {
          return;
        }

        setPendingSetupSelectionResult({ target: pendingSetupSelectionTarget, value });
        setPendingSetupSelectionTarget(null);
      },
      clearSetupSelectionResult: () => {
        setPendingSetupSelectionResult(null);
      },
      removeItem: async (collection, value) => {
        if (collection === 'farms') {
          if (setupRef.current.paddocks.some((entry) => equalsIgnoreCase(entry.farm, value))) {
            return { ok: false, reason: 'in-use' };
          }
          return persistSetup({
            ...setupRef.current,
            farms: setupRef.current.farms.filter((entry) => !equalsIgnoreCase(entry.name, value)),
          });
        }

        if (collection === 'paddocks') {
          return persistSetup({
            ...setupRef.current,
            paddocks: setupRef.current.paddocks.filter((entry) => !equalsIgnoreCase(entry.name, value)),
          });
        }

        if (collection === 'groups') {
          return persistSetup({
            ...setupRef.current,
            groups: setupRef.current.groups.filter((entry) => !equalsIgnoreCase(entry.name, value)),
          });
        }

        if (collection === 'medicines') {
          return persistSetup({
            ...setupRef.current,
            medicines: setupRef.current.medicines.filter((entry) => !equalsIgnoreCase(entry.name, value)),
          });
        }

        return { ok: false, reason: 'invalid' };
      },
      resetSetup: async () => {
        const result = await persistSetup(EMPTY_SETUP);
        if (!result.ok) {
          return result;
        }
        setPendingSetupSelectionTarget(null);
        setPendingSetupSelectionResult(null);
        return result;
      },
      };
    },
    [farmEntities, groupEntities, hasLoadedStoredSetup, medicineEntities, paddockEntities, pendingSetupSelectionResult, pendingSetupSelectionTarget],
  );

  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}

export function isStoredSetup(value: unknown): value is typeof EMPTY_SETUP {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const setup = value as Partial<typeof EMPTY_SETUP>;
  return (
    Array.isArray(setup.farms) &&
    Array.isArray(setup.paddocks) &&
    Array.isArray(setup.groups) &&
    Array.isArray(setup.medicines)
  );
}

export function normalizeStoredSetup(setup: typeof EMPTY_SETUP): typeof EMPTY_SETUP {
  const farmUids = new Set<string>();
  // Farms carry no address/country (see FarmEntity) — any left over in older
  // stored data is just inert extra JSON, harmlessly dropped by not being
  // spread through here.
  const farms = setup.farms.map((farm) => {
    const storedUid = farm.uid?.trim();
    const uid = storedUid && !farmUids.has(storedUid) ? storedUid : createUniqueUuid(farmUids);
    farmUids.add(uid);
    return { uid, name: farm.name, holdingId: farm.holdingId, notes: farm.notes };
  });

  const paddockUids = new Set<string>();
  // Paddocks carry no area/areaUnit (see PaddockEntity) — any left over in
  // older stored data is just inert extra JSON, harmlessly dropped by not
  // being spread through here.
  const paddocks = setup.paddocks.map((paddock) => {
    const storedUid = paddock.uid?.trim();
    const uid = storedUid && !paddockUids.has(storedUid) ? storedUid : createUniqueUuid(paddockUids);
    paddockUids.add(uid);
    const matchingFarm = farms.find(
      (farm) => farm.uid === paddock.farmUid || equalsIgnoreCase(farm.name, paddock.farm),
    );
    return { uid, farmUid: matchingFarm?.uid, name: paddock.name, farm: paddock.farm, notes: paddock.notes };
  });

  const groupUids = new Set<string>();
  // Groups carry no farm/paddock/species reference (see GroupEntity) — any
  // left over in older stored data is just inert extra JSON, harmlessly
  // dropped by not being spread through here.
  const groups = setup.groups.map((group) => {
    const storedUid = group.uid?.trim();
    const uid = storedUid && !groupUids.has(storedUid) ? storedUid : createUniqueUuid(groupUids);
    groupUids.add(uid);

    return {
      uid,
      name: group.name,
      animals: group.animals,
      notes: group.notes,
    };
  });

  const medicineUids = new Set<string>();
  const medicines = setup.medicines.map((medicine) => {
    const storedUid = medicine.uid?.trim();
    const uid = storedUid && !medicineUids.has(storedUid) ? storedUid : createUniqueUuid(medicineUids);
    medicineUids.add(uid);
    return { ...medicine, uid };
  });

  return { farms, paddocks, groups, medicines };
}

function equalsIgnoreCase(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function useSetup() {
  const context = useContext(SetupContext);

  if (!context) {
    throw new Error('useSetup must be used within a SetupProvider');
  }

  return context;
}
