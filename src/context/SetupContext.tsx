import AsyncStorage from 'expo-sqlite/kv-store';
import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { createUniqueUuid } from '../utils/createLocalId';

export type SetupCollectionKey = 'farms' | 'locations' | 'labels' | 'medicines';
export type SetupSelectionTarget = 'fromFarm' | 'fromLocation' | 'toFarm' | 'toLocation';
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
export type LocationEntity = {
  uid?: string;
  farmUid?: string;
  name: string;
  farm: string;
  notes: string;
};
// Deliberately not tied to a farm, location, or species: an animal's actual
// location already lives on the Animal record (kept live by Movement
// records — see rebuildAnimalsState in RecordsContext), so a farm/location
// stored here would go stale the moment a labelled animal moves, with
// nothing to keep it in sync. Species was dropped for the same reason: a
// species set at creation can never be corrected once a farmer deliberately
// mixes species under one label (a co-grazing mob, a quarantine pen, a mixed
// hobby-farm batch) — it would just silently go wrong with no way to fix it.
// A Label is a freely-composable management tag (e.g. "Dairy A", "Mothers"),
// independent of where its animals are or what species they are. An animal
// carries as many as apply, which is the whole point: labels are how you
// mass-record animals that aren't in a herd or flock.
export type LabelEntity = {
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
  locationEntities: LocationEntity[];
  labelEntities: LabelEntity[];
  medicineEntities: MedicineEntity[];
  farms: string[];
  locations: string[];
  labels: string[];
  medicines: string[];
  isLoaded: boolean;
  addFarm: (farm: FarmEntity) => Promise<SetupMutationResult>;
  updateFarm: (uid: string, farm: FarmEntity) => Promise<SetupMutationResult>;
  removeFarm: (name: string) => Promise<SetupMutationResult>;
  addLocation: (location: LocationEntity) => Promise<SetupMutationResult>;
  updateLocation: (uid: string, location: LocationEntity) => Promise<SetupMutationResult>;
  removeLocation: (name: string) => Promise<SetupMutationResult>;
  addLabel: (label: LabelEntity) => Promise<SetupMutationResult>;
  updateLabel: (uid: string, label: LabelEntity) => Promise<SetupMutationResult>;
  removeLabel: (name: string) => Promise<SetupMutationResult>;
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
    locations: LocationEntity[];
    labels: LabelEntity[];
    medicines: MedicineEntity[];
  }) => void;
};

const EMPTY_SETUP = {
  farms: [] as FarmEntity[],
  locations: [] as LocationEntity[],
  labels: [] as LabelEntity[],
  medicines: [] as MedicineEntity[],
};

export const SETUP_STORAGE_KEY = 'livestockbook.setup.v1';
const SetupContext = createContext<SetupContextValue | null>(null);

