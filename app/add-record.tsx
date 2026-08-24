import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Image, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../src/theme/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, AppIconName } from '../src/components/AppIcon';
import DateTimePicker from '../src/components/AppDateTimePicker';
import { AppTopBar } from '../src/components/AppTopBar';
import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { DesignField } from '../src/components/DesignField';
import { FieldClearButton } from '../src/components/FieldClearButton';
import { FieldLabel } from '../src/components/FieldLabel';
import { FloatingActionButton } from '../src/components/FloatingActionButton';
import { InfoModal } from '../src/components/InfoModal';
import { InlineDropdown } from '../src/components/InlineDropdown';
import { RECORD_TYPES, SPECIES_OPTIONS } from '../src/constants/records';
import { FREE_RECORD_LIMIT } from '../src/constants/subscription';
import { useAccount } from '../src/context/AccountContext';
import { getSpeciesThemeByLabel } from '../src/constants/speciesTheme';
import { useAnimals } from '../src/context/AnimalsContext';
import { useRecords } from '../src/context/RecordsContext';
import type { RecordImpactChange } from '../src/context/RecordsContext';
import type { CreateAnimalInput } from '../src/context/AnimalsContext';
import {
  type FarmEntity,
  type MedicineEntity,
  type LocationEntity,
  type SetupSelectionTarget,
  useSetup,
} from '../src/context/SetupContext';
import { useSubscription } from '../src/context/SubscriptionContext';
import { formatCurrencyAmount, formatCurrencyPrefix } from '../src/entities/account';
import type { Animal, AnimalAgeUnit, AnimalSex, AnimalWeightUnit } from '../src/entities/animal';
import type { RecordEntry } from '../src/entities/record';
import { TAB_ALIGNED_FAB_BOTTOM_OFFSET, tokens } from '../src/theme/tokens';
import { formatDateForDisplay, formatDateForStorage, parseStoredDate } from '../src/utils/dateFormat';
import { buildWithdrawalIndex, confirmSaleWithinWithdrawal, latestPerKind } from '../src/utils/withdrawal';
import { filterAccessibleImageUris, persistRecordImage } from '../src/utils/imageStorage';
import { findRecordAnimals, resolveRecordAnimalUids } from '../src/utils/recordAnimals';
import { getStructuredDetailLabels, stripStructuredDetailLines } from '../src/utils/recordNotes';
import {
  resolveAnimalFarmName,
  resolveAnimalLocationName,
  resolveFarmName,
  resolveLocationName,
} from '../src/utils/recordLocations';
import {
  equalsIgnoreCase,
  isValidNonNegativeInteger,
  isValidNonNegativeNumber,
  isValidPositiveNumber,
} from '../src/utils/validation';

const DOSE_UNITS = ['ml', 'mg', 'g', 'tablet(s)', 'bolus', 'sachet', 'dose'] as const;
const WEIGHT_UNITS = ['kg', 'lb'] as const;
const HEALTH_STATUSES = ['Healthy', 'Under Observation', 'Sick', 'Injured', 'Recovering', 'Other'] as const;
const ROUTE_OPTIONS = ['Injection', 'Oral', 'Pour-on', 'Drench', 'Topical', 'Feed', 'Water', 'Other'] as const;
const DISPOSAL_METHOD_OPTIONS = ['Burial', 'Rendering', 'Incineration', 'Collection', 'Other'] as const;
const CAUSE_OF_DEATH_OPTIONS = [
  'Illness',
  'Injury',
  'Predation',
  'Birthing Complications',
  'Old Age',
  'Poisoning',
  'Unknown',
  'Other',
] as const;

/**
 * The notes behind each field's (i), matching the collective Add Record
 * screen's map field for field. Where a field means the same thing on both
 * screens the wording is identical on purpose — a keeper who learns what Cost
 * does on a flock record should not have to re-read it on an animal's.
 */
const FIELD_NOTES: Record<string, { title: string; description: string }> = {
  withdrawal: {
    title: 'Withdrawal periods',
    description:
      'Days after treatment before meat or milk may be sold. The app counts them from this record\u2019s date and flags the animals still inside the period.\n\n' +
      'Leave blank if the product has none.',
  },
  cost: {
    title: 'Cost',
    description: 'Adds to Costs in Reports, kept apart from money spent buying animals.',
  },
  otherTitle: {
    title: 'Title',
    description:
      'Other covers anything the types above do not \u2014 bedding, fencing, a water test. Whatever you type here becomes the record\u2019s name.',
  },
};

