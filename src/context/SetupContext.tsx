import AsyncStorage from 'expo-sqlite/kv-store';
import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type SetupCollectionKey = 'farms' | 'paddocks' | 'groups' | 'medicines';
export type SetupSelectionTarget = 'fromFarm' | 'fromPaddock' | 'toFarm' | 'toPaddock';
export type FarmEntity = {
  name: string;
  holdingId: string;
  address: string;
  country: string;
  notes: string;
};
export type PaddockEntity = {
  name: string;
  farm: string;
  area: string;
  areaUnit: string;
  notes: string;
};
export type GroupEntity = {
  name: string;
  farm: string;
  paddocks: string[];
  species: string;
  animals: string;
  notes: string;
};
export type TreatmentKind = 'medicine' | 'vaccine';

export type MedicineEntity = {
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

type SetupContextValue = {
  farmEntities: FarmEntity[];
  paddockEntities: PaddockEntity[];
  groupEntities: GroupEntity[];
  medicineEntities: MedicineEntity[];
  farms: string[];
  paddocks: string[];
  groups: string[];
  medicines: string[];
  addFarm: (farm: FarmEntity) => void;
  removeFarm: (name: string) => void;
  addPaddock: (paddock: PaddockEntity) => void;
  removePaddock: (name: string) => void;
  addGroup: (group: GroupEntity) => void;
  removeGroup: (name: string) => void;
  addMedicine: (medicine: MedicineEntity) => void;
  removeMedicine: (name: string) => void;
  addItem: (collection: SetupCollectionKey, value: string) => void;
  removeItem: (collection: SetupCollectionKey, value: string) => void;
  pendingSetupSelectionTarget: SetupSelectionTarget | null;
  pendingSetupSelectionResult: { target: SetupSelectionTarget; value: string } | null;
  beginSetupSelection: (target: SetupSelectionTarget) => void;
  resolveSetupSelection: (value: string) => void;
  clearSetupSelectionResult: () => void;
  resetSetup: () => void;
};

const EMPTY_SETUP = {
  farms: [] as FarmEntity[],
  paddocks: [] as PaddockEntity[],
  groups: [] as GroupEntity[],
  medicines: [] as MedicineEntity[],
};

const SETUP_STORAGE_KEY = 'livestockbook.setup.v1';
const SetupContext = createContext<SetupContextValue | null>(null);

export function SetupProvider({ children }: PropsWithChildren) {
  const [farmEntities, setFarmEntities] = useState<FarmEntity[]>(EMPTY_SETUP.farms);
  const [paddockEntities, setPaddockEntities] = useState<PaddockEntity[]>(EMPTY_SETUP.paddocks);
  const [groupEntities, setGroupEntities] = useState<GroupEntity[]>(EMPTY_SETUP.groups);
  const [medicineEntities, setMedicineEntities] = useState<MedicineEntity[]>(EMPTY_SETUP.medicines);
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
            setFarmEntities(parsedSetup.farms);
            setPaddockEntities(parsedSetup.paddocks);
            setGroupEntities(parsedSetup.groups);
            setMedicineEntities(parsedSetup.medicines);
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

  useEffect(() => {
    if (!hasLoadedStoredSetup) {
      return;
    }

    void AsyncStorage.setItem(
      SETUP_STORAGE_KEY,
      JSON.stringify({
        farms: farmEntities,
        paddocks: paddockEntities,
        groups: groupEntities,
        medicines: medicineEntities,
      }),
    );
  }, [farmEntities, groupEntities, hasLoadedStoredSetup, medicineEntities, paddockEntities]);

  const value = useMemo<SetupContextValue>(
    () => ({
      farmEntities,
      paddockEntities,
      groupEntities,
      medicineEntities,
      farms: farmEntities.map((farm) => farm.name),
      paddocks: paddockEntities.map((paddock) => paddock.name),
      groups: groupEntities.map((group) => group.name),
      medicines: medicineEntities.map((medicine) => medicine.name),
      pendingSetupSelectionTarget,
      pendingSetupSelectionResult,
      addFarm: (rawFarm) => {
        const farm = {
          name: rawFarm.name.trim(),
          holdingId: rawFarm.holdingId.trim(),
          address: rawFarm.address.trim(),
          country: rawFarm.country.trim(),
          notes: rawFarm.notes.trim(),
        };

        if (!farm.name) {
          return;
        }

        setFarmEntities((current) =>
          current.some((entry) => entry.name.toLowerCase() === farm.name.toLowerCase()) ? current : [...current, farm],
        );
      },
      removeFarm: (name) => {
        setFarmEntities((current) => current.filter((entry) => entry.name !== name));
      },
      addPaddock: (rawPaddock) => {
        const paddock = {
          name: rawPaddock.name.trim(),
          farm: rawPaddock.farm.trim(),
          area: rawPaddock.area.trim(),
          areaUnit: rawPaddock.areaUnit.trim(),
          notes: rawPaddock.notes.trim(),
        };

        if (!paddock.name) {
          return;
        }

        setPaddockEntities((current) =>
          current.some((entry) => entry.name.toLowerCase() === paddock.name.toLowerCase()) ? current : [...current, paddock],
        );
      },
      removePaddock: (name) => {
        setPaddockEntities((current) => current.filter((entry) => entry.name !== name));
      },
      addGroup: (rawGroup) => {
        const group = {
          name: rawGroup.name.trim(),
          farm: rawGroup.farm.trim(),
          paddocks: rawGroup.paddocks.map((paddock) => paddock.trim()).filter(Boolean),
          species: rawGroup.species.trim(),
          animals: rawGroup.animals.trim(),
          notes: rawGroup.notes.trim(),
        };

        if (!group.name) {
          return;
        }

        setGroupEntities((current) =>
          current.some((entry) => entry.name.toLowerCase() === group.name.toLowerCase()) ? current : [...current, group],
        );
      },
      removeGroup: (name) => {
        setGroupEntities((current) => current.filter((entry) => entry.name !== name));
      },
      addMedicine: (rawMedicine) => {
        const medicine = {
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
          return;
        }

        setMedicineEntities((current) =>
          current.some((entry) => entry.name.toLowerCase() === medicine.name.toLowerCase()) ? current : [...current, medicine],
        );
      },
      removeMedicine: (name) => {
        setMedicineEntities((current) => current.filter((entry) => entry.name !== name));
      },
      addItem: (collection, rawValue) => {
        const value = rawValue.trim();

        if (!value) {
          return;
        }

        if (collection === 'farms') {
          setFarmEntities((current) =>
            current.some((entry) => entry.name.toLowerCase() === value.toLowerCase())
              ? current
              : [...current, { name: value, holdingId: '', address: '', country: '', notes: '' }],
          );
          return;
        }

        if (collection === 'paddocks') {
          setPaddockEntities((current) =>
            current.some((entry) => entry.name.toLowerCase() === value.toLowerCase())
              ? current
              : [...current, { name: value, farm: '', area: '', areaUnit: '', notes: '' }],
          );
          return;
        }

        if (collection === 'groups') {
          setGroupEntities((current) =>
            current.some((entry) => entry.name.toLowerCase() === value.toLowerCase())
              ? current
              : [...current, { name: value, farm: '', paddocks: [], species: '', animals: '', notes: '' }],
          );
          return;
        }

        if (collection === 'medicines') {
          setMedicineEntities((current) =>
            current.some((entry) => entry.name.toLowerCase() === value.toLowerCase())
              ? current
              : [
                  ...current,
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
          );
          return;
        }

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
      removeItem: (collection, value) => {
        if (collection === 'farms') {
          setFarmEntities((current) => current.filter((entry) => entry.name !== value));
          return;
        }

        if (collection === 'paddocks') {
          setPaddockEntities((current) => current.filter((entry) => entry.name !== value));
          return;
        }

        if (collection === 'groups') {
          setGroupEntities((current) => current.filter((entry) => entry.name !== value));
          return;
        }

        if (collection === 'medicines') {
          setMedicineEntities((current) => current.filter((entry) => entry.name !== value));
          return;
        }

      },
      resetSetup: () => {
        setFarmEntities(EMPTY_SETUP.farms);
        setPaddockEntities(EMPTY_SETUP.paddocks);
        setGroupEntities(EMPTY_SETUP.groups);
        setMedicineEntities(EMPTY_SETUP.medicines);
        setPendingSetupSelectionTarget(null);
        setPendingSetupSelectionResult(null);
      },
    }),
    [farmEntities, groupEntities, medicineEntities, paddockEntities, pendingSetupSelectionResult, pendingSetupSelectionTarget],
  );

  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}

function isStoredSetup(value: unknown): value is typeof EMPTY_SETUP {
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

export function useSetup() {
  const context = useContext(SetupContext);

  if (!context) {
    throw new Error('useSetup must be used within a SetupProvider');
  }

  return context;
}