export function SetupProvider({ children }: PropsWithChildren) {
  const [farmEntities, setFarmEntities] = useState<FarmEntity[]>(EMPTY_SETUP.farms);
  const [locationEntities, setLocationEntities] = useState<LocationEntity[]>(EMPTY_SETUP.locations);
  const [labelEntities, setLabelEntities] = useState<LabelEntity[]>(EMPTY_SETUP.labels);
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
            setLocationEntities(normalizedSetup.locations);
            setLabelEntities(normalizedSetup.labels);
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
        setLocationEntities(nextSetup.locations);
        setLabelEntities(nextSetup.labels);
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
      locationEntities,
      labelEntities,
      medicineEntities,
      farms: farmEntities.map((farm) => farm.name),
      locations: locationEntities.map((location) => location.name),
      labels: labelEntities.map((label) => label.name),
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
        // free. Locations are a much smaller, bounded collection and still
        // carry a denormalized farm-name string alongside farmUid — cheap
        // enough to just keep in sync eagerly here. Labels don't reference a
        // farm at all (see LabelEntity), so there's nothing to sync there.
        return persistSetup({
          ...setupRef.current,
          farms: setupRef.current.farms.map((entry) => (entry.uid === uid ? updatedFarm : entry)),
          locations: nameChanged
            ? setupRef.current.locations.map((entry) => (entry.farmUid === uid ? { ...entry, farm: name } : entry))
            : setupRef.current.locations,
        });
      },
      removeFarm: async (name) => {
        if (setupRef.current.locations.some((entry) => equalsIgnoreCase(entry.farm, name))) {
          return { ok: false, reason: 'in-use' };
        }

        return persistSetup({
          ...setupRef.current,
          farms: setupRef.current.farms.filter((entry) => !equalsIgnoreCase(entry.name, name)),
        });
      },
      addLocation: async (rawLocation) => {
        const location = {
          uid: rawLocation.uid || createUniqueUuid(setupRef.current.locations.map((entry) => entry.uid ?? '')),
          farmUid:
            rawLocation.farmUid ||
            setupRef.current.farms.find((entry) => equalsIgnoreCase(entry.name, rawLocation.farm))?.uid,
          name: rawLocation.name.trim(),
          farm: rawLocation.farm.trim(),
          notes: rawLocation.notes.trim(),
        };

        if (!location.name || !location.farm) {
          return { ok: false, reason: 'invalid' };
        }

        if (!setupRef.current.farms.some((entry) => equalsIgnoreCase(entry.name, location.farm))) {
          return { ok: false, reason: 'invalid' };
        }

        if (setupRef.current.locations.some((entry) => equalsIgnoreCase(entry.name, location.name))) {
          return { ok: false, reason: 'duplicate' };
        }

        return persistSetup({ ...setupRef.current, locations: [...setupRef.current.locations, location] });
      },
      updateLocation: async (uid, rawLocation) => {
        const existing = setupRef.current.locations.find((entry) => entry.uid === uid);

        if (!existing) {
          return { ok: false, reason: 'invalid' };
        }

        const name = rawLocation.name.trim();
        const farmName = rawLocation.farm.trim();

        if (!name || !farmName) {
          return { ok: false, reason: 'invalid' };
        }

        const matchingFarm = setupRef.current.farms.find((entry) => equalsIgnoreCase(entry.name, farmName));

        if (!matchingFarm) {
          return { ok: false, reason: 'invalid' };
        }

        if (setupRef.current.locations.some((entry) => entry.uid !== uid && equalsIgnoreCase(entry.name, name))) {
          return { ok: false, reason: 'duplicate' };
        }

        const updatedLocation: LocationEntity = {
          uid,
          farmUid: matchingFarm.uid,
          name,
          farm: matchingFarm.name,
          notes: rawLocation.notes.trim(),
        };

        // Records link to locations by uid and resolve the live name at
        // display time, so a rename shows up on them for free. Labels don't
        // reference a location at all (see LabelEntity), so there's nothing
        // to sync there.
        return persistSetup({
          ...setupRef.current,
          locations: setupRef.current.locations.map((entry) => (entry.uid === uid ? updatedLocation : entry)),
        });
      },
      removeLocation: async (name) => {
        return persistSetup({
          ...setupRef.current,
          locations: setupRef.current.locations.filter((entry) => !equalsIgnoreCase(entry.name, name)),
        });
      },
      addLabel: async (rawLabel) => {
        const label = {
          uid: rawLabel.uid || createUniqueUuid(setupRef.current.labels.map((entry) => entry.uid ?? '')),
          name: rawLabel.name.trim(),
          animals: rawLabel.animals.trim(),
          notes: rawLabel.notes.trim(),
        };

        if (!label.name) {
          return { ok: false, reason: 'invalid' };
        }

        if (setupRef.current.labels.some((entry) => equalsIgnoreCase(entry.name, label.name))) {
          return { ok: false, reason: 'duplicate' };
        }

        return persistSetup({ ...setupRef.current, labels: [...setupRef.current.labels, label] });
      },
      updateLabel: async (uid, rawLabel) => {
        const existing = setupRef.current.labels.find((entry) => entry.uid === uid);

        if (!existing) {
          return { ok: false, reason: 'invalid' };
        }

        const name = rawLabel.name.trim();

        if (!name) {
          return { ok: false, reason: 'invalid' };
        }

        if (setupRef.current.labels.some((entry) => entry.uid !== uid && equalsIgnoreCase(entry.name, name))) {
          return { ok: false, reason: 'duplicate' };
        }

        // Only name/notes are editable from the Labels screen — everything
        // else (farm/location/species links) stays exactly as it was.
        // Animals link to labels by uid and resolve the live name at
        // display time, so a rename shows up on them for free.
        const updatedLabel: LabelEntity = {
          ...existing,
          name,
          notes: rawLabel.notes.trim(),
        };

        return persistSetup({
          ...setupRef.current,
          labels: setupRef.current.labels.map((entry) => (entry.uid === uid ? updatedLabel : entry)),
        });
      },
      removeLabel: async (name) => {
        return persistSetup({
          ...setupRef.current,
          labels: setupRef.current.labels.filter((entry) => !equalsIgnoreCase(entry.name, name)),
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

        if (collection === 'locations') {
          return { ok: false, reason: 'invalid' };
        }

        if (collection === 'labels') {
          if (setupRef.current.labels.some((entry) => equalsIgnoreCase(entry.name, value))) {
            return { ok: false, reason: 'duplicate' };
          }
          return persistSetup({
            ...setupRef.current,
            labels: [
              ...setupRef.current.labels,
              {
                uid: createUniqueUuid(setupRef.current.labels.map((entry) => entry.uid ?? '')),
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
          if (setupRef.current.locations.some((entry) => equalsIgnoreCase(entry.farm, value))) {
            return { ok: false, reason: 'in-use' };
          }
          return persistSetup({
            ...setupRef.current,
            farms: setupRef.current.farms.filter((entry) => !equalsIgnoreCase(entry.name, value)),
          });
        }

        if (collection === 'locations') {
          return persistSetup({
            ...setupRef.current,
            locations: setupRef.current.locations.filter((entry) => !equalsIgnoreCase(entry.name, value)),
          });
        }

        if (collection === 'labels') {
          return persistSetup({
            ...setupRef.current,
            labels: setupRef.current.labels.filter((entry) => !equalsIgnoreCase(entry.name, value)),
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
    [farmEntities, labelEntities, hasLoadedStoredSetup, medicineEntities, locationEntities, pendingSetupSelectionResult, pendingSetupSelectionTarget],
  );

  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}

export function isStoredSetup(value: unknown): value is typeof EMPTY_SETUP {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const setup = value as Partial<typeof EMPTY_SETUP> & { groups?: unknown; paddocks?: unknown };
  return (
    Array.isArray(setup.farms) &&
    // `paddocks` is what installs written before the Locations rename hold.
    (Array.isArray(setup.locations) || Array.isArray(setup.paddocks)) &&
    // `groups` is what installs written before the Labels rename hold. Accept
    // either shape here or their whole setup — farms and medicines included —
    // is rejected as unreadable and silently reset to empty.
    (Array.isArray(setup.labels) || Array.isArray(setup.groups)) &&
    Array.isArray(setup.medicines)
  );
}

export function normalizeStoredSetup(
  setup: typeof EMPTY_SETUP & { groups?: LabelEntity[]; paddocks?: LocationEntity[] },
): typeof EMPTY_SETUP {
  // Locations were called Paddocks before the rename; read whichever key this
  // install holds. The normalized value written back is always `locations`.
  const storedLocations: LocationEntity[] = Array.isArray(setup.locations)
    ? setup.locations
    : Array.isArray(setup.paddocks)
      ? setup.paddocks
      : [];
  // Labels were called Groups before the rename. Read whichever key this
  // install happens to hold; the normalized value written back is always
  // `labels`, so each install migrates once on the first load after updating.
  const storedLabels: LabelEntity[] = Array.isArray(setup.labels)
    ? setup.labels
    : Array.isArray(setup.groups)
      ? setup.groups
      : [];

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

  const locationUids = new Set<string>();
  // Locations carry no area/areaUnit (see LocationEntity) — any left over in
  // older stored data is just inert extra JSON, harmlessly dropped by not
  // being spread through here.
  const locations = storedLocations.map((location) => {
    const storedUid = location.uid?.trim();
    const uid = storedUid && !locationUids.has(storedUid) ? storedUid : createUniqueUuid(locationUids);
    locationUids.add(uid);
    const matchingFarm = farms.find(
      (farm) => farm.uid === location.farmUid || equalsIgnoreCase(farm.name, location.farm),
    );
    return { uid, farmUid: matchingFarm?.uid, name: location.name, farm: location.farm, notes: location.notes };
  });

  const labelUids = new Set<string>();
  // Labels carry no farm/location/species reference (see LabelEntity) — any
  // left over in older stored data is just inert extra JSON, harmlessly
  // dropped by not being spread through here.
  const labels = storedLabels.map((label) => {
    const storedUid = label.uid?.trim();
    const uid = storedUid && !labelUids.has(storedUid) ? storedUid : createUniqueUuid(labelUids);
    labelUids.add(uid);

    return {
      uid,
      name: label.name,
      animals: label.animals,
      notes: label.notes,
    };
  });

  const medicineUids = new Set<string>();
  const medicines = setup.medicines.map((medicine) => {
    const storedUid = medicine.uid?.trim();
    const uid = storedUid && !medicineUids.has(storedUid) ? storedUid : createUniqueUuid(medicineUids);
    medicineUids.add(uid);
    return { ...medicine, uid };
  });

  return { farms, locations, labels, medicines };
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