export default function AddRecordScreen() {
  const [fieldNote, setFieldNote] = useState<(typeof FIELD_NOTES)[string] | null>(null);
  const showFieldNote = (key: keyof typeof FIELD_NOTES) => () => setFieldNote(FIELD_NOTES[key]);
  const router = useRouter();
  const pathname = usePathname();
  const {
    selectedAnimalIds,
    selectedMotherUid,
    selectedMotherName,
    recordId,
    draftRecord,
  } = useLocalSearchParams<{
    selectedAnimalIds?: string;
    selectedMotherUid?: string;
    selectedMotherName?: string;
    recordId?: string;
    draftRecord?: string;
  }>();
  const { profile } = useAccount();
  const { animals } = useAnimals();
  const {
    addBirthRecord,
    addRecord,
    records,
    updateBirthRecord,
    updateRecord,
    previewUpdateRecordImpact,
    previewDeleteRecordImpact,
    previewAnimalLocationAsOf,
  } = useRecords();
  const {
    farms,
    farmEntities,
    locationEntities,
    medicineEntities,
    pendingSetupSelectionResult,
    beginSetupSelection,
    clearSetupSelectionResult,
  } = useSetup();
  const { isPro } = useSubscription();
  const editingRecord = useMemo(() => (recordId ? records.find((record) => record.id === recordId) ?? null : null), [recordId, records]);
  const isEditing = Boolean(editingRecord);
  const isEditRoute = pathname === '/edit-record';
  const preferredWeightUnit: (typeof WEIGHT_UNITS)[number] = profile.measurementUnits === 'Imperial' ? 'lb' : 'kg';
  const previousPreferredWeightUnit = useRef<(typeof WEIGHT_UNITS)[number]>(preferredWeightUnit);
  const saveInProgress = useRef(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [recordType, setRecordType] = useState<(typeof RECORD_TYPES)[number]>('Movement');
  const [recordTitle, setRecordTitle] = useState('');
  const [medicine, setMedicine] = useState('');
  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState<(typeof WEIGHT_UNITS)[number]>(preferredWeightUnit);
  const [causeOfDeath, setCauseOfDeath] = useState('');
  const [disposalMethod, setDisposalMethod] = useState('');
  const [healthStatus, setHealthStatus] = useState<(typeof HEALTH_STATUSES)[number]>('Healthy');
  const [conditionDiagnosis, setConditionDiagnosis] = useState('');
  const [vetSeen, setVetSeen] = useState<'Yes' | 'No'>('No');
  const [buyer, setBuyer] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [destination, setDestination] = useState('');
  const [seller, setSeller] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sourceFarm, setSourceFarm] = useState('');
  // Carried by Other only: the catch-all record is how a keeper logs any
  // spend that is not buying an animal, so it needs somewhere for the money
  // to go other than the notes, where Reports could never total it.
  const [cost, setCost] = useState('');
  const [motherUid, setMotherUid] = useState('');
  const [motherName, setMotherName] = useState('');
  const [birthTagId, setBirthTagId] = useState('');
  const [birthSpecies, setBirthSpecies] = useState('');
  const [birthBreed, setBirthBreed] = useState('');
  const [birthSex, setBirthSex] = useState<AnimalSex>('female');
  const [birthWeight, setBirthWeight] = useState('');
  const [birthWeightUnit, setBirthWeightUnit] = useState<(typeof WEIGHT_UNITS)[number]>(preferredWeightUnit);
  const [dose, setDose] = useState('12');
  const [doseUnit, setDoseUnit] = useState<(typeof DOSE_UNITS)[number]>('ml');
  const [route, setRoute] = useState<(typeof ROUTE_OPTIONS)[number]>('Injection');
  const [withdrawal, setWithdrawal] = useState('0');
  const [milkWithdrawal, setMilkWithdrawal] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [fromFarm, setFromFarm] = useState('');
  const [fromLocation, setFromLocation] = useState('');
  const [toFarm, setToFarm] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [details, setDetails] = useState('');
  const [chosenAnimalIds, setChosenAnimalIds] = useState<string[]>(
    selectedAnimalIds ? selectedAnimalIds.split(',').filter(Boolean) : [],
  );
  const [showBirthSpeciesPicker, setShowBirthSpeciesPicker] = useState(false);
  const [showExpiryDatePicker, setShowExpiryDatePicker] = useState(false);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [showUpdateImpactConfirm, setShowUpdateImpactConfirm] = useState(false);
  const [updateImpact, setUpdateImpact] = useState<RecordImpactChange[]>([]);
  const pendingUpdatePayloadRef = useRef<Parameters<typeof updateRecord>[1] | null>(null);

  const date = formatDateForDisplay(selectedDate, profile.dateFormat);
  const storedDate = formatDateForStorage(selectedDate);
  const selectedAnimals = animals.filter((animal) => chosenAnimalIds.includes(animal.uid));
  const editingBirthAnimal = useMemo(
    () =>
      editingRecord?.type === 'Birth'
        ? findRecordAnimals(editingRecord, animals)[0] ?? null
        : null,
    [animals, editingRecord],
  );
  const isMedicationRecord = recordType === 'Medication';
  const isVaccinationRecord = recordType === 'Vaccination';
  const isMovementRecord = recordType === 'Movement';
  const isWeightRecord = recordType === 'Weight';
  const isDeathRecord = recordType === 'Death';
  const isBirthRecord = recordType === 'Birth';
  const isHealthCheckRecord = recordType === 'Health Check';
  const isSaleRecord = recordType === 'Sale';
  const isPurchaseRecord = recordType === 'Purchase';
  const isOtherRecord = recordType === 'Other';
  const selectedMother = motherUid ? animals.find((animal) => animal.uid === motherUid) ?? null : null;
  const eligibleMothers = useMemo(
    () =>
      birthSpecies.trim()
        ? animals.filter(
            (animal) => animal.sex === 'female' && equalsIgnoreCase(animal.species, birthSpecies),
          )
        : [],
    [animals, birthSpecies],
  );
  const inheritedMother =
    selectedMother?.sex === 'female' && equalsIgnoreCase(selectedMother.species, birthSpecies)
      ? selectedMother
      : null;
  const inheritedLocation = formatAnimalLocation(inheritedMother, farmEntities, locationEntities);
  const displayedNewbornLocation = isEditing
    ? formatAnimalLocation(editingBirthAnimal, farmEntities, locationEntities)
    : inheritedLocation;
  const currencyCode = profile.currency;
  const currencyPrefix = formatCurrencyPrefix(currencyCode);
  const availableTreatments = useMemo(
    () => medicineEntities.filter((entry) => entry.treatmentType === (isVaccinationRecord ? 'vaccine' : 'medicine')),
    [isVaccinationRecord, medicineEntities],
  );
  // The dropdown works in names, since that is what the field stores; the
  // entry behind the chosen one still carries the dose/route/withdrawal
  // defaults that selecting it fills in.
  const treatmentNames = useMemo(() => availableTreatments.map((entry) => entry.name), [availableTreatments]);
  const treatmentsByName = useMemo(
    () => new Map(availableTreatments.map((entry) => [entry.name, entry])),
    [availableTreatments],
  );
  const fromLocationOptions = useMemo(
    () =>
      locationEntities
        .filter((location) => !fromFarm.trim() || equalsIgnoreCase(location.farm, fromFarm))
        .map((location) => location.name),
    [fromFarm, locationEntities],
  );
  const toLocationOptions = useMemo(
    () =>
      locationEntities
        .filter((location) => !toFarm.trim() || equalsIgnoreCase(location.farm, toFarm))
        .map((location) => location.name),
    [locationEntities, toFarm],
  );

  useEffect(() => {
    if (!isEditing && !draftRecord) {
      setWeightUnit((current) =>
        current === previousPreferredWeightUnit.current ? preferredWeightUnit : current,
      );
      setBirthWeightUnit((current) =>
        current === previousPreferredWeightUnit.current ? preferredWeightUnit : current,
      );
    }

    previousPreferredWeightUnit.current = preferredWeightUnit;
  }, [draftRecord, isEditing, preferredWeightUnit]);

  useEffect(() => {
    if (selectedAnimalIds !== undefined) {
      setChosenAnimalIds(selectedAnimalIds.split(',').filter(Boolean));
    }
  }, [selectedAnimalIds]);

  useEffect(() => {
    if (selectedMotherUid) {
      const mother = animals.find((animal) => animal.uid === selectedMotherUid);
      setMotherUid(selectedMotherUid);
      setMotherName(mother?.name ?? selectedMotherName ?? '');
    } else if (selectedMotherName) {
      setMotherName(selectedMotherName);
    }
  }, [animals, selectedMotherName, selectedMotherUid]);

  useEffect(() => {
    if (
      selectedMother &&
      birthSpecies.trim() &&
      (selectedMother.sex !== 'female' || !equalsIgnoreCase(selectedMother.species, birthSpecies))
    ) {
      setMotherUid('');
      setMotherName('');
    }
  }, [birthSpecies, selectedMother]);

  useEffect(() => {
    if (!draftRecord) {
      return;
    }

    const draft = parseDraftRecordState(draftRecord);

    if (!draft) {
      return;
    }

    setSelectedDate(new Date(draft.selectedDateIso));
    setRecordType(draft.recordType);
    setRecordTitle(draft.recordTitle);
    setMedicine(draft.medicine);
    setWeight(draft.weight);
    setWeightUnit(draft.weightUnit);
    setCauseOfDeath(draft.causeOfDeath);
    setDisposalMethod(draft.disposalMethod);
    setHealthStatus(draft.healthStatus);
    setConditionDiagnosis(draft.conditionDiagnosis);
    setVetSeen(draft.vetSeen);
    setBuyer(draft.buyer);
    setSalePrice(draft.salePrice);
    setDestination(draft.destination);
    setSeller(draft.seller);
    setPurchasePrice(draft.purchasePrice);
    setSourceFarm(draft.sourceFarm);
    setCost(draft.cost);
    setMotherUid(selectedMotherUid ?? draft.motherUid ?? '');
    setMotherName(selectedMotherName ?? draft.motherName);
    setBirthTagId(draft.birthTagId);
    setBirthSpecies(draft.birthSpecies);
    setBirthBreed(draft.birthBreed);
    setBirthSex(draft.birthSex);
    setBirthWeight(draft.birthWeight);
    setBirthWeightUnit(draft.birthWeightUnit);
    setDose(draft.dose);
    setDoseUnit(draft.doseUnit);
    setRoute(draft.route);
    setWithdrawal(draft.withdrawal);
    setMilkWithdrawal(draft.milkWithdrawal);
    setBatchNumber(draft.batchNumber);
    setExpiryDate(draft.expiryDate);
    setFromFarm(draft.fromFarm);
    setFromLocation(draft.fromLocation);
    setToFarm(draft.toFarm);
    setToLocation(draft.toLocation);
    setDetails(draft.details);
    setChosenAnimalIds(
      selectedAnimalIds !== undefined
        ? selectedAnimalIds.split(',').filter(Boolean)
        : draft.chosenAnimalIds,
    );
    setImageUris(filterAccessibleImageUris(draft.imageUris));
  }, [draftRecord, selectedAnimalIds, selectedMotherName, selectedMotherUid]);

  useEffect(() => {
    if (!editingRecord || draftRecord) {
      return;
    }

    const formState = buildFormStateFromRecord(editingRecord, animals, farmEntities, locationEntities);
    setSelectedDate(formState.selectedDate);
    setRecordType(formState.recordType);
    setRecordTitle(formState.recordTitle);
    setMedicine(formState.medicine);
    setWeight(formState.weight);
    setWeightUnit(formState.weightUnit);
    setCauseOfDeath(formState.causeOfDeath);
    setDisposalMethod(formState.disposalMethod);
    setHealthStatus(formState.healthStatus);
    setConditionDiagnosis(formState.conditionDiagnosis);
    setVetSeen(formState.vetSeen);
    setBuyer(formState.buyer);
    setSalePrice(formState.salePrice);
    setDestination(formState.destination);
    setSeller(formState.seller);
    setPurchasePrice(formState.purchasePrice);
    setSourceFarm(formState.sourceFarm);
    setCost(formState.cost);
    setMotherUid(formState.motherUid);
    setMotherName(formState.motherName);
    setBirthTagId(formState.birthTagId);
    setBirthSpecies(formState.birthSpecies);
    setBirthBreed(formState.birthBreed);
    setBirthSex(formState.birthSex);
    setBirthWeight(formState.birthWeight);
    setBirthWeightUnit(formState.birthWeightUnit);
    setDose(formState.dose);
    setDoseUnit(formState.doseUnit);
    setRoute(formState.route);
    setWithdrawal(formState.withdrawal);
    setMilkWithdrawal(formState.milkWithdrawal);
    setBatchNumber(formState.batchNumber);
    setExpiryDate(formState.expiryDate);
    setFromFarm(formState.fromFarm);
    setFromLocation(formState.fromLocation);
    setToFarm(formState.toFarm);
    setToLocation(formState.toLocation);
    setDetails(formState.details);
    setChosenAnimalIds(formState.chosenAnimalIds);
    setImageUris(filterAccessibleImageUris(formState.imageUris));
  }, [animals, draftRecord, editingRecord, farmEntities, locationEntities]);

  useEffect(() => {
    if (!pendingSetupSelectionResult) {
      return;
    }

    switch (pendingSetupSelectionResult.target) {
      case 'fromFarm':
        setFromFarm(pendingSetupSelectionResult.value);
        setFromLocation('');
        break;
      case 'toFarm':
        setToFarm(pendingSetupSelectionResult.value);
        setToLocation('');
        break;
      case 'fromLocation':
        setFromLocation(pendingSetupSelectionResult.value);
        break;
      case 'toLocation':
        setToLocation(pendingSetupSelectionResult.value);
        break;
    }

    clearSetupSelectionResult();
  }, [clearSetupSelectionResult, pendingSetupSelectionResult]);

  // A farm with exactly one location has no real choice to make, so fill it in
  // — still fully editable/clearable afterward if that's not what the user
  // wants. Changing farm drops a location belonging to the old one.
  const selectMovementFarm = (
    option: string,
    current: string,
    setFarm: (value: string) => void,
    setLocation: (value: string) => void,
  ) => {
    if (!equalsIgnoreCase(option, current)) {
      const matchingLocations = locationEntities.filter((entry) => equalsIgnoreCase(entry.farm, option));
      setLocation(matchingLocations.length === 1 ? matchingLocations[0].name : '');
    }

    setFarm(option);
  };

  // Picking a location before its farm (the location list is unfiltered until
  // a farm is chosen) shouldn't leave the farm blank or mismatched — fill it in
  // to match.
  const selectMovementLocation = (
    option: string,
    currentFarm: string,
    setFarm: (value: string) => void,
    setLocation: (value: string) => void,
  ) => {
    const matchedFarm = locationEntities.find((entry) => equalsIgnoreCase(entry.name, option))?.farm;

    if (matchedFarm && !equalsIgnoreCase(matchedFarm, currentFarm)) {
      setFarm(matchedFarm);
    }

    setLocation(option);
  };

  const showMissingRequiredFields = (fields: string[]) => {
    Alert.alert(
      'Required fields missing',
      `Please complete the required field${fields.length > 1 ? 's' : ''}: ${fields.join(', ')}.`,
    );
  };

  const handleSave = async () => {
    if (saveInProgress.current) {
      return;
    }

    // Applies to every record type — the native picker already clamps to
    // today via maximumDate, but that's UI-level only; this is the
    // authoritative check that also catches dates that reached this state
    // some other way (e.g. an already future-dated record loaded for edit).
    if (storedDate > formatDateForStorage(new Date())) {
      Alert.alert('Date is in the future', 'Choose a date that is today or earlier.');
      return;
    }

    const missingFields: string[] = [];

    // Other is the only type that may stand on its own: it is where a keeper
    // logs something that happened on the farm rather than to an animal — a
    // feed delivery, bedding, a fencing repair. Every other type describes an
    // event that happened *to* something, so it still needs one.
    if (!isBirthRecord && !isOtherRecord && chosenAnimalIds.length === 0) {
      missingFields.push('Animal(s)');
    }

    if (isBirthRecord) {
      if (!birthTagId.trim()) {
        missingFields.push('Tag / ID');
      }

      if (!birthSpecies.trim()) {
        missingFields.push('Species');
      }
    }

    // Dose is deliberately not required, matching the collective screen: a
    // treatment given in the water or the feed has no per-animal figure the
    // keeper can honestly state. What was used is the part that must be there.
    if (isMedicationRecord && !medicine.trim()) {
      missingFields.push('Medicine');
    }

    if (isVaccinationRecord && !medicine.trim()) {
      missingFields.push('Vaccine');
    }

    if (isMovementRecord) {
      if (!fromFarm.trim()) {
        missingFields.push('From Farm');
      }

      if (!toFarm.trim()) {
        missingFields.push('To Farm');
      }
    }

    if (isWeightRecord && !weight.trim()) {
      missingFields.push('Weight');
    }

    if (isSaleRecord && !salePrice.trim()) {
      missingFields.push('Sale Price');
    }

    if (isPurchaseRecord && !purchasePrice.trim()) {
      missingFields.push('Purchase Price');
    }

    if (isOtherRecord && !recordTitle.trim()) {
      missingFields.push('Title');
    }

    if (missingFields.length > 0) {
      showMissingRequiredFields([...new Set(missingFields)]);
      return;
    }

    const invalidFields: string[] = [];

    if ((isMedicationRecord || isVaccinationRecord) && dose.trim() && !isValidPositiveNumber(dose)) {
      invalidFields.push('Dose (number greater than 0)');
    }

    if ((isMedicationRecord || isVaccinationRecord) && withdrawal.trim() && !isValidNonNegativeInteger(withdrawal)) {
      invalidFields.push('Meat Withdrawal (whole number of days, 0 or greater)');
    }

    if ((isMedicationRecord || isVaccinationRecord) && milkWithdrawal.trim() && !isValidNonNegativeInteger(milkWithdrawal)) {
      invalidFields.push('Milk Withdrawal (whole number of days, 0 or greater)');
    }

    if (isSaleRecord && salePrice.trim() && !isValidNonNegativeNumber(salePrice)) {
      invalidFields.push('Sale Price (number, 0 or greater)');
    }

    if (isPurchaseRecord && purchasePrice.trim() && !isValidNonNegativeNumber(purchasePrice)) {
      invalidFields.push('Purchase Price (number, 0 or greater)');
    }

    if (isWeightRecord && weight.trim() && !isValidPositiveNumber(weight)) {
      invalidFields.push('Weight (number greater than 0)');
    }

    if (isBirthRecord && birthWeight.trim() && !isValidPositiveNumber(birthWeight)) {
      invalidFields.push('Birth Weight (number greater than 0)');
    }

    if (invalidFields.length > 0) {
      Alert.alert(
        'Check your entries',
        `The following field${invalidFields.length > 1 ? 's need' : ' needs'} a valid value: ${invalidFields.join('; ')}.`,
      );
      return;
    }

    if (
      isMovementRecord &&
      equalsIgnoreCase(fromFarm, toFarm) &&
      equalsIgnoreCase(fromLocation, toLocation)
    ) {
      Alert.alert('Location unchanged', 'Choose a different destination for this Movement record.');
      return;
    }

    if (
      isMovementRecord &&
      ((fromLocation.trim() &&
        !locationEntities.some(
          (entry) => equalsIgnoreCase(entry.name, fromLocation) && equalsIgnoreCase(entry.farm, fromFarm),
        )) ||
        (toLocation.trim() &&
          !locationEntities.some(
            (entry) => equalsIgnoreCase(entry.name, toLocation) && equalsIgnoreCase(entry.farm, toFarm),
          )))
    ) {
      Alert.alert('Location does not match farm', 'Select locations belonging to their chosen farms.');
      return;
    }

    if (!isEditing) {
      const animalsWithInvalidStatus = selectedAnimals.filter((animal) => {
        // Movement is exempt: an animal that's since been Sold or marked
        // Deceased can still get a backdated Movement logged for a date
        // while it was genuinely still Active and on the farm.
        if (
          isDeathRecord ||
          isSaleRecord ||
          isWeightRecord ||
          isVaccinationRecord ||
          isMedicationRecord ||
          isHealthCheckRecord
        ) {
          return animal.status !== 'Active';
        }
        if (isPurchaseRecord) {
          return animal.status === 'Deceased';
        }
        return false;
      });

      if (animalsWithInvalidStatus.length > 0) {
        Alert.alert(
          'Animal status does not allow this record',
          `${formatAnimalReferences(animalsWithInvalidStatus)} cannot be used for this ${recordType} record in its current status.`,
        );
        return;
      }
    }

    if (
      isBirthRecord &&
      animals.some(
        (animal) =>
          animal.uid !== editingBirthAnimal?.uid &&
          equalsIgnoreCase(animal.id, birthTagId),
      )
    ) {
      Alert.alert(
        'Animal ID already in use',
        'Each animal needs a unique ID / tag. Enter a different tag for the newborn.',
      );
      return;
    }

    // inheritedMother is null whenever the selected mother no longer
    // qualifies (wrong sex/species) — this can only happen when editing an
    // older Birth record whose referenced mother animal was itself edited
    // afterwards (e.g. its sex or species was corrected). The save payload
    // silently drops a mismatched mother rather than saving something wrong,
    // so surface that instead of letting it disappear without explanation.
    if (isBirthRecord && motherUid && !inheritedMother) {
      Alert.alert(
        'Mother no longer matches',
        'The selected mother is no longer a female of the same species as the newborn. Please select a different mother.',
      );
      return;
    }

    if (isMovementRecord) {
      // Validate the "From" location against where the animal actually was
      // as of this record's own date — not its current/latest location —
      // so a movement can be backdated into the middle of existing history
      // without being rejected against a location it hadn't reached yet
      // (and, when editing, without checking against this same record's
      // own pre-edit effect).
      const animalsOutsideFromLocation = selectedAnimals.filter((animal) => {
        const locationAsOf = previewAnimalLocationAsOf(
          animal.uid,
          storedDate,
          isEditing && editingRecord ? editingRecord.id : undefined,
        );

        if (locationAsOf.status !== 'found') {
          // No documented prior Movement to verify against — either this
          // animal has never been moved, or none of its movements predate
          // this record. Only a real, dated Movement record is trusted
          // enough to block on; anything else (including the animal's own
          // Add Animal farm field) is a guess, not a fact, so don't block.
          return false;
        }

        // No location on file for the animal isn't a mismatch — it just means
        // its location was never recorded, not that it's known to be elsewhere.
        return (
          !equalsIgnoreCase(locationAsOf.farm, fromFarm) ||
          (fromLocation.trim().length > 0 &&
            locationAsOf.location.trim().length > 0 &&
            !equalsIgnoreCase(locationAsOf.location, fromLocation))
        );
      });

      if (animalsOutsideFromLocation.length > 0) {
        Alert.alert(
          'Animals at a different location',
          `${formatAnimalReferences(animalsOutsideFromLocation)} ${
            animalsOutsideFromLocation.length === 1 ? "wasn't" : "weren't"
          } at ${formatMovementPlace(fromFarm, fromLocation)} on ${date}. Remove ${
            animalsOutsideFromLocation.length === 1 ? 'it' : 'them'
          } or change the From location.`,
        );
        return;
      }
    }

    const movementTitle = [formatMovementPlace(fromFarm, fromLocation), formatMovementPlace(toFarm, toLocation)]
      .filter(Boolean)
      .join(' to ');
    // Stored alongside the frozen fromFarm/toFarm/fromLocation/toLocation text
    // so a later rename in Setup can be resolved live for display (see
    // resolveFarmName/resolveLocationName) instead of the record being stuck
    // showing whatever name was current when it was saved.
    const findFarmUid = (name: string) => farmEntities.find((entry) => equalsIgnoreCase(entry.name, name))?.uid;
    const findLocationUid = (name: string) => locationEntities.find((entry) => equalsIgnoreCase(entry.name, name))?.uid;
    const resolvedMotherName = motherUid
      ? inheritedMother?.name ?? ''
      : motherName.trim();
    const deathDetails = [disposalMethod.trim() ? `Disposal Method: ${disposalMethod.trim()}` : '', details.trim()]
      .filter(Boolean)
      .join('\n\n');
    const birthDetails = [
      resolvedMotherName ? `Mother: ${resolvedMotherName}` : '',
      `Tag / ID: ${birthTagId.trim()}`,
      `Species: ${birthSpecies.trim()}`,
      `Breed: ${birthBreed.trim()}`,
      `Sex: ${birthSex === 'female' ? 'Female' : 'Male'}`,
      birthWeight.trim() ? `Weight: ${birthWeight.trim()} ${birthWeightUnit}` : '',
      details.trim(),
    ]
      .filter(Boolean)
      .join('\n\n');
    const healthCheckDetails = [
      `Condition / Diagnosis: ${conditionDiagnosis.trim()}`,
      `Vet Seen: ${vetSeen}`,
      details.trim(),
    ]
      .filter(Boolean)
      .join('\n\n');
    // Judged against the sale's own date, not today, so a backdated sale is
    // measured against the period as it stood then. The record being edited is
    // left out of the check — a treatment cannot put itself in withdrawal.
    if (isSaleRecord) {
      const saleDate = parseStoredDate(storedDate) ?? new Date();
      const index = buildWithdrawalIndex(
        records.filter((record) => record.id !== editingRecord?.id),
        animals,
        saleDate,
      );
      const stillWithdrawn = selectedAnimals.filter(
        (animal) => (index.byAnimalUid.get(animal.uid) ?? []).length > 0,
      );

      if (stillWithdrawn.length > 0) {
        // Selling several at once: the furthest-out date of each kind is the
        // one that governs the group.
        const proceed = await confirmSaleWithinWithdrawal(
          formatAnimalReferences(stillWithdrawn),
          latestPerKind(stillWithdrawn.flatMap((animal) => index.byAnimalUid.get(animal.uid) ?? [])),
          profile.dateFormat,
        );

        if (!proceed) {
          return;
        }
      }
    }

    const saleDetails = [
      buyer.trim() ? `Buyer: ${buyer.trim()}` : '',
      salePrice.trim() ? `Sale Price: ${formatCurrencyAmount(salePrice.trim(), currencyCode)}` : '',
      details.trim(),
    ]
      .filter(Boolean)
      .join('\n\n');
    const purchaseDetails = [
      seller.trim() ? `Seller: ${seller.trim()}` : '',
      purchasePrice.trim() ? `Purchase Price: ${formatCurrencyAmount(purchasePrice.trim(), currencyCode)}` : '',
      details.trim(),
    ]
      .filter(Boolean)
      .join('\n\n');
    const payload = {
      date: storedDate,
      animal: isBirthRecord
        ? birthTagId.trim()
        : selectedAnimals.map((animal) => animal.name.trim()).join(', '),
      animalTag: isBirthRecord
        ? birthTagId.trim()
        : selectedAnimals.map((animal) => animal.id.trim()).join(', '),
      animalIds: isBirthRecord ? undefined : selectedAnimals.map((animal) => animal.id),
      animalUids: isBirthRecord ? undefined : selectedAnimals.map((animal) => animal.uid),
      species: isBirthRecord ? birthSpecies.trim() : getCombinedSpecies(selectedAnimals),
      type: recordType,
      title: isMedicationRecord || isVaccinationRecord
        ? `${recordType}: ${medicine.trim()}`.trim()
        : isMovementRecord
          ? `${recordType}: ${movementTitle}`.trim()
        : isWeightRecord
          ? `${recordType}: ${weight.trim()} ${weightUnit}`.trim()
        : isDeathRecord
          ? causeOfDeath.trim()
            ? `${recordType}: ${causeOfDeath.trim()}`
            : recordType
        : isBirthRecord
          ? `${recordType}: ${birthTagId.trim()}`.trim()
        : isHealthCheckRecord
          ? `${recordType}: ${healthStatus}`.trim()
        : isSaleRecord
          ? `${recordType}: ${buyer.trim()}`.trim()
        : isPurchaseRecord
          ? `${recordType}: ${seller.trim()}`.trim()
        : `${recordType}: ${recordTitle.trim()}`.trim(),
      details: isDeathRecord
        ? deathDetails
        : isBirthRecord
          ? birthDetails
          : isHealthCheckRecord
            ? healthCheckDetails
            : isSaleRecord
              ? saleDetails
              : isPurchaseRecord
                ? purchaseDetails
                : details.trim(),
      medicine: isMedicationRecord || isVaccinationRecord ? medicine.trim() : undefined,
      dose: isMedicationRecord || isVaccinationRecord ? dose.trim() : undefined,
      doseUnit: isMedicationRecord || isVaccinationRecord ? doseUnit : undefined,
      route: isMedicationRecord || isVaccinationRecord ? route : undefined,
      withdrawal: isMedicationRecord || isVaccinationRecord ? withdrawal.trim() : undefined,
      milkWithdrawal: isMedicationRecord || isVaccinationRecord ? milkWithdrawal.trim() : undefined,
      batchNumber: isMedicationRecord || isVaccinationRecord ? batchNumber.trim() : undefined,
      expiryDate: isMedicationRecord || isVaccinationRecord ? expiryDate.trim() : undefined,
      imageUris: imageUris.length > 0 ? imageUris : undefined,
      recordTitle: recordTitle.trim() || undefined,
      weight: isWeightRecord ? weight.trim() : undefined,
      weightUnit: isWeightRecord ? weightUnit : undefined,
      causeOfDeath: isDeathRecord ? causeOfDeath.trim() : undefined,
      disposalMethod: isDeathRecord ? disposalMethod.trim() : undefined,
      healthStatus: isHealthCheckRecord ? healthStatus : undefined,
      conditionDiagnosis: isHealthCheckRecord ? conditionDiagnosis.trim() : undefined,
      vetSeen: isHealthCheckRecord ? vetSeen : undefined,
      buyer: isSaleRecord ? buyer.trim() : undefined,
      salePrice: isSaleRecord ? salePrice.trim() : undefined,
      seller: isPurchaseRecord ? seller.trim() : undefined,
      purchasePrice: isPurchaseRecord ? purchasePrice.trim() : undefined,
      cost: isOtherRecord ? cost.trim() || undefined : undefined,
      currencyCode: isSaleRecord || isPurchaseRecord || (isOtherRecord && cost.trim()) ? currencyCode : undefined,
      motherUid: isBirthRecord ? inheritedMother?.uid : undefined,
      motherName: isBirthRecord ? resolvedMotherName : undefined,
      birthTagId: isBirthRecord ? birthTagId.trim() : undefined,
      birthSpecies: isBirthRecord ? birthSpecies.trim() : undefined,
      birthBreed: isBirthRecord ? birthBreed.trim() : undefined,
      birthSex: isBirthRecord ? birthSex : undefined,
      birthWeight: isBirthRecord ? birthWeight.trim() : undefined,
      birthWeightUnit: isBirthRecord ? birthWeightUnit : undefined,
      fromFarm: isMovementRecord ? fromFarm.trim() || undefined : undefined,
      fromLocation: isMovementRecord ? fromLocation.trim() || undefined : undefined,
      toFarm: isMovementRecord ? toFarm.trim() : undefined,
      toLocation: isMovementRecord ? toLocation.trim() : undefined,
      fromFarmUid: isMovementRecord ? findFarmUid(fromFarm) : undefined,
      fromLocationUid: isMovementRecord ? findLocationUid(fromLocation) : undefined,
      toFarmUid: isMovementRecord ? findFarmUid(toFarm) : undefined,
      toLocationUid: isMovementRecord ? findLocationUid(toLocation) : undefined,
    };

    const birthAnimalInput = isBirthRecord
      ? buildBirthAnimalInput({
          existingAnimal: editingBirthAnimal,
          birthTagId,
          birthSpecies,
          birthBreed,
          birthSex,
          birthWeight,
          birthWeightUnit,
          storedDate,
          mother: inheritedMother,
          motherName: resolvedMotherName,
        })
      : null;

    if (isEditing && editingRecord) {
      saveInProgress.current = true;

      if (isBirthRecord) {
        if (!editingBirthAnimal || !birthAnimalInput) {
          saveInProgress.current = false;
          Alert.alert(
            'Newborn animal not found',
            'This older Birth record is not linked to an animal. The record was not changed to avoid updating the wrong animal.',
          );
          return;
        }

        const result = await updateBirthRecord(
          editingRecord.id,
          payload,
          editingBirthAnimal.uid,
          birthAnimalInput,
        );

        if (!result.ok) {
          saveInProgress.current = false;
          showBirthSaveError(result.reason);
          return;
        }
      } else {
        const impact = previewUpdateRecordImpact(editingRecord.id, payload);

        if (impact.length > 0) {
          pendingUpdatePayloadRef.current = payload;
          setUpdateImpact(impact);
          setShowUpdateImpactConfirm(true);
          saveInProgress.current = false;
          return;
        }

        const result = await updateRecord(editingRecord.id, payload);

        if (!result.ok) {
          saveInProgress.current = false;
          showRecordSaveError();
          return;
        }
      }

      // Edit is only ever reached by pushing from View Record, which is
      // still sitting underneath this screen in the stack — go back to it
      // rather than pushing/replacing with a fresh instance, or repeated
      // View → Edit → Save cycles stack up an extra View Record entry each
      // time (RecordsContext's state update means the existing screen below
      // already reflects the edit once we land back on it).
      router.back();
      return;
    }

    if (!isPro && records.length >= FREE_RECORD_LIMIT) {
      router.push({
        pathname: '/upgrade-to-pro',
        params: { limitType: 'records' },
      });
      return;
    }

    saveInProgress.current = true;
    let newRecordId: string;

    if (isBirthRecord && birthAnimalInput) {
      const result = await addBirthRecord(payload, birthAnimalInput);

      if (!result.ok) {
        saveInProgress.current = false;
        showBirthSaveError(result.reason);
        return;
      }

      newRecordId = result.record.id;
    } else {
      const result = await addRecord(payload);

      if (!result.ok) {
        saveInProgress.current = false;
        showRecordSaveError();
        return;
      }

      if (!result.record) {
        saveInProgress.current = false;
        showRecordSaveError();
        return;
      }

      newRecordId = result.record.id;
    }

    router.push({
      pathname: '/(tabs)/records',
      params: {
        saveReveal: Date.now().toString(),
        saveTarget: 'records',
        newRecordId,
      },
    });
  };

  const draftRecordState = serializeDraftRecordState({
    selectedDateIso: selectedDate.toISOString(),
    recordType,
    recordTitle,
    medicine,
    weight,
    weightUnit,
    causeOfDeath,
    disposalMethod,
    healthStatus,
    conditionDiagnosis,
    vetSeen,
    buyer,
    salePrice,
    destination,
    seller,
    purchasePrice,
    sourceFarm,
    cost,
    motherUid,
    motherName: selectedMother?.name ?? motherName,
    birthTagId,
    birthSpecies,
    birthBreed,
    birthSex,
    birthWeight,
    birthWeightUnit,
    dose,
    doseUnit,
    route,
    withdrawal,
    milkWithdrawal,
    batchNumber,
    expiryDate,
    fromFarm,
    fromLocation,
    toFarm,
    toLocation,
    details,
    chosenAnimalIds,
    imageUris,
  });

  const handleTreatmentNameSelect = (name: string) => {
    const entry = treatmentsByName.get(name);

    if (entry) {
      handleTreatmentSelect(entry);
      return;
    }

    setMedicine(name);
  };

  const handleTreatmentSelect = (entry: MedicineEntity) => {
    setMedicine(entry.name);
    if (entry.defaultDose.trim()) {
      setDose(entry.defaultDose);
    }
    if (entry.doseUnit.trim() && DOSE_UNITS.includes(entry.doseUnit as (typeof DOSE_UNITS)[number])) {
      setDoseUnit(entry.doseUnit as (typeof DOSE_UNITS)[number]);
    }
    if (entry.defaultRoute.trim() && ROUTE_OPTIONS.includes(entry.defaultRoute as (typeof ROUTE_OPTIONS)[number])) {
      setRoute(entry.defaultRoute as (typeof ROUTE_OPTIONS)[number]);
    }

    // Each figure from its own field: falling back from one to the other would
    // put a milk figure under a meat label.
    if (entry.meatWithdrawalPeriod.trim()) {
      setWithdrawal(entry.meatWithdrawalPeriod);
    }
    if (entry.milkWithdrawalPeriod.trim()) {
      setMilkWithdrawal(entry.milkWithdrawalPeriod);
    }

    if (entry.batchNumber?.trim()) {
      setBatchNumber(entry.batchNumber);
    }
    if (entry.expiryDate?.trim()) {
      setExpiryDate(entry.expiryDate);
    }
  };

  const cancelUpdateImpact = () => {
    pendingUpdatePayloadRef.current = null;
    setUpdateImpact([]);
    setShowUpdateImpactConfirm(false);
  };

  const confirmUpdateImpact = async () => {
    if (!editingRecord || !pendingUpdatePayloadRef.current) {
      return;
    }

    const payload = pendingUpdatePayloadRef.current;
    setShowUpdateImpactConfirm(false);
    saveInProgress.current = true;

    const result = await updateRecord(editingRecord.id, payload);
    pendingUpdatePayloadRef.current = null;
    setUpdateImpact([]);

    if (!result.ok) {
      saveInProgress.current = false;
      showRecordSaveError();
      return;
    }

    router.replace({ pathname: '/view-record', params: { recordId: editingRecord.id } });
  };

  const handleDateChange = (event: DateTimePickerEvent, nextDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }

    if (event.type === 'dismissed' || !nextDate) {
      return;
    }

    // maximumDate on the native picker should already prevent this, but
    // clamp defensively — some Android OEM picker builds have been known to
    // ignore it.
    const now = new Date();
    setSelectedDate(nextDate > now ? now : nextDate);
  };

  const handleExpiryDateChange = (event: DateTimePickerEvent, nextDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowExpiryDatePicker(false);
    }

    if (event.type === 'dismissed' || !nextDate) {
      return;
    }

    setExpiryDate(formatDateForStorage(nextDate));
  };

  const openExpiryDatePicker = () => {
    Keyboard.dismiss();
    setShowExpiryDatePicker(true);
  };

  const openSetupScreen = (
    nextPathname: '/setup-farms' | '/setup-locations',
    nextTarget: SetupSelectionTarget,
  ) => {
    beginSetupSelection(nextTarget);
    router.push({
      pathname: nextPathname,
      params: {},
    });
  };

  const openMedicinesScreen = () => {
    router.push({
      pathname: '/setup-medicines',
      params: { treatmentType: isVaccinationRecord ? 'vaccine' : 'medicine' },
    });
  };

  const openAddAnimalScreen = () => {
    router.push({
      pathname: '/add-animal',
      params: {
        returnToRecordSelector: '1',
        recordSelectorSelectedAnimalIds: chosenAnimalIds.join(','),
        ...(recordId ? { recordSelectorRecordId: recordId } : {}),
        recordSelectorDraftRecord: draftRecordState,
        ...(recordType ? { recordSelectorRecordType: recordType } : {}),
        ...(isMovementRecord && fromFarm.trim() ? { recordSelectorFromFarm: fromFarm.trim() } : {}),
        ...(isMovementRecord && fromLocation.trim() ? { recordSelectorFromLocation: fromLocation.trim() } : {}),
      },
    });
  };

  /**
   * Clearing the treatment clears what it filled in with it — leaving a
   * cleared vaccine's dose and withdrawal behind would quietly attach one
   * product's figures to another.
   */
  const clearTreatment = () => {
    setMedicine('');
    setDose('');
    setDoseUnit('ml');
    setRoute('Injection');
    setWithdrawal('');
    setMilkWithdrawal('');
    setBatchNumber('');
    setExpiryDate('');
  };

  const handleAddImages = async () => {
    if (imageUris.length >= 1) {
      Alert.alert('Image limit reached', 'You can attach only 1 image.');
      return;
    }

    // No permission request before launching. launchImageLibraryAsync presents
    // the system photo picker, which runs out of process and hands back only
    // the chosen image — the app never gets library access, so none is needed
    // (Expo SDK 57: "No permissions request is necessary for launching the
    // image library"). Asking anyway cost an async round-trip before the picker
    // could even start opening, and put a permission dialog in front of the
    // very first photo. Worse, a user who had denied library access was refused
    // outright here despite the picker working perfectly well without it.
    //
    // The documented exception is videos on iOS; these pickers are images only.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
      allowsMultipleSelection: false,
      selectionLimit: 1,
    });

    if (result.canceled) {
      return;
    }

    const nextUri = result.assets[0]?.uri;

    if (!nextUri) {
      return;
    }

    try {
      const storedUri = await persistRecordImage(nextUri);
      setImageUris([storedUri]);
    } catch {
      Alert.alert('Image unavailable', 'The selected image could not be saved. Please choose it again.');
    }
  };

  const handleRemoveImage = (uri: string) => {
    setImageUris((current) => current.filter((item) => item !== uri));
  };

  return (
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        // Names which of the two near-identical Add Record screens this is:
        // their type lists differ only by details like Death vs Deaths, so
        // nothing else says which branch of the speed dial you took.
        title={`${isEditing ? (isEditRoute ? 'Edit' : 'View') : 'Add'} Animal Record`}
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
        // Deleting lives on View Record's three-dot menu, the same place an
        // animal's and a herd's does — not here.
        actions={[]}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.typeRow}>
          {RECORD_TYPES.map((type) => {
            const active = recordType === type;

            return (
              <Pressable
                key={type}
                accessibilityLabel={type}
                accessibilityRole="button"
                accessibilityState={{ disabled: isEditing && !active }}
                disabled={isEditing && !active}
                onPress={() => setRecordType(type)}
                style={[
                  styles.typeChip,
                  active ? styles.typeChipActive : styles.typeChipIdle,
                  isEditing && !active && styles.typeChipDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    active ? styles.typeChipTextActive : styles.typeChipTextIdle,
                  ]}
                >
                  {type}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.formCard}>
          <View style={styles.block}>
            <Text style={styles.label}>Date *</Text>
            <Pressable
              accessibilityLabel="Select date"
              accessibilityRole="button"
              onPress={() => setShowDatePicker(true)}
              style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
            >
              <Text style={styles.dateValue}>{date}</Text>
              <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
            </Pressable>
          </View>
          {!isBirthRecord ? (
            <>
            <View style={styles.block}>
              <FieldLabel label={isOtherRecord ? 'Animal(s)' : 'Animal(s) *'} addAccessibilityLabel="Add animal" onAddPress={openAddAnimalScreen} />
              <View style={styles.clearableField}>
              <Pressable
                accessibilityLabel="Select animal"
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/select-record-animal',
                    params: {
                      selectedAnimalIds: chosenAnimalIds.join(','),
                      recordType,
                      ...(isMovementRecord && fromFarm.trim() ? { fromFarm: fromFarm.trim() } : {}),
                      ...(isMovementRecord && fromLocation.trim() ? { fromLocation: fromLocation.trim() } : {}),
                      ...(isMovementRecord ? { recordDate: storedDate } : {}),
                      ...(recordId ? { recordId } : {}),
                      draftRecord: draftRecordState,
                    },
                  })}
                style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
              >
                <Text
                  style={[
                    styles.dateValue,
                    selectedAnimals.length === 0 && styles.placeholderValue,
                    selectedAnimals.length > 0 && styles.clearableFieldValue,
                  ]}
                >
                  {animals.length === 0
                    ? 'No animals available'
                    : selectedAnimals.length === 0
                      ? isOtherRecord
                        ? 'Optional — leave blank for a farm-wide record'
                        : `${animals.length} ${animals.length === 1 ? 'animal' : 'animals'} available`
                    : selectedAnimals.length === 1
                      ? (selectedAnimals[0].name.trim()
                          ? `${selectedAnimals[0].name.trim()} (${selectedAnimals[0].id})`
                          : selectedAnimals[0].id)
                      : `${selectedAnimals.length} animals selected`}
                </Text>
                <View style={styles.fieldChevron}>
                  <AppIcon name="chevron-right" size={12} color="#EFEFEF" />
                </View>
              </Pressable>
                {selectedAnimals.length > 0 ? (
                  <FieldClearButton
                    accessibilityLabel="Clear selected animals"
                    onPress={() => setChosenAnimalIds([])}
                    style={styles.customFieldClearButton}
                  />
                ) : null}
              </View>
              {selectedAnimals.length > 1 ? (
                <Text style={styles.selectionSummary}>
                  {selectedAnimals.map((animal) => animal.name).join(', ')}
                </Text>
              ) : null}
            </View>
            </>
          ) : null}
          {isBirthRecord ? (
            <View style={styles.birthBlock}>
              <View style={styles.block}>
                <Text style={styles.label}>Species *</Text>
                <Pressable
                  accessibilityLabel="Select species"
                  accessibilityRole="button"
                  onPress={() => setShowBirthSpeciesPicker(true)}
                  style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                >
                  <Text style={[styles.dateValue, !birthSpecies && styles.placeholderValue]}>
                    {birthSpecies || 'Select species'}
                  </Text>
                  <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                </Pressable>
              </View>
              <View style={styles.block}>
                <Text style={styles.label}>Mother</Text>
                <View style={styles.clearableField}>
                  <Pressable
                    accessibilityLabel="Select mother"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !birthSpecies.trim() }}
                    disabled={!birthSpecies.trim()}
                    onPress={() =>
                      router.push({
                        pathname: '/select-mother-animal',
                        params: {
                          ...(recordId ? { recordId } : {}),
                          draftRecord: draftRecordState,
                          birthSpecies,
                          ...(motherUid ? { selectedMotherUid: motherUid } : {}),
                        },
                      })}
                    style={({ pressed }) => [
                      styles.dateField,
                      !birthSpecies.trim() && styles.disabledField,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dateValue,
                        !motherName && styles.placeholderValue,
                        (motherUid || motherName) && styles.clearableFieldValue,
                      ]}
                    >
                      {!birthSpecies.trim()
                        ? 'Select species first'
                        : (selectedMother?.name ?? motherName) ||
                          (eligibleMothers.length === 0
                            ? 'No eligible mothers available'
                            : `${eligibleMothers.length} eligible ${eligibleMothers.length === 1 ? 'mother' : 'mothers'}`)}
                    </Text>
                    <View style={styles.fieldChevron}>
                      <AppIcon name="chevron-right" size={12} color="#EFEFEF" />
                    </View>
                  </Pressable>
                  {motherUid || motherName ? (
                    <FieldClearButton
                      accessibilityLabel="Clear mother"
                      onPress={() => {
                        setMotherUid('');
                        setMotherName('');
                      }}
                      style={styles.customFieldClearButton}
                    />
                  ) : null}
                </View>
              </View>
              {inheritedMother || isEditing ? (
                <View style={styles.inheritedLocationRow}>
                  <AppIcon name="pin" size={17} color={tokens.colors.textSoft} />
                  <View style={styles.inheritedLocationCopy}>
                    <Text
                      ellipsizeMode="tail"
                      numberOfLines={1}
                      style={styles.inheritedLocationValue}
                    >
                      {displayedNewbornLocation || 'Unassigned'}
                    </Text>
                    <Text style={styles.inheritedLocationHint}>
                      {isEditing
                        ? 'Current location — editing this record will not move the animal'
                        : inheritedMother && inheritedLocation
                          ? `Inherited from ${inheritedMother.name}`
                          : inheritedMother
                            ? `${inheritedMother.name} has no location assigned`
                            : 'Unassigned'}
                    </Text>
                  </View>
                </View>
              ) : null}
              <DesignField value={birthTagId} label="Tag / ID *" onChangeText={setBirthTagId} />
              <DesignField value={birthBreed} label="Breed" onChangeText={setBirthBreed} />
              <View style={styles.block}>
                <Text style={styles.label}>Sex</Text>
                <View style={styles.radioRow}>
                  <SexOption
                    label="Female"
                    icon="female"
                    active={birthSex === 'female'}
                    onPress={() => setBirthSex('female')}
                  />
                  <SexOption
                    label="Male"
                    icon="male"
                    active={birthSex === 'male'}
                    onPress={() => setBirthSex('male')}
                  />
                </View>
              </View>
              <View style={styles.inlineRow}>
                <View style={styles.inlineGrow}>
                  <DesignField value={birthWeight} label="Birth Weight" onChangeText={setBirthWeight} keyboardType="decimal-pad" />
                </View>
                <View style={styles.inlineUnit}>
                  <View style={styles.block}>
                    <Text style={styles.label}>Unit</Text>
                    <InlineDropdown
                      accessibilityLabel="Select birth weight unit"
                      options={WEIGHT_UNITS}
                      value={birthWeightUnit}
                      onSelect={setBirthWeightUnit}
                    />
                  </View>
                </View>
              </View>
            </View>
          ) : isMedicationRecord ? (
            <>
              <View style={styles.block}>
                <FieldLabel label="Medicine *" addAccessibilityLabel="Add medicine" onAddPress={openMedicinesScreen} />
                <InlineDropdown
                  accessibilityLabel="Select medicine"
                  options={treatmentNames}
                  value={medicine === '' ? null : medicine}
                  placeholder={availableTreatments.length === 0 ? 'No medicines available' : 'Select medicine'}
                  onSelect={handleTreatmentNameSelect}
                  onEmptyPress={openMedicinesScreen}
                  renderLabel={(name) => <TreatmentRowLabel entry={treatmentsByName.get(name)} name={name} />}
                  onClear={clearTreatment}
                  clearAccessibilityLabel="Clear medicine"
                />
              </View>
              <View style={styles.inlineRow}>
                <View style={styles.inlineGrow}>
                  <DesignField value={dose} label="Dose Per Animal" placeholder="1" onChangeText={setDose} keyboardType="decimal-pad" />
                </View>
                <View style={styles.inlineUnit}>
                  <View style={styles.block}>
                    <Text style={styles.label}>Unit</Text>
                    <InlineDropdown
                      accessibilityLabel="Select dose quantity type"
                      options={DOSE_UNITS}
                      value={doseUnit}
                      onSelect={setDoseUnit}
                    />
                  </View>
                </View>
              </View>
              <View style={styles.block}>
                <Text style={styles.label}>Route</Text>
                <InlineDropdown
                  accessibilityLabel="Select route"
                  options={ROUTE_OPTIONS}
                  value={route}
                  onSelect={setRoute}
                />
              </View>
              <View style={styles.inlineRow}>
                <View style={styles.inlineGrow}>
                  <View style={styles.withdrawalBlock}>
                    <FieldLabel label="Meat Withdrawal (Days)" />
                    <View style={styles.withdrawalField}>
                      <TextInput
                        accessibilityLabel="Meat withdrawal days"
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="#7a7a7a"
                        style={styles.withdrawalInput}
                        cursorColor="#000"
                        selectionColor="#000"
                        value={withdrawal}
                        onChangeText={setWithdrawal}
                      />
                      <Text style={styles.withdrawalSuffix}>days</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.inlineGrow}>
                  <View style={styles.withdrawalBlock}>
                    <FieldLabel label="Milk Withdrawal (Days)" />
                    <View style={styles.withdrawalField}>
                      <TextInput
                        accessibilityLabel="Milk withdrawal days"
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="#7a7a7a"
                        style={styles.withdrawalInput}
                        cursorColor="#000"
                        selectionColor="#000"
                        value={milkWithdrawal}
                        onChangeText={setMilkWithdrawal}
                      />
                      <Text style={styles.withdrawalSuffix}>days</Text>
                    </View>
                  </View>
                </View>
              </View>
              <View style={styles.inlineRow}>
                <View style={styles.inlineGrow}>
                  <DesignField value={batchNumber} label="Batch / Lot No." placeholder="Batch number" onChangeText={setBatchNumber} />
                </View>
                <View style={styles.inlineGrow}>
                  <View style={styles.block}>
                    <Text style={styles.label}>Expiry Date</Text>
                    <View style={styles.clearableField}>
                      <Pressable
                        accessibilityLabel="Select expiry date"
                        accessibilityRole="button"
                        onPress={openExpiryDatePicker}
                        style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                      >
                        <Text
                          style={[
                            styles.dateValue,
                            !expiryDate && styles.placeholderValue,
                            expiryDate && styles.clearableFieldValue,
                          ]}
                        >
                          {expiryDate ? formatDateForDisplay(expiryDate, profile.dateFormat) : 'Select date'}
                        </Text>
                        <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                      </Pressable>
                      {expiryDate ? (
                        <FieldClearButton
                          accessibilityLabel="Clear expiry date"
                          onPress={() => setExpiryDate('')}
                          style={styles.customFieldClearButton}
                        />
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>
            </>
          ) : isVaccinationRecord ? (
            <>
              <View style={styles.block}>
                <FieldLabel label="Vaccine *" addAccessibilityLabel="Add vaccine" onAddPress={openMedicinesScreen} />
                <InlineDropdown
                  accessibilityLabel="Select vaccine"
                  options={treatmentNames}
                  value={medicine === '' ? null : medicine}
                  placeholder={availableTreatments.length === 0 ? 'No vaccines available' : 'Select vaccine'}
                  onSelect={handleTreatmentNameSelect}
                  onEmptyPress={openMedicinesScreen}
                  renderLabel={(name) => <TreatmentRowLabel entry={treatmentsByName.get(name)} name={name} />}
                  onClear={clearTreatment}
                  clearAccessibilityLabel="Clear vaccine"
                />
              </View>
              <View style={styles.inlineRow}>
                <View style={styles.inlineGrow}>
                  <DesignField value={dose} label="Dose Per Animal" placeholder="1" onChangeText={setDose} keyboardType="decimal-pad" />
                </View>
                <View style={styles.inlineUnit}>
                  <View style={styles.block}>
                    <Text style={styles.label}>Unit</Text>
                    <InlineDropdown
                      accessibilityLabel="Select dose quantity type"
                      options={DOSE_UNITS}
                      value={doseUnit}
                      onSelect={setDoseUnit}
                    />
                  </View>
                </View>
              </View>
              <View style={styles.block}>
                <Text style={styles.label}>Route</Text>
                <InlineDropdown
                  accessibilityLabel="Select route"
                  options={ROUTE_OPTIONS}
                  value={route}
                  onSelect={setRoute}
                />
              </View>
              <View style={styles.inlineRow}>
                <View style={styles.inlineGrow}>
                  <View style={styles.withdrawalBlock}>
                    <FieldLabel label="Meat Withdrawal (Days)" />
                    <View style={styles.withdrawalField}>
                      <TextInput
                        accessibilityLabel="Meat withdrawal days"
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="#7a7a7a"
                        style={styles.withdrawalInput}
                        cursorColor="#000"
                        selectionColor="#000"
                        value={withdrawal}
                        onChangeText={setWithdrawal}
                      />
                      <Text style={styles.withdrawalSuffix}>days</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.inlineGrow}>
                  <View style={styles.withdrawalBlock}>
                    <FieldLabel label="Milk Withdrawal (Days)" />
                    <View style={styles.withdrawalField}>
                      <TextInput
                        accessibilityLabel="Milk withdrawal days"
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="#7a7a7a"
                        style={styles.withdrawalInput}
                        cursorColor="#000"
                        selectionColor="#000"
                        value={milkWithdrawal}
                        onChangeText={setMilkWithdrawal}
                      />
                      <Text style={styles.withdrawalSuffix}>days</Text>
                    </View>
                  </View>
                </View>
              </View>
              <View style={styles.inlineRow}>
                <View style={styles.inlineGrow}>
                  <DesignField value={batchNumber} label="Batch / Lot No." placeholder="Batch number" onChangeText={setBatchNumber} />
                </View>
                <View style={styles.inlineGrow}>
                  <View style={styles.block}>
                    <Text style={styles.label}>Expiry Date</Text>
                    <View style={styles.clearableField}>
                      <Pressable
                        accessibilityLabel="Select expiry date"
                        accessibilityRole="button"
                        onPress={openExpiryDatePicker}
                        style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                      >
                        <Text
                          style={[
                            styles.dateValue,
                            !expiryDate && styles.placeholderValue,
                            expiryDate && styles.clearableFieldValue,
                          ]}
                        >
                          {expiryDate ? formatDateForDisplay(expiryDate, profile.dateFormat) : 'Select date'}
                        </Text>
                        <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                      </Pressable>
                      {expiryDate ? (
                        <FieldClearButton
                          accessibilityLabel="Clear expiry date"
                          onPress={() => setExpiryDate('')}
                          style={styles.customFieldClearButton}
                        />
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>
            </>
          ) : isHealthCheckRecord ? (
            <>
              <View style={styles.block}>
                <Text style={styles.label}>Health Status *</Text>
                <InlineDropdown
                  accessibilityLabel="Select health status"
                  options={HEALTH_STATUSES}
                  value={healthStatus}
                  onSelect={setHealthStatus}
                />
              </View>
              <DesignField
                value={conditionDiagnosis}
                label="Condition / Diagnosis"
                placeholder="What was found"
                onChangeText={setConditionDiagnosis}
              />
              <View style={styles.block}>
                <Text style={styles.label}>Vet Seen</Text>
                <View style={styles.radioRow}>
                  <BinaryOption label="Yes" active={vetSeen === 'Yes'} onPress={() => setVetSeen('Yes')} />
                  <BinaryOption label="No" active={vetSeen === 'No'} onPress={() => setVetSeen('No')} />
                </View>
              </View>
            </>
          ) : isSaleRecord ? (
            <>
              <DesignField
                value={salePrice}
                label="Sale Price *"
                placeholder="Total received"
                left={<Text style={styles.currencyPrefix}>{currencyPrefix}</Text>}
                onChangeText={setSalePrice}
                keyboardType="decimal-pad"
              />
              <DesignField value={buyer} label="Buyer" placeholder="Who bought them" onChangeText={setBuyer} />
            </>
          ) : isPurchaseRecord ? (
            <>
              <DesignField
                value={purchasePrice}
                label="Purchase Price *"
                placeholder="Total paid"
                left={<Text style={styles.currencyPrefix}>{currencyPrefix}</Text>}
                onChangeText={setPurchasePrice}
                keyboardType="decimal-pad"
              />
              <DesignField value={seller} label="Seller" placeholder="Who sold them" onChangeText={setSeller} />
            </>
          ) : isMovementRecord ? (
            <>
              <View style={styles.block}>
                <FieldLabel label="From Farm *" addAccessibilityLabel="Add farm" onAddPress={() => openSetupScreen('/setup-farms', 'fromFarm')} />
                <InlineDropdown
                  accessibilityLabel="Select from farm"
                  options={farms}
                  value={fromFarm === '' ? null : fromFarm}
                  placeholder={
                    farms.length === 0
                      ? 'No farms available'
                      : `${farms.length} ${farms.length === 1 ? 'farm' : 'farms'} available`
                  }
                  onSelect={(option) => selectMovementFarm(option, fromFarm, setFromFarm, setFromLocation)}
                  onEmptyPress={() => openSetupScreen('/setup-farms', 'fromFarm')}
                  onClear={() => {
                    setFromFarm('');
                    setFromLocation('');
                  }}
                  clearAccessibilityLabel="Clear from farm"
                />
              </View>
              <View style={styles.block}>
                <FieldLabel label="From Location" addAccessibilityLabel="Add location" onAddPress={() => openSetupScreen('/setup-locations', 'fromLocation')} />
                <InlineDropdown
                  accessibilityLabel="Select from location"
                  options={fromLocationOptions}
                  value={fromLocation === '' ? null : fromLocation}
                  placeholder={
                    fromLocationOptions.length === 0
                      ? fromFarm
                        ? 'No locations for this farm'
                        : 'No locations available'
                      : `${fromLocationOptions.length} ${fromLocationOptions.length === 1 ? 'location' : 'locations'} available`
                  }
                  onSelect={(option) => selectMovementLocation(option, fromFarm, setFromFarm, setFromLocation)}
                  onEmptyPress={() => openSetupScreen('/setup-locations', 'fromLocation')}
                  onClear={() => setFromLocation('')}
                  clearAccessibilityLabel="Clear from location"
                />
              </View>
              <View style={styles.block}>
                <FieldLabel label="To Farm *" addAccessibilityLabel="Add farm" onAddPress={() => openSetupScreen('/setup-farms', 'toFarm')} />
                <InlineDropdown
                  accessibilityLabel="Select to farm"
                  options={farms}
                  value={toFarm === '' ? null : toFarm}
                  placeholder={
                    farms.length === 0
                      ? 'No farms available'
                      : `${farms.length} ${farms.length === 1 ? 'farm' : 'farms'} available`
                  }
                  onSelect={(option) => selectMovementFarm(option, toFarm, setToFarm, setToLocation)}
                  onEmptyPress={() => openSetupScreen('/setup-farms', 'toFarm')}
                  onClear={() => {
                    setToFarm('');
                    setToLocation('');
                  }}
                  clearAccessibilityLabel="Clear to farm"
                />
              </View>
              <View style={styles.block}>
                <FieldLabel label="To Location" addAccessibilityLabel="Add location" onAddPress={() => openSetupScreen('/setup-locations', 'toLocation')} />
                <InlineDropdown
                  accessibilityLabel="Select to location"
                  options={toLocationOptions}
                  value={toLocation === '' ? null : toLocation}
                  placeholder={
                    toLocationOptions.length === 0
                      ? toFarm
                        ? 'No locations for this farm'
                        : 'No locations available'
                      : `${toLocationOptions.length} ${toLocationOptions.length === 1 ? 'location' : 'locations'} available`
                  }
                  onSelect={(option) => selectMovementLocation(option, toFarm, setToFarm, setToLocation)}
                  onEmptyPress={() => openSetupScreen('/setup-locations', 'toLocation')}
                  onClear={() => setToLocation('')}
                  clearAccessibilityLabel="Clear to location"
                />
              </View>
            </>
          ) : isWeightRecord ? (
            <>
              <View style={styles.inlineRow}>
                <View style={styles.inlineGrow}>
                  <DesignField value={weight} label="Weight *" onChangeText={setWeight} keyboardType="decimal-pad" />
                </View>
                <View style={styles.inlineUnit}>
                  <View style={styles.block}>
                    <Text style={styles.label}>Unit *</Text>
                    <InlineDropdown
                      accessibilityLabel="Select weight unit"
                      options={WEIGHT_UNITS}
                      value={weightUnit}
                      onSelect={setWeightUnit}
                    />
                  </View>
                </View>
              </View>
            </>
          ) : isDeathRecord ? (
            <>
              <View style={styles.block}>
                <Text style={styles.label}>Cause of Death</Text>
                <InlineDropdown
                  accessibilityLabel="Select cause of death"
                  options={CAUSE_OF_DEATH_OPTIONS}
                  value={causeOfDeath === '' ? null : causeOfDeath}
                  placeholder="Select cause of death"
                  onSelect={setCauseOfDeath}
                  onClear={() => setCauseOfDeath('')}
                  clearAccessibilityLabel="Clear cause of death"
                />
              </View>
              <View style={styles.block}>
                <Text style={styles.label}>Disposal Method</Text>
                <InlineDropdown
                  accessibilityLabel="Select disposal method"
                  options={DISPOSAL_METHOD_OPTIONS}
                  value={disposalMethod === '' ? null : disposalMethod}
                  placeholder="Select disposal method"
                  onSelect={setDisposalMethod}
                  onClear={() => setDisposalMethod('')}
                  clearAccessibilityLabel="Clear disposal method"
                />
              </View>
            </>
          ) : isOtherRecord ? (
            <>
              <DesignField
                value={recordTitle}
                label="Title *"
                placeholder="Bedding, fencing, water test…"
                onChangeText={setRecordTitle}
                onInfoPress={showFieldNote('otherTitle')}
              />
              <DesignField
                value={cost}
                label="Cost"
                placeholder="What it cost"
                left={<Text style={styles.currencyPrefix}>{currencyPrefix}</Text>}
                keyboardType="decimal-pad"
                onChangeText={setCost}
                onInfoPress={showFieldNote('cost')}
              />
            </>
          ) : (
            <DesignField
              value={recordTitle}
              label="Medicine / Record"
              onChangeText={setRecordTitle}
            />
          )}
            <DesignField
            value={details}
            label="Notes"
            placeholder="Anything worth remembering"
            large
            onChangeText={setDetails}
          />
          <Pressable
            accessibilityLabel="Attach image"
            accessibilityRole="button"
            onPress={handleAddImages}
            style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}
          >
            <View style={styles.photoCopy}>
              <AppIcon name="image-add" size={22} color={tokens.colors.accent} />
              <Text style={styles.photoText}>
                {`Attach Image (${imageUris.length}/1)`}
              </Text>
            </View>
            <View style={styles.fieldChevron}>
              <AppIcon name="chevron-right-minimal" size={18} color="#171717" />
            </View>
          </Pressable>
          {imageUris.length > 0 ? (
            <View style={styles.imageGrid}>
              {imageUris.map((uri) => (
                <View key={uri} style={styles.imageCard}>
                  <Image source={{ uri }} style={styles.imagePreview} />
                  <Pressable
                    accessibilityLabel="Remove image"
                    accessibilityRole="button"
                    onPress={() => handleRemoveImage(uri)}
                    style={styles.removeImageButton}
                  >
                    <AppIcon name="close" size={14} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </View>

      </ScrollView>

      <FloatingActionButton
        accessibilityLabel={isEditing ? 'Save record changes' : 'Save record'}
        icon="check"
        bottomOffset={TAB_ALIGNED_FAB_BOTTOM_OFFSET}
        onPress={handleSave}
      />

      {showDatePicker && Platform.OS === 'android' ? (
        <DateTimePicker
          mode="date"
          display="default"
          value={selectedDate}
          maximumDate={new Date()}
          onChange={handleDateChange}
        />
      ) : null}

      {showExpiryDatePicker && Platform.OS === 'android' ? (
        <DateTimePicker
          mode="date"
          display="default"
          value={expiryDate ? parseStoredDate(expiryDate) ?? new Date() : new Date()}
          onChange={handleExpiryDateChange}
        />
      ) : null}

      <Modal
        animationType="none"
        transparent
        visible={showUpdateImpactConfirm}
        onRequestClose={cancelUpdateImpact}
      >
        <Pressable style={styles.centeredModalBackdrop} onPress={cancelUpdateImpact}>
          <Pressable style={styles.deleteConfirmCard} onPress={() => undefined}>
            <Text style={styles.deleteConfirmTitle}>Save this change?</Text>
            <Text style={styles.deleteConfirmText}>
              This will also change the current value shown on {updateImpact.length === 1 ? 'this animal' : 'these animals'}:
            </Text>
            <View style={styles.impactList}>
              {updateImpact.map((change, index) => (
                <Text key={`${change.animalUid}-${change.dimension}-${index}`} style={styles.impactLine}>
                  {formatImpactLine(change)}
                </Text>
              ))}
            </View>
            <View style={styles.deleteConfirmActions}>
              <BouncyPressable
                accessibilityLabel="Cancel save"
                accessibilityRole="button"
                containerStyle={{ flex: 1 }}
                onPress={cancelUpdateImpact}
                style={({ pressed }) => [styles.deleteCancelButton, pressed && styles.pressed]}
              >
                <Text style={styles.deleteCancelButtonText}>Cancel</Text>
              </BouncyPressable>
              <BouncyPressable
                accessibilityLabel="Confirm save record"
                accessibilityRole="button"
                containerStyle={{ flex: 1 }}
                onPress={confirmUpdateImpact}
                style={({ pressed }) => [styles.deleteConfirmButton, pressed && styles.pressed]}
              >
                <Text style={styles.deleteConfirmButtonText}>Save Anyway</Text>
              </BouncyPressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="none"
        transparent
        visible={showDatePicker && Platform.OS === 'ios'}
        onRequestClose={() => setShowDatePicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowDatePicker(false)}>
          <AnimatedPopupCard visible={showDatePicker && Platform.OS === 'ios'} style={styles.modalCard} onPress={() => undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select date</Text>
              <Pressable
                accessibilityLabel="Done"
                accessibilityRole="button"
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.modalDone}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              mode="date"
              display="spinner"
              value={selectedDate}
              maximumDate={new Date()}
              onChange={handleDateChange}
            />
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

      <Modal
        animationType="none"
        transparent
        visible={showExpiryDatePicker && Platform.OS === 'ios'}
        onRequestClose={() => setShowExpiryDatePicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowExpiryDatePicker(false)}>
          <AnimatedPopupCard visible={showExpiryDatePicker && Platform.OS === 'ios'} style={styles.modalCard} onPress={() => undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select expiry date</Text>
              <Pressable
                accessibilityLabel="Done"
                accessibilityRole="button"
                onPress={() => {
                  // Commits whatever date the spinner is currently showing —
                  // onChange only fires once the user actually scrolls a
                  // wheel, so without this, tapping Done on an
                  // already-correct date silently saved nothing.
                  setExpiryDate(formatDateForStorage(expiryDate ? parseStoredDate(expiryDate) ?? new Date() : new Date()));
                  setShowExpiryDatePicker(false);
                }}
              >
                <Text style={styles.modalDone}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              mode="date"
              display="spinner"
              value={expiryDate ? parseStoredDate(expiryDate) ?? new Date() : new Date()}
              onChange={handleExpiryDateChange}
            />
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

      <Modal
        animationType="none"
        transparent
        visible={showBirthSpeciesPicker}
        onRequestClose={() => setShowBirthSpeciesPicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowBirthSpeciesPicker(false)}>
          <AnimatedPopupCard visible={showBirthSpeciesPicker} style={styles.modalCard} onPress={() => undefined}>
            <View style={styles.speciesModalHeader}>
              <Text style={styles.speciesModalTitle}>Select Species</Text>
              <Pressable
                accessibilityLabel="Close species selector"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setShowBirthSpeciesPicker(false)}
                style={styles.speciesModalClose}
              >
                <AppIcon name="close" size={26} color={tokens.colors.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.speciesModalGrid} showsVerticalScrollIndicator={false}>
              {SPECIES_OPTIONS.map((item) => (
                (() => {
                  const theme = getSpeciesThemeByLabel(item.label);

                  return (
                    <Pressable
                      key={item.label}
                      accessibilityRole="button"
                      onPress={() => {
                        if (selectedMother && !equalsIgnoreCase(selectedMother.species, item.label)) {
                          setMotherUid('');
                          setMotherName('');
                        }
                        setBirthSpecies(item.label);
                        setShowBirthSpeciesPicker(false);
                      }}
                      style={({ pressed }) => [
                        styles.speciesModalCard,
                        {
                          backgroundColor: theme.tintBackground,
                        },
                        pressed && styles.speciesModalCardPressed,
                      ]}
                    >
                      <AppIcon name={item.icon} size={26} color={theme.icon} />
                      <Text style={[styles.speciesModalCardLabel, { color: theme.text }]}>{item.label}</Text>
                    </Pressable>
                  );
                })()
              ))}
            </ScrollView>
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

      <InfoModal
        visible={fieldNote !== null}
        onClose={() => setFieldNote(null)}
        title={fieldNote?.title ?? ''}
        description={fieldNote?.description ?? ''}
      />
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 18,
    paddingBottom: 220,
    gap: 18,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-start',
  },
  typeChip: {
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  typeChipActive: {
    backgroundColor: tokens.colors.accent,
  },
  typeChipIdle: {
    backgroundColor: '#EFECF0',
  },
  typeChipDisabled: {
    opacity: 0.45,
  },
  typeChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  typeChipTextActive: {
    color: '#fff',
  },
  typeChipTextIdle: {
    color: '#555',
  },
  block: {
    gap: 8,
  },
  birthBlock: {
    gap: 18,
  },
  disabledField: {
    opacity: 0.55,
  },
  inheritedLocationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingHorizontal: 4,
  },
  inheritedLocationCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  inheritedLocationValue: {
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  inheritedLocationHint: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  radioRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-end',
  },
  inlineGrow: {
    flex: 1,
  },
  inlineUnit: {
    width: 130,
  },
  label: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  formCard: {
    borderRadius: 24,
    backgroundColor: '#EFECF0',
    padding: 16,
    gap: 18,
  },
  dateField: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateValue: {
    color: '#2b2b2b',
    fontSize: 13,
    fontWeight: '500',
  },
  fieldChevron: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearableField: {
    position: 'relative',
  },
  clearableFieldValue: {
    paddingRight: 32,
  },
  customFieldClearButton: {
    position: 'absolute',
    right: 34,
    top: 8,
    zIndex: 1,
    elevation: 1,
  },
  placeholderValue: {
    color: '#7a7a7a',
  },
  helperText: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    fontWeight: '500',
  },
  selectionSummary: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
  },
  suggestionList: {
    gap: 8,
  },
  suggestionRow: {
    minHeight: 40,
    borderRadius: 16,
    backgroundColor: '#FFF8F7',
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  suggestionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  withdrawalBlock: {
    gap: 8,
  },
  withdrawalField: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  withdrawalInput: {
    color: '#2b2b2b',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    paddingVertical: 0,
  },
  withdrawalSuffix: {
    color: '#7a7a7a',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 12,
  },
  currencyPrefix: {
    color: '#7a7a7a',
    fontSize: 13,
    fontWeight: '600',
  },
  photoButton: {
    minHeight: 54,
    borderRadius: 22,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  photoCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  photoText: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  imageGrid: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  imageCard: {
    width: 88,
    height: 88,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#fff',
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  centeredModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.46)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  deleteConfirmCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 26,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  deleteConfirmTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  deleteConfirmText: {
    marginTop: 8,
    color: tokens.colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    textAlign: 'center',
  },
  impactList: {
    marginTop: 12,
    gap: 6,
  },
  impactLine: {
    color: tokens.colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  deleteConfirmActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  deleteCancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#E5E0E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteCancelButtonText: {
    color: '#544F49',
    fontSize: 15,
    fontWeight: '700',
  },
  deleteConfirmButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 26,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  modalDone: {
    color: tokens.colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  selectionCard: {
    marginHorizontal: 18,
    marginBottom: 28,
    borderRadius: 26,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 8,
  },
  selectionTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  selectionRow: {
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: '#EFECF0',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionRowActive: {
    backgroundColor: tokens.colors.accent,
  },
  selectionCopy: {
    flex: 1,
    paddingRight: 10,
    gap: 2,
  },
  selectionText: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  selectionSubtext: {
    color: tokens.colors.textSoft,
    fontSize: 11,
    fontWeight: '500',
  },
  selectionTextActive: {
    color: '#fff',
  },
  speciesModalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 18,
    paddingBottom: 12,
  },
  speciesModalHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  speciesModalTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  speciesModalClose: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  speciesModalCard: {
    width: '48%',
    minHeight: 74,
    borderRadius: 16,
    backgroundColor: '#EFECF0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingLeft: 24,
    paddingRight: 14,
  },
  speciesModalCardLabel: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '500',
  },
  speciesModalCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  sexOption: {
    flex: 1,
    minHeight: 52,
    borderRadius: 24,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  sexOptionActive: {
    backgroundColor: tokens.colors.accent,
  },
  sexOptionCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flex: 1,
  },
  sexOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.text,
  },
  sexOptionTextActive: { color: '#fff' },
  binaryOption: {
    flex: 1,
    minHeight: 52,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  binaryOptionIdle: {},
  binaryOptionActive: {
    backgroundColor: tokens.colors.accent,
  },
  binaryOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.text,
  },
  binaryOptionTextActive: { color: '#fff' },
  pressed: {
    opacity: 0.92,
  },
});

function getCombinedSpecies(
  selectedAnimals: Array<{ species: string }>,
) {
  const uniqueSpecies = Array.from(new Set(selectedAnimals.map((animal) => animal.species.trim()).filter(Boolean)));

  if (uniqueSpecies.length === 0) {
    return '';
  }

  if (uniqueSpecies.length === 1) {
    return uniqueSpecies[0];
  }

  return 'Mixed';
}

function formatMovementPlace(farm: string, location: string) {
  return [farm.trim(), location.trim()].filter(Boolean).join(' / ');
}

// A treatment reads as its name over the dose or ingredient behind it — the
// same two lines the old picker sheet showed, so choosing between two similar
// products still takes one look.
function TreatmentRowLabel({ entry, name }: { entry?: MedicineEntity; name: string }) {
  return (
    <View style={styles.selectionCopy}>
      <Text style={styles.selectionText}>{name}</Text>
      {entry ? (
        <Text style={styles.selectionSubtext}>
          {entry.defaultDose
            ? `${entry.defaultDose} ${entry.doseUnit}`
            : entry.activeIngredient || (entry.treatmentType === 'vaccine' ? 'Vaccine' : 'Medicine')}
        </Text>
      ) : null}
    </View>
  );
}

function formatImpactLine(change: RecordImpactChange) {
  const dimensionLabel =
    change.dimension === 'weight' ? 'weight' : change.dimension === 'location' ? 'location' : 'status';

  return `${change.animalLabel}'s ${dimensionLabel} will change from ${change.before} to ${change.after}.`;
}

function formatAnimalLocation(animal: Animal | null, farms: FarmEntity[], locations: LocationEntity[]) {
  if (!animal) {
    return '';
  }

  return [
    resolveAnimalFarmName(animal, farms),
    resolveAnimalLocationName(animal, locations),
    animal.labels.join(', '),
  ]
    .filter(Boolean)
    .join(' · ');
}

function formatAnimalReferences(animals: Array<{ id: string; name: string }>) {
  const references = animals.map((animal) => animal.name.trim() || animal.id.trim()).filter(Boolean);

  if (references.length <= 3) {
    return references.join(', ');
  }

  return `${references.slice(0, 3).join(', ')} and ${references.length - 3} more`;
}

type DraftRecordState = {
  selectedDateIso: string;
  recordType: (typeof RECORD_TYPES)[number];
  recordTitle: string;
  medicine: string;
  weight: string;
  weightUnit: (typeof WEIGHT_UNITS)[number];
  causeOfDeath: string;
  disposalMethod: string;
  healthStatus: (typeof HEALTH_STATUSES)[number];
  conditionDiagnosis: string;
  vetSeen: 'Yes' | 'No';
  buyer: string;
  salePrice: string;
  destination: string;
  seller: string;
  purchasePrice: string;
  sourceFarm: string;
  cost: string;
  motherUid?: string;
  motherName: string;
  birthTagId: string;
  birthSpecies: string;
  birthBreed: string;
  birthSex: AnimalSex;
  birthWeight: string;
  birthWeightUnit: (typeof WEIGHT_UNITS)[number];
  dose: string;
  doseUnit: (typeof DOSE_UNITS)[number];
  route: (typeof ROUTE_OPTIONS)[number];
  withdrawal: string;
  milkWithdrawal: string;
  batchNumber: string;
  expiryDate: string;
  fromFarm: string;
  fromLocation: string;
  toFarm: string;
  toLocation: string;
  details: string;
  chosenAnimalIds: string[];
  imageUris: string[];
};

function serializeDraftRecordState(draft: DraftRecordState) {
  return encodeURIComponent(JSON.stringify(draft));
}

function parseDraftRecordState(value: string): DraftRecordState | null {
  try {
    return JSON.parse(decodeURIComponent(value)) as DraftRecordState;
  } catch {
    return null;
  }
}

type RecordFormState = {
  selectedDate: Date;
  recordType: (typeof RECORD_TYPES)[number];
  recordTitle: string;
  medicine: string;
  weight: string;
  weightUnit: (typeof WEIGHT_UNITS)[number];
  causeOfDeath: string;
  disposalMethod: string;
  healthStatus: (typeof HEALTH_STATUSES)[number];
  conditionDiagnosis: string;
  vetSeen: 'Yes' | 'No';
  buyer: string;
  salePrice: string;
  destination: string;
  seller: string;
  purchasePrice: string;
  sourceFarm: string;
  cost: string;
  motherUid: string;
  motherName: string;
  birthTagId: string;
  birthSpecies: string;
  birthBreed: string;
  birthSex: AnimalSex;
  birthWeight: string;
  birthWeightUnit: (typeof WEIGHT_UNITS)[number];
  dose: string;
  doseUnit: (typeof DOSE_UNITS)[number];
  route: (typeof ROUTE_OPTIONS)[number];
  withdrawal: string;
  milkWithdrawal: string;
  batchNumber: string;
  expiryDate: string;
  fromFarm: string;
  fromLocation: string;
  toFarm: string;
  toLocation: string;
  details: string;
  chosenAnimalIds: string[];
  imageUris: string[];
};

function buildFormStateFromRecord(
  record: RecordEntry,
  animals: ReturnType<typeof useAnimals>['animals'],
  farmEntities: FarmEntity[],
  locationEntities: LocationEntity[],
): RecordFormState {
  const recordType = isKnownRecordType(record.type) ? record.type : 'Other';
  const detailMap = parseDetailMap(record.details);
  const parsedMovement = parseMovementTitle(record.title);

  return {
    selectedDate: parseStoredDate(record.date) ?? new Date(),
    recordType,
    recordTitle: record.recordTitle ?? stripTypePrefix(record.title, record.type),
    medicine: record.medicine ?? detailMap['Medicine'] ?? detailMap['Vaccine'] ?? '',
    weight: record.weight ?? (recordType === 'Weight' ? record.dose ?? extractLeadingNumber(stripTypePrefix(record.title, record.type)) ?? '' : ''),
    weightUnit: normalizeWeightUnit(record.weightUnit ?? (recordType === 'Weight' ? record.doseUnit ?? extractTrailingWord(stripTypePrefix(record.title, record.type)) : undefined)),
    causeOfDeath: record.causeOfDeath ?? (recordType === 'Death' ? stripTypePrefix(record.title, record.type) : ''),
    disposalMethod: record.disposalMethod ?? detailMap['Disposal Method'] ?? '',
    healthStatus: normalizeHealthStatus(record.healthStatus ?? (recordType === 'Health Check' ? stripTypePrefix(record.title, record.type) : undefined)),
    conditionDiagnosis: record.conditionDiagnosis ?? detailMap['Condition / Diagnosis'] ?? '',
    vetSeen: normalizeVetSeen(record.vetSeen ?? detailMap['Vet Seen']),
    buyer: record.buyer ?? detailMap['Buyer'] ?? (recordType === 'Sale' ? stripTypePrefix(record.title, record.type) : ''),
    salePrice: record.salePrice ?? extractNumericValue(detailMap['Sale Price']) ?? '',
    destination: record.destination ?? detailMap['Destination'] ?? '',
    seller: record.seller ?? detailMap['Seller'] ?? (recordType === 'Purchase' ? stripTypePrefix(record.title, record.type) : ''),
    purchasePrice: record.purchasePrice ?? extractNumericValue(detailMap['Purchase Price']) ?? '',
    sourceFarm: record.sourceFarm ?? detailMap['Source'] ?? '',
    cost: record.cost ?? '',
    motherUid: record.motherUid ?? '',
    motherName: record.motherName ?? detailMap['Mother'] ?? '',
    birthTagId: record.birthTagId ?? detailMap['Tag / ID'] ?? (recordType === 'Birth' ? stripTypePrefix(record.title, record.type) : ''),
    birthSpecies: record.birthSpecies ?? detailMap['Species'] ?? (recordType === 'Birth' ? record.species : ''),
    birthBreed: record.birthBreed ?? detailMap['Breed'] ?? '',
    birthSex: normalizeBirthSex(record.birthSex ?? detailMap['Sex']),
    birthWeight: record.birthWeight ?? extractLeadingNumber(detailMap['Weight']) ?? '',
    birthWeightUnit: normalizeWeightUnit(record.birthWeightUnit ?? extractTrailingWord(detailMap['Weight'])),
    dose: recordType === 'Weight' ? record.weight ?? record.dose ?? '' : record.dose ?? '',
    doseUnit: normalizeDoseUnit(recordType === 'Weight' ? undefined : record.doseUnit),
    route: normalizeRoute(record.route),
    withdrawal: record.withdrawal ?? '0',
    milkWithdrawal: record.milkWithdrawal ?? '',
    batchNumber: record.batchNumber ?? '',
    expiryDate: record.expiryDate ?? '',
    // Prefer resolving the live name via uid (so re-opening an old record
    // after a rename shows its current name, and re-saving naturally keeps
    // the uid link intact) — frozen text is only the fallback for a
    // deleted farm/location, and title-parsing only for pre-uid records.
    fromFarm: record.fromFarmUid
      ? resolveFarmName(record.fromFarmUid, record.fromFarm, farmEntities)
      : record.fromFarm ?? parsedMovement.fromFarm,
    fromLocation: record.fromLocationUid
      ? resolveLocationName(record.fromLocationUid, record.fromLocation, locationEntities)
      : record.fromLocation ?? parsedMovement.fromLocation,
    toFarm: record.toFarmUid
      ? resolveFarmName(record.toFarmUid, record.toFarm, farmEntities)
      : record.toFarm ?? parsedMovement.toFarm,
    toLocation: record.toLocationUid
      ? resolveLocationName(record.toLocationUid, record.toLocation, locationEntities)
      : record.toLocation ?? parsedMovement.toLocation,
    details: extractRecordNotes(record),
    chosenAnimalIds: resolveRecordAnimalUids(record, animals),
    imageUris: record.imageUris ?? [],
  };
}

function formatRecordShareText(record: RecordEntry) {
  const lines = [
    'LivestockBook Record',
    `${record.type} • ${record.date}`,
    `Animal: ${record.animal || record.animalTag}`,
    `Species: ${record.species}`,
  ];

  if (record.details.trim()) {
    lines.push('', record.details.trim());
  }

  return lines.join('\n');
}

function buildBirthAnimalInput({
  existingAnimal,
  birthTagId,
  birthSpecies,
  birthBreed,
  birthSex,
  birthWeight,
  birthWeightUnit,
  storedDate,
  mother,
  motherName,
}: {
  existingAnimal: Animal | null;
  birthTagId: string;
  birthSpecies: string;
  birthBreed: string;
  birthSex: AnimalSex;
  birthWeight: string;
  birthWeightUnit: AnimalWeightUnit;
  storedDate: string;
  mother: Animal | null;
  motherName: string;
}): CreateAnimalInput {
  const tag = birthTagId.trim();
  const parsedBirthDate = parseStoredDate(storedDate);
  const age = parsedBirthDate ? getAnimalAgeParts(parsedBirthDate, new Date()) : null;

  if (existingAnimal) {
    const { uid: _uid, ageLabel: _ageLabel, tone: _tone, ...editableAnimal } = existingAnimal;
    const shouldFollowTag =
      !editableAnimal.name.trim() || equalsIgnoreCase(editableAnimal.name, editableAnimal.id);

    return {
      ...editableAnimal,
      id: tag,
      name: shouldFollowTag ? tag : editableAnimal.name,
      species: birthSpecies.trim(),
      sex: birthSex,
      ageValue: age?.value ?? '',
      ageUnit: age?.unit ?? 'days old',
      breed: birthBreed.trim(),
      dateOfBirth: storedDate,
      weight: birthWeight.trim(),
      weightUnit: birthWeightUnit,
    };
  }

  return {
    id: tag,
    // A newborn's electronic tag is applied later, so there is nothing to
    // record at birth — it is filled in from the animal's own screen.
    eid: '',
    species: birthSpecies.trim(),
    sex: birthSex,
    name: tag,
    ageValue: age?.value ?? '0',
    ageUnit: age?.unit ?? 'days old',
    breed: birthBreed.trim(),
    dateOfBirth: storedDate,
    weight: birthWeight.trim(),
    weightUnit: birthWeightUnit,
    status: 'Active',
    farmUid: mother?.farmUid,
    farm: mother?.farm ?? '',
    locationUid: mother?.locationUid,
    location: mother?.location ?? '',
    // A calf inherits its mother's labels — she is already tagged with the
    // mob it is born into.
    labelUids: mother?.labelUids ?? [],
    labels: mother?.labels ?? [],
    source: 'Born on farm',
    farmEntryDate: storedDate,
    notes: motherName.trim() ? `Mother: ${motherName.trim()}` : '',
  };
}

function showBirthSaveError(reason: string) {
  if (reason === 'duplicate-tag') {
    Alert.alert(
      'Animal ID already in use',
      'Each animal needs a unique ID / tag. Enter a different tag for the newborn.',
    );
    return;
  }

  if (reason === 'storage-error') {
    Alert.alert(
      'Could not save Birth record',
      'Neither the Birth record nor the newborn animal was saved. Please try again.',
    );
    return;
  }

  Alert.alert(
    'Could not save Birth record',
    'The record and animal were left unchanged to protect their relationship. Please reopen the record and try again.',
  );
}

function getAnimalAgeParts(dateOfBirth: Date, now: Date): { value: string; unit: AnimalAgeUnit } | null {
  if (dateOfBirth > now) {
    return null;
  }

  const millisDiff = now.getTime() - dateOfBirth.getTime();
  const totalDays = Math.floor(millisDiff / (1000 * 60 * 60 * 24));
  const totalMonths =
    (now.getFullYear() - dateOfBirth.getFullYear()) * 12 +
    (now.getMonth() - dateOfBirth.getMonth());
  const fullMonths =
    now.getDate() >= dateOfBirth.getDate() ? totalMonths : Math.max(0, totalMonths - 1);
  const fullYears = Math.floor(fullMonths / 12);

  if (fullYears >= 1) {
    return { value: String(fullYears), unit: 'years old' };
  }

  if (fullMonths >= 1) {
    return { value: String(fullMonths), unit: 'months old' };
  }

  return { value: String(Math.max(totalDays, 0)), unit: 'days old' };
}

function isKnownRecordType(value: string): value is (typeof RECORD_TYPES)[number] {
  return RECORD_TYPES.includes(value as (typeof RECORD_TYPES)[number]);
}

function stripTypePrefix(title: string, type: string) {
  const prefix = `${type}:`;
  return title.startsWith(prefix) ? title.slice(prefix.length).trim() : title.trim();
}

function parseDetailMap(details: string) {
  return details
    .split(/\n\n+/)
    .map((section) => section.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, section) => {
      const separatorIndex = section.indexOf(':');

      if (separatorIndex === -1) {
        return accumulator;
      }

      const key = section.slice(0, separatorIndex).trim();
      const value = section.slice(separatorIndex + 1).trim();

      if (key) {
        accumulator[key] = value;
      }

      return accumulator;
    }, {});
}

function extractRecordNotes(record: RecordEntry) {
  return stripStructuredDetailLines(record.details, getStructuredDetailLabels(record.type));
}

function parseMovementTitle(title: string) {
  const movement = stripTypePrefix(title, 'Movement');
  const [fromPlace = '', toPlace = ''] = movement.split(/\s+to\s+/i);
  const [fromFarm = '', fromLocation = ''] = fromPlace.split(' / ').map((value) => value.trim());
  const [toFarm = '', toLocation = ''] = toPlace.split(' / ').map((value) => value.trim());

  return { fromFarm, fromLocation, toFarm, toLocation };
}

function extractLeadingNumber(value?: string) {
  if (!value) {
    return undefined;
  }

  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? match[0] : undefined;
}

function extractTrailingWord(value?: string) {
  if (!value) {
    return undefined;
  }

  const match = value.trim().match(/([A-Za-z]+)$/);
  return match ? match[1] : undefined;
}

function extractNumericValue(value?: string) {
  return extractLeadingNumber(value);
}

function normalizeWeightUnit(value?: string): (typeof WEIGHT_UNITS)[number] {
  return value === 'lb' ? 'lb' : 'kg';
}

function normalizeDoseUnit(value?: string): (typeof DOSE_UNITS)[number] {
  return DOSE_UNITS.includes(value as (typeof DOSE_UNITS)[number]) ? (value as (typeof DOSE_UNITS)[number]) : 'ml';
}

function normalizeRoute(value?: string): (typeof ROUTE_OPTIONS)[number] {
  return ROUTE_OPTIONS.includes(value as (typeof ROUTE_OPTIONS)[number]) ? (value as (typeof ROUTE_OPTIONS)[number]) : 'Injection';
}

function normalizeHealthStatus(value?: string): (typeof HEALTH_STATUSES)[number] {
  return HEALTH_STATUSES.includes(value as (typeof HEALTH_STATUSES)[number]) ? (value as (typeof HEALTH_STATUSES)[number]) : 'Healthy';
}

function normalizeVetSeen(value?: string): 'Yes' | 'No' {
  return value === 'Yes' ? 'Yes' : 'No';
}

function normalizeBirthSex(value?: string): AnimalSex {
  return value?.toLowerCase() === 'male' ? 'male' : 'female';
}

function showRecordSaveError() {
  Alert.alert(
    'Record could not be saved',
    'The record and any related animal changes were left unchanged. Please try again.',
  );
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

type SexOptionProps = {
  label: string;
  icon: AppIconName;
  active: boolean;
  onPress: () => void;
};

function SexOption({ label, icon, active, onPress }: SexOptionProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sexOption,
        active && styles.sexOptionActive,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.sexOptionCopy}>
        <AppIcon name={icon} size={18} color={active ? '#fff' : tokens.colors.text} />
        <Text style={[styles.sexOptionText, active && styles.sexOptionTextActive]}>{label}</Text>
      </View>
    </Pressable>
  );
}

type BinaryOptionProps = {
  label: 'Yes' | 'No';
  active: boolean;
  onPress: () => void;
};

function BinaryOption({ label, active, onPress }: BinaryOptionProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.binaryOption,
        active ? styles.binaryOptionActive : styles.binaryOptionIdle,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.binaryOptionText, active && styles.binaryOptionTextActive]}>{label}</Text>
    </Pressable>
  );
}
