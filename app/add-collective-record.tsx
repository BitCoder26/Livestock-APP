import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../src/theme/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { AppIcon, type AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { DesignField } from '../src/components/DesignField';
import { FieldLabel } from '../src/components/FieldLabel';
import { FloatingActionButton } from '../src/components/FloatingActionButton';
import { InfoModal } from '../src/components/InfoModal';
import {
  COLLECTIVE_RECORD_TYPES,
  SPECIES_OPTIONS,
  collectiveRecordTypeLabel,
  collectiveRecordTypesForSpecies,
  type CollectiveRecordType,
} from '../src/constants/records';
import { FREE_RECORD_LIMIT } from '../src/constants/subscription';
import { getSpeciesThemeByLabel } from '../src/constants/speciesTheme';
import { formatCurrencyPrefix } from '../src/entities/account';
import { useAccount } from '../src/context/AccountContext';
import { useCollectives } from '../src/context/CollectivesContext';
import { useRecords } from '../src/context/RecordsContext';
import { useSetup, type SetupSelectionTarget } from '../src/context/SetupContext';
import { useSubscription } from '../src/context/SubscriptionContext';
import {
  collectiveTermForSpecies,
  getCollectiveCount,
  type Collective,
} from '../src/entities/collective';
import { TAB_ALIGNED_FAB_BOTTOM_OFFSET, tokens } from '../src/theme/tokens';
import { formatDateForDisplay, formatDateForStorage, parseStoredDate } from '../src/utils/dateFormat';
import { persistRecordImage } from '../src/utils/imageStorage';
import {
  equalsIgnoreCase,
  isValidNonNegativeInteger,
  isValidNonNegativeNumber,
  isValidPositiveNumber,
} from '../src/utils/validation';
import {
  COUNT_CHANGING_RECORD_TYPES,
  changesHeadCount,
  collectiveLabel,
  isHeadcountRecord,
  usesAffectedCount,
} from '../src/utils/recordCollectives';

const WEIGHT_UNITS = ['kg', 'lb'] as const;
// Feed is bought and fed in units that have nothing to do with liveweight —
// a bag of layer pellets, a bale of hay, a tonne of meal.
const FEED_UNITS = ['kg', 'g', 'lb', 't', 'bag', 'bale'] as const;
const DOSE_UNITS = ['ml', 'mg', 'g', 'tablet(s)', 'bolus', 'sachet', 'dose'] as const;
const ROUTE_OPTIONS = ['Injection', 'Oral', 'Pour-on', 'Drench', 'Topical', 'Feed', 'Water', 'Other'] as const;
const HEALTH_STATUSES = ['Healthy', 'Under Observation', 'Sick', 'Injured', 'Recovering', 'Other'] as const;
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

const SPECIES_ICONS = new Map<string, AppIconName>(SPECIES_OPTIONS.map((item) => [item.label, item.icon]));

/**
 * The notes behind each field's (i). Kept out of the form as a flat map so the
 * markup stays readable and so a field's explanation is written once, next to
 * every other one, where it can be compared for tone and length.
 */
const FIELD_NOTES: Record<string, { title: string; description: string }> = {
  affectedCount: {
    title: 'How many animals',
    description:
      'Deaths, births, sales and purchases move the head count by this number, as a dated change. Edit or delete the record and that change follows it, so the count and the records explaining it can never disagree.\n\n' +
      'Vaccinations, medications and health checks ask how many were treated but leave the head count alone.',
  },
  newCount: {
    title: 'New headcount',
    description:
      'For when you have been out and counted, and the real number no longer matches the app.\n\n' +
      'The difference is saved as a dated correction. Births, hatches, deaths, sales and purchases already keep the count up to date on their own.',
  },
  weight: {
    title: 'Average weight',
    description: 'The average weight of the animals you weighed, not the total.',
  },
  feedQuantity: {
    title: 'Feed quantity',
    description: 'How much feed this record covers. Feed per animal works itself out from the head count.',
  },
  eggsCollected: {
    title: 'Eggs collected',
    description: 'The eggs collected on this record\u2019s date. Logging weekly? Use the day you collected up to.',
  },
  eggsDamaged: {
    title: 'Damaged or cracked',
    description: 'How many of those eggs were not saleable.',
  },
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

export default function AddCollectiveRecordScreen() {
  const router = useRouter();
  const {
    collectiveUid: initialCollectiveUid,
    recordId,
  } = useLocalSearchParams<{
    collectiveUid?: string;
    recordId?: string;
  }>();
  const { profile } = useAccount();
  const { collectives, syncRecordCountEvent } = useCollectives();
  const { records, addRecord, updateRecord, deleteRecord } = useRecords();
  const {
    medicineEntities,
    farms,
    locationEntities,
    beginSetupSelection,
    pendingSetupSelectionResult,
    clearSetupSelectionResult,
  } = useSetup();
  const { isPro } = useSubscription();

  const editingRecord = useMemo(
    () => (recordId ? records.find((entry) => entry.id === recordId) ?? null : null),
    [recordId, records],
  );
  const isEditing = Boolean(editingRecord);

  const [collectiveUid, setCollectiveUid] = useState(
    editingRecord?.collectiveUid ?? initialCollectiveUid ?? '',
  );
  const [selectedDate, setSelectedDate] = useState(
    () => (editingRecord ? parseStoredDate(editingRecord.date) ?? new Date() : new Date()),
  );
  const [recordType, setRecordType] = useState<CollectiveRecordType>(
    (COLLECTIVE_RECORD_TYPES.find((type) => type === editingRecord?.type) ??
      'Movement') as CollectiveRecordType,
  );
  const [recordTitle, setRecordTitle] = useState(editingRecord?.recordTitle ?? '');
  const [affectedCount, setAffectedCount] = useState(
    // Headcount stores a signed delta in affectedCount; the figure the keeper
    // typed lives in newCount and is edited through its own field.
    isHeadcountRecord(editingRecord?.type ?? '') ? '' : editingRecord?.affectedCount ?? '',
  );
  const [newCount, setNewCount] = useState(editingRecord?.newCount ?? '');
  const [details, setDetails] = useState(editingRecord?.details ?? '');
  const [imageUris, setImageUris] = useState<string[]>(editingRecord?.imageUris ?? []);

  const [fromFarm, setFromFarm] = useState(editingRecord?.fromFarm ?? '');
  const [fromLocation, setFromLocation] = useState(editingRecord?.fromLocation ?? '');
  const [toFarm, setToFarm] = useState(editingRecord?.toFarm ?? '');
  const [toLocation, setToLocation] = useState(editingRecord?.toLocation ?? '');
  const [weight, setWeight] = useState(editingRecord?.weight ?? '');
  const [sampleSize, setSampleSize] = useState(editingRecord?.sampleSize ?? '');
  const [feedQuantity, setFeedQuantity] = useState(editingRecord?.feedQuantity ?? '');
  const [feedUnit, setFeedUnit] = useState<string>(editingRecord?.feedUnit ?? 'kg');
  const [feedType, setFeedType] = useState(editingRecord?.feedType ?? '');
  const [cost, setCost] = useState(editingRecord?.cost ?? '');
  const [eggsCollected, setEggsCollected] = useState(editingRecord?.eggsCollected ?? '');
  const [eggsDamaged, setEggsDamaged] = useState(editingRecord?.eggsDamaged ?? '');
  const [weightUnit, setWeightUnit] = useState<(typeof WEIGHT_UNITS)[number]>(
    (editingRecord?.weightUnit as (typeof WEIGHT_UNITS)[number]) ??
      (profile.measurementUnits === 'Imperial' ? 'lb' : 'kg'),
  );
  const [medicine, setMedicine] = useState(editingRecord?.medicine ?? '');
  const [dose, setDose] = useState(editingRecord?.dose ?? '');
  const [doseUnit, setDoseUnit] = useState<string>(editingRecord?.doseUnit ?? 'ml');
  const [route, setRoute] = useState<string>(editingRecord?.route ?? 'Injection');
  const [withdrawal, setWithdrawal] = useState(editingRecord?.withdrawal ?? '');
  const [milkWithdrawal, setMilkWithdrawal] = useState(editingRecord?.milkWithdrawal ?? '');
  const [batchNumber, setBatchNumber] = useState(editingRecord?.batchNumber ?? '');
  const [expiryDate, setExpiryDate] = useState(editingRecord?.expiryDate ?? '');
  const [healthStatus, setHealthStatus] = useState<string>(editingRecord?.healthStatus ?? 'Healthy');
  const [conditionDiagnosis, setConditionDiagnosis] = useState(editingRecord?.conditionDiagnosis ?? '');
  const [vetSeen, setVetSeen] = useState<'Yes' | 'No'>(editingRecord?.vetSeen ?? 'No');
  const [causeOfDeath, setCauseOfDeath] = useState(editingRecord?.causeOfDeath ?? '');
  const [disposalMethod, setDisposalMethod] = useState(editingRecord?.disposalMethod ?? '');
  const [buyer, setBuyer] = useState(editingRecord?.buyer ?? '');
  const [salePrice, setSalePrice] = useState(editingRecord?.salePrice ?? '');
  const [seller, setSeller] = useState(editingRecord?.seller ?? '');
  const [purchasePrice, setPurchasePrice] = useState(editingRecord?.purchasePrice ?? '');

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showExpiryDatePicker, setShowExpiryDatePicker] = useState(false);
  const [showCollectivePicker, setShowCollectivePicker] = useState(false);
  const [optionPicker, setOptionPicker] = useState<null | {
    title: string;
    options: readonly string[];
    selected: string;
    onSelect: (value: string) => void;
  }>(null);
  const [fieldNote, setFieldNote] = useState<(typeof FIELD_NOTES)[string] | null>(null);
  const [saving, setSaving] = useState(false);

  const collective = useMemo(
    () => collectives.find((item) => item.uid === collectiveUid) ?? null,
    [collectives, collectiveUid],
  );
  const term = collective ? collectiveTermForSpecies(collective.species) : 'herd or flock';
  const currencyPrefix = formatCurrencyPrefix(profile.currency);

  // Locations belong to a farm, so each side of a Movement offers only the
  // locations on the farm chosen for that side — and every location while no
  // farm has been picked yet. Mirrors fromLocationOptions on the individual
  // Add Record screen.
  const locationsFor = (farm: string) =>
    locationEntities
      .filter((location) => !farm.trim() || equalsIgnoreCase(location.farm, farm))
      .map((location) => location.name)
      .filter(Boolean);
  const fromLocationOptions = locationsFor(fromFarm);
  const toLocationOptions = locationsFor(toFarm);
  const showFieldNote = (key: keyof typeof FIELD_NOTES) => () => setFieldNote(FIELD_NOTES[key]);
  // The title names the group in its own word — Herd for cattle and pigs,
  // Flock for sheep and poultry, Batch for anything without an everyday
  // collective noun (rabbits). Before a group is picked there is no species to
  // ask, so it opens on the commonest of the three rather than the clumsier
  // "herd or flock" that reads fine mid-sentence but not as a title.
  const titleTerm = collective ? collectiveTermForSpecies(collective.species) : 'herd';
  const date = formatDateForDisplay(selectedDate, profile.dateFormat);
  const storedDate = formatDateForStorage(selectedDate);
  const countRule = COUNT_CHANGING_RECORD_TYPES[recordType];
  const showsCount = usesAffectedCount(recordType);
  const isHeadcount = isHeadcountRecord(recordType);

  // Egg Production is offered only for birds, so the picker is derived from
  // the chosen group's species rather than being one fixed list. Before a
  // group is picked there is no species to ask, so the shorter universal list
  // shows — choosing a flock then reveals the poultry types.
  const isVaccinationRecord = recordType === 'Vaccination';

  // A vaccination record offers vaccines and a medication record offers
  // medicines — the same narrowing the individual Add Record screen does, and
  // the whole point of tagging each entry's treatmentType in Setup.
  const availableTreatments = useMemo(
    () =>
      medicineEntities.filter(
        (entry) => entry.treatmentType === (isVaccinationRecord ? 'vaccine' : 'medicine'),
      ),
    [isVaccinationRecord, medicineEntities],
  );

  const availableTypes = useMemo(
    () => collectiveRecordTypesForSpecies(collective?.species ?? ''),
    [collective?.species],
  );
  const typeLabel = (type: string) => collectiveRecordTypeLabel(type, collective?.species ?? '');

  // Switching to a flock whose species does not offer the currently selected
  // type would otherwise leave a chip selected that is no longer on screen.
  // Guarded on the group having actually resolved: collectives load async, so
  // without it, opening a saved Egg Production record would reset its type to
  // the default in the frame before its flock arrived.
  useEffect(() => {
    if (collective && !availableTypes.includes(recordType)) {
      setRecordType('Movement');
    }
  }, [availableTypes, collective, recordType]);

  // A farm or location added from the Setup screen this field pushed to comes
  // straight back into the field that sent the keeper there — the same
  // round trip the individual Add Record screen makes.
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

  // The head count this record is measured against: the group's running total
  // with this record's own count event taken back out, so re-opening a saved
  // Headcount shows the total as it stood *before* the correction rather than
  // the one the correction produced.
  const baselineCount = useMemo(() => {
    if (!collective) {
      return 0;
    }

    const ownEvent = editingRecord
      ? collective.countEvents.find((event) => event.recordId === editingRecord.id)
      : undefined;

    return Math.max(0, getCollectiveCount(collective) - (ownEvent?.delta ?? 0));
  }, [collective, editingRecord]);

  const headcountDelta = useMemo(() => {
    const parsed = Number.parseInt(newCount.trim(), 10);
    return Number.isFinite(parsed) ? parsed - baselineCount : 0;
  }, [baselineCount, newCount]);

  // Whether a usable total has been typed at all. Deliberately separate from
  // the delta being zero, which is itself a real answer — the keeper went out,
  // counted, and the app was already right.
  const headcountEntered = useMemo(
    () => Number.isFinite(Number.parseInt(newCount.trim(), 10)),
    [newCount],
  );

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/records');
  };

  const handleDateChange = (event: DateTimePickerEvent, nextDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }

    if (event.type === 'dismissed' || !nextDate) {
      return;
    }

    const now = new Date();
    setSelectedDate(nextDate > now ? now : nextDate);
  };

  /**
   * Copying a medicine's Setup entry onto the record: what the cabinet says is
   * the starting point, still editable, because the record has to be able to
   * say what was actually given. Each value is only written when the entry
   * holds one, so picking a sparse entry never wipes what is already typed.
   * Mirrors applyTreatment on the individual Add Record screen.
   */
  const applyTreatment = (entry: (typeof medicineEntities)[number]) => {
    setMedicine(entry.name.trim());

    if (entry.defaultDose.trim()) {
      setDose(entry.defaultDose);
    }

    if (entry.doseUnit.trim() && DOSE_UNITS.includes(entry.doseUnit as (typeof DOSE_UNITS)[number])) {
      setDoseUnit(entry.doseUnit);
    }

    if (entry.defaultRoute.trim() && ROUTE_OPTIONS.includes(entry.defaultRoute as (typeof ROUTE_OPTIONS)[number])) {
      setRoute(entry.defaultRoute);
    }

    // Each figure comes from its own field. Falling back from one to the other
    // would put a milk figure under a meat label, which is the exact confusion
    // the two fields exist to prevent.
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

  /**
   * Setup opens on the right half of the cabinet: a vaccination record sends
   * the keeper to the vaccine form, a medication record to the medicine one,
   * so the type is already chosen when they get there.
   */
  const openMedicinesScreen = () => {
    router.push({
      pathname: '/setup-medicines',
      params: { treatmentType: isVaccinationRecord ? 'vaccine' : 'medicine' },
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

  const handleExpiryDateChange = (event: DateTimePickerEvent, nextDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowExpiryDatePicker(false);
    }

    if (event.type === 'dismissed' || !nextDate) {
      return;
    }

    setExpiryDate(formatDateForStorage(nextDate));
  };

  const handleAddImage = async () => {
    if (imageUris.length >= 1) {
      Alert.alert('Image limit reached', 'You can attach only 1 image.');
      return;
    }

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
      setImageUris([await persistRecordImage(nextUri)]);
    } catch {
      Alert.alert('Image unavailable', 'The selected image could not be saved. Please choose it again.');
    }
  };

  const buildTitleDetail = (target: Collective) => {
    switch (recordType) {
      case 'Vaccination':
      case 'Medication':
        return medicine.trim() || collectiveLabel(target);
      case 'Weight':
        return weight.trim() ? `${weight.trim()} ${weightUnit}` : collectiveLabel(target);
      case 'Feed':
        return feedType.trim() || (feedQuantity.trim() ? `${feedQuantity.trim()} ${feedUnit}` : collectiveLabel(target));
      case 'Egg Production':
        return eggsCollected.trim() ? `${eggsCollected.trim()} eggs` : collectiveLabel(target);
      case 'Headcount':
        return newCount.trim() ? `${baselineCount} → ${newCount.trim()}` : collectiveLabel(target);
      case 'Deaths':
        return causeOfDeath.trim() || collectiveLabel(target);
      case 'Health Check':
        return healthStatus;
      case 'Sale':
        return buyer.trim() || collectiveLabel(target);
      case 'Purchase':
        return seller.trim() || collectiveLabel(target);
      default:
        return collectiveLabel(target);
    }
  };

  const buildPayload = (target: Collective) => {
    const trimmedCount = affectedCount.trim();

    return {
      date: storedDate,
      // A collective has no individually identified animals, so the animal
      // fields stay empty and the collective fields carry the identity.
      animal: '',
      animalTag: '',
      animalUids: [],
      animalIds: [],
      collectiveUid: target.uid,
      collectiveId: target.id,
      collectiveName: collectiveLabel(target),
      affectedCount: isHeadcount ? String(headcountDelta) : trimmedCount,
      species: target.species,
      // Same `Type: detail` shape the individual records use, so View Record's
      // type-prefix stripping produces a clean headline for both kinds.
      title: `${recordType}: ${(isHeadcount ? '' : recordTitle.trim()) || buildTitleDetail(target)}`.trim(),
      recordTitle: recordTitle.trim(),
      details: details.trim(),
      type: recordType,
      imageUris,
      currencyCode: profile.currency,
      ...(recordType === 'Movement'
        ? {
            fromFarm: fromFarm.trim(),
            fromLocation: fromLocation.trim(),
            toFarm: toFarm.trim(),
            toLocation: toLocation.trim(),
          }
        : {}),
      ...(recordType === 'Weight'
        ? {
            weight: weight.trim(),
            weightUnit,
            sampleSize: sampleSize.trim(),
          }
        : {}),
      ...(recordType === 'Feed'
        ? {
            feedQuantity: feedQuantity.trim(),
            feedUnit,
            feedType: feedType.trim(),
            cost: cost.trim(),
          }
        : {}),
      ...(recordType === 'Egg Production'
        ? { eggsCollected: eggsCollected.trim(), eggsDamaged: eggsDamaged.trim() }
        : {}),
      ...(isHeadcount ? { newCount: newCount.trim() } : {}),
      ...(recordType === 'Other' ? { cost: cost.trim() } : {}),
      ...(recordType === 'Vaccination' || recordType === 'Medication'
        ? {
            medicine: medicine.trim(),
            dose: dose.trim(),
            doseUnit,
            route,
            withdrawal: withdrawal.trim(),
            milkWithdrawal: milkWithdrawal.trim(),
            batchNumber: batchNumber.trim(),
            expiryDate: expiryDate.trim(),
          }
        : {}),
      ...(recordType === 'Health Check'
        ? { healthStatus, conditionDiagnosis: conditionDiagnosis.trim(), vetSeen }
        : {}),
      ...(recordType === 'Deaths'
        ? { causeOfDeath, disposalMethod }
        : {}),
      ...(recordType === 'Sale' ? { buyer: buyer.trim(), salePrice: salePrice.trim() } : {}),
      ...(recordType === 'Purchase'
        ? { seller: seller.trim(), purchasePrice: purchasePrice.trim() }
        : {}),
    };
  };

  const handleSave = async () => {
    if (saving) {
      return;
    }

    if (!collective) {
      Alert.alert('Which group?', 'Choose the herd or flock this record belongs to.');
      return;
    }

    const parsedCount = Number.parseInt(affectedCount.trim(), 10);

    if (countRule && !isHeadcount && (!Number.isFinite(parsedCount) || parsedCount <= 0)) {
      Alert.alert('How many?', `Enter how many animals this ${typeLabel(recordType).toLowerCase()} record covers.`);
      return;
    }

    if (isHeadcount) {
      const parsedNewCount = Number.parseInt(newCount.trim(), 10);

      if (!Number.isFinite(parsedNewCount) || parsedNewCount < 0) {
        Alert.alert('What did you count?', `Enter the number of animals actually in the ${term}.`);
        return;
      }
    }

    if (recordType === 'Movement') {
      const missingFarms = [
        ...(fromFarm.trim() ? [] : ['From Farm']),
        ...(toFarm.trim() ? [] : ['To Farm']),
      ];

      if (missingFarms.length > 0) {
        Alert.alert(
          'Where did they move?',
          `A movement record needs ${missingFarms.join(' and ')}.`,
        );
        return;
      }
    }

    if ((recordType === 'Vaccination' || recordType === 'Medication') && !medicine.trim()) {
      Alert.alert(
        recordType === 'Vaccination' ? 'Which vaccine?' : 'Which medicine?',
        `Choose what the ${term} was given — without it the record cannot say what was used.`,
      );
      return;
    }

    if (recordType === 'Weight' && !weight.trim()) {
      Alert.alert('Average weight', 'Enter the average weight per animal for this record.');
      return;
    }

    if (recordType === 'Feed' && !feedQuantity.trim()) {
      Alert.alert('How much feed?', 'Enter the quantity of feed this record covers.');
      return;
    }

    if (recordType === 'Egg Production' && !eggsCollected.trim()) {
      Alert.alert('How many eggs?', 'Enter how many eggs were collected.');
      return;
    }

    if (recordType === 'Sale' && !salePrice.trim()) {
      Alert.alert('What did they sell for?', 'Enter the sale price for this record.');
      return;
    }

    if (recordType === 'Purchase' && !purchasePrice.trim()) {
      Alert.alert('What did they cost?', 'Enter the purchase price for this record.');
      return;
    }

    if (recordType === 'Other' && !recordTitle.trim()) {
      Alert.alert('Name this record', 'Give it a title so you can tell it apart later — "Bedding", "Fencing repair".');
      return;
    }

    // Presence is settled above; this pass is about the values being usable.
    // The individual Add Record screen has had it from the start, and without
    // the same layer here a herd could carry an average weight of 0 or half a
    // day of withdrawal — figures that read as data but answer nothing.
    const invalidFields: string[] = [];

    if (recordType === 'Weight') {
      if (!isValidPositiveNumber(weight)) {
        invalidFields.push('Average Weight (number greater than 0)');
      }

      if (sampleSize.trim() && !isValidNonNegativeInteger(sampleSize)) {
        invalidFields.push('Sample Size (whole number)');
      }
    }

    if (recordType === 'Feed' && !isValidPositiveNumber(feedQuantity)) {
      invalidFields.push('Quantity (number greater than 0)');
    }

    if (recordType === 'Egg Production') {
      if (!isValidNonNegativeInteger(eggsCollected)) {
        invalidFields.push('Eggs Collected (whole number, 0 or greater)');
      }

      if (eggsDamaged.trim() && !isValidNonNegativeInteger(eggsDamaged)) {
        invalidFields.push('Damaged / Cracked (whole number, 0 or greater)');
      }
    }

    if (recordType === 'Vaccination' || recordType === 'Medication') {
      if (dose.trim() && !isValidPositiveNumber(dose)) {
        invalidFields.push('Dose Per Animal (number greater than 0)');
      }

      if (withdrawal.trim() && !isValidNonNegativeInteger(withdrawal)) {
        invalidFields.push('Meat Withdrawal (whole number of days, 0 or greater)');
      }

      if (milkWithdrawal.trim() && !isValidNonNegativeInteger(milkWithdrawal)) {
        invalidFields.push('Milk Withdrawal (whole number of days, 0 or greater)');
      }
    }

    if (recordType === 'Sale' && !isValidNonNegativeNumber(salePrice)) {
      invalidFields.push('Sale Price (number, 0 or greater)');
    }

    if (recordType === 'Purchase' && !isValidNonNegativeNumber(purchasePrice)) {
      invalidFields.push('Purchase Price (number, 0 or greater)');
    }

    if ((recordType === 'Feed' || recordType === 'Other') && cost.trim() && !isValidNonNegativeNumber(cost)) {
      invalidFields.push('Cost (number, 0 or greater)');
    }

    if (invalidFields.length > 0) {
      Alert.alert(
        'Check your entries',
        `The following field${invalidFields.length > 1 ? 's need' : ' needs'} a valid value: ${invalidFields.join('; ')}.`,
      );
      return;
    }

    // More eggs cracked than were collected is arithmetic, not a typo the
    // keeper can be left to spot later in Reports.
    if (
      recordType === 'Egg Production' &&
      eggsDamaged.trim() &&
      Number(eggsDamaged.trim()) > Number(eggsCollected.trim())
    ) {
      Alert.alert('More damaged than collected', 'Damaged eggs cannot outnumber the eggs collected.');
      return;
    }

    if (recordType === 'Movement') {
      if (equalsIgnoreCase(fromFarm, toFarm) && equalsIgnoreCase(fromLocation, toLocation)) {
        Alert.alert('Location unchanged', 'Choose a different destination for this Movement record.');
        return;
      }

      const locationOffItsFarm =
        (fromLocation.trim() &&
          !locationEntities.some(
            (entry) => equalsIgnoreCase(entry.name, fromLocation) && equalsIgnoreCase(entry.farm, fromFarm),
          )) ||
        (toLocation.trim() &&
          !locationEntities.some(
            (entry) => equalsIgnoreCase(entry.name, toLocation) && equalsIgnoreCase(entry.farm, toFarm),
          ));

      if (locationOffItsFarm) {
        Alert.alert('Location does not match farm', 'Select locations belonging to their chosen farms.');
        return;
      }
    }

    if (!isEditing && !isPro && records.length >= FREE_RECORD_LIMIT) {
      router.push({
        pathname: '/upgrade-to-pro',
        params: { limitType: 'records' },
      });
      return;
    }

    setSaving(true);
    const payload = buildPayload(collective);
    const result = isEditing
      ? await updateRecord(editingRecord!.id, payload)
      : await addRecord(payload);

    if (!result.ok || (!isEditing && !result.record)) {
      setSaving(false);
      Alert.alert('Could not save', 'This record could not be saved. Please try again.');
      return;
    }

    const savedId = isEditing ? editingRecord!.id : result.record!.id;

    // Keep the head count in step with the record that explains it. A failure
    // here leaves the record saved but the count unchanged, so say so rather
    // than letting the two quietly disagree.
    if (countRule) {
      const delta = isHeadcount ? headcountDelta : countRule.sign * parsedCount;
      const countResult = await syncRecordCountEvent(savedId, {
        collectiveUid: collective.uid,
        date: storedDate,
        delta,
        reason: countRule.reason,
        notes: recordTitle.trim() || typeLabel(recordType),
      });

      if (!countResult.ok) {
        setSaving(false);
        Alert.alert('Head count not updated', countResult.message);
        return;
      }
    } else if (isEditing) {
      // The type may have been changed away from a count-changing one — drop
      // any event this record used to own.
      await syncRecordCountEvent(savedId, null);
    }

    setSaving(false);

    if (isEditing) {
      router.back();
      return;
    }

    router.push({
      pathname: '/(tabs)/records',
      params: {
        saveReveal: Date.now().toString(),
        saveTarget: 'records',
        newRecordId: savedId,
      },
    });
  };

  /**
   * With nothing set up yet there is nothing to choose from, so the field
   * sends the keeper to the Setup screen instead of opening an empty list —
   * and what they add there comes back into this field.
   */
  const openSetupScreen = (
    setupPath: '/setup-farms' | '/setup-locations',
    target: SetupSelectionTarget,
  ) => {
    beginSetupSelection(target);
    router.push({ pathname: setupPath, params: {} });
  };

  /**
   * A farm or location dropdown, behaving exactly as the individual Add Record
   * screen's does: a farm with a single location fills that location in, and a
   * location picked before its farm fills the farm in to match.
   */
  const openMovementPicker = (target: SetupSelectionTarget) => {
    const isFarm = target === 'fromFarm' || target === 'toFarm';
    const isFrom = target === 'fromFarm' || target === 'fromLocation';
    const options = isFarm ? farms : isFrom ? fromLocationOptions : toLocationOptions;

    if (options.length === 0) {
      openSetupScreen(isFarm ? '/setup-farms' : '/setup-locations', target);
      return;
    }

    const selected = target === 'fromFarm'
      ? fromFarm
      : target === 'fromLocation'
        ? fromLocation
        : target === 'toFarm'
          ? toFarm
          : toLocation;

    const title = target === 'fromFarm'
      ? 'Select from farm'
      : target === 'fromLocation'
        ? 'Select from location'
        : target === 'toFarm'
          ? 'Select to farm'
          : 'Select to location';

    openOptions(title, options, selected, (value) => {
      if (target === 'fromFarm') {
        if (!equalsIgnoreCase(value, fromFarm)) {
          const matchingLocations = locationEntities.filter((entry) => equalsIgnoreCase(entry.farm, value));
          setFromLocation(matchingLocations.length === 1 ? matchingLocations[0].name : '');
        }

        setFromFarm(value);
        return;
      }

      if (target === 'toFarm') {
        if (!equalsIgnoreCase(value, toFarm)) {
          const matchingLocations = locationEntities.filter((entry) => equalsIgnoreCase(entry.farm, value));
          setToLocation(matchingLocations.length === 1 ? matchingLocations[0].name : '');
        }

        setToFarm(value);
        return;
      }

      const matchedFarm = locationEntities.find((entry) => equalsIgnoreCase(entry.name, value))?.farm;

      if (target === 'fromLocation') {
        if (matchedFarm && !equalsIgnoreCase(matchedFarm, fromFarm)) {
          setFromFarm(matchedFarm);
        }

        setFromLocation(value);
        return;
      }

      if (matchedFarm && !equalsIgnoreCase(matchedFarm, toFarm)) {
        setToFarm(matchedFarm);
      }

      setToLocation(value);
    });
  };

  const openOptions = (
    title: string,
    options: readonly string[],
    selected: string,
    onSelect: (value: string) => void,
  ) => {
    Keyboard.dismiss();
    setOptionPicker({ title, options, selected, onSelect });
  };

  return (
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        <AppTopBar
          title={`${isEditing ? 'Edit' : 'Add'} ${capitalize(titleTerm)} Record`}
          leftAction={{ icon: 'back', accessibilityLabel: 'Back', onPress: handleBack }}
          // Deleting lives on View Record's three-dot menu, the same place an
          // animal's and a herd's does — not here.
          actions={[]}
        />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.typeRow}>
            {availableTypes.map((type) => {
              const active = recordType === type;
              const label = typeLabel(type);

              return (
                <Pressable
                  key={type}
                  accessibilityLabel={label}
                  accessibilityRole="button"
                  onPress={() => setRecordType(type)}
                  style={[styles.typeChip, active ? styles.typeChipActive : styles.typeChipIdle]}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      active ? styles.typeChipTextActive : styles.typeChipTextIdle,
                    ]}
                  >
                    {label}
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
                style={({ pressed }) => [styles.selectField, pressed && styles.pressed]}
              >
                <Text style={styles.selectValue}>{date}</Text>
                <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
              </Pressable>
            </View>

            <View style={styles.block}>
              <Text style={styles.label}>Herd or Flock *</Text>
              <Pressable
                accessibilityLabel="Choose herd or flock"
                accessibilityRole="button"
                onPress={() => setShowCollectivePicker(true)}
                style={({ pressed }) => [styles.selectField, pressed && styles.pressed]}
              >
                <Text style={[styles.selectValue, !collective && styles.placeholderValue]}>
                  {collectives.length === 0
                    ? 'No herds or flocks available'
                    : collective
                      ? collectiveLabel(collective)
                      : `${collectives.length} available`}
                </Text>
                <View style={styles.fieldChevron}>
                  <AppIcon name="chevron-right-minimal" size={18} color="#171717" />
                </View>
              </Pressable>
              {collective ? (
                <Text style={styles.helperText}>
                  {`${collective.species} ${term} · ${getCollectiveCount(collective)} animals recorded`}
                </Text>
              ) : null}
            </View>
            <View style={styles.helperLinkRow}>
              <Pressable
                accessibilityLabel="Add herd or flock"
                accessibilityRole="button"
                hitSlop={12}
                onPress={() => router.push('/add-collective')}
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Text style={styles.helperLinkCompact}>+ Add</Text>
              </Pressable>
              {collectiveUid ? (
                <Pressable
                  accessibilityLabel="Clear herd or flock"
                  accessibilityRole="button"
                  hitSlop={12}
                  onPress={() => setCollectiveUid('')}
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <Text style={styles.helperLinkCompact}>Clear</Text>
                </Pressable>
              ) : null}
            </View>

            {isHeadcount ? (
              <>
                <DesignField
                  value={newCount}
                  label="New Headcount *"
                  placeholder={String(baselineCount)}
                  keyboardType="number-pad"
                  onChangeText={setNewCount}
                  onInfoPress={showFieldNote('newCount')}
                />
                {headcountEntered ? (
                  <Text style={styles.helperText}>
                    {headcountDelta === 0
                      ? `Matches the ${term} as it stands, recorded as a check on ${date}.`
                      : `${headcountDelta > 0 ? 'Adds' : 'Removes'} ${Math.abs(headcountDelta)} on ${date}, recorded as a correction.`}
                  </Text>
                ) : null}
              </>
            ) : null}

            {showsCount ? (
              <>
                <DesignField
                  value={affectedCount}
                  label={countRule ? 'How Many Animals *' : 'How Many Animals'}
                  placeholder="12"
                  keyboardType="number-pad"
                  onChangeText={setAffectedCount}
                  onInfoPress={showFieldNote('affectedCount')}
                />

              </>
            ) : null}

            {/* Every other type is named by the type itself — a Vaccination
                record is called "Vaccination". Only Other has nothing to go on. */}
            {recordType === 'Other' ? (
              <DesignField
                value={recordTitle}
                label="Title *"
                placeholder="Bedding, fencing, water test…"
                onChangeText={setRecordTitle}
                onInfoPress={showFieldNote('otherTitle')}
              />
            ) : null}

            {recordType === 'Movement' ? (
              <>
                <SelectRow
                  label="From Farm *"
                  value={fromFarm}
                  placeholder={
                    farms.length === 0
                      ? 'No farms available'
                      : `${farms.length} ${farms.length === 1 ? 'farm' : 'farms'} available`
                  }
                  onPress={() => openMovementPicker('fromFarm')}
                />
                <View style={styles.helperLinkRow}>
                  <Pressable
                    accessibilityLabel="Add farm"
                    accessibilityRole="button"
                    hitSlop={12}
                    onPress={() => openSetupScreen('/setup-farms', 'fromFarm')}
                    style={({ pressed }) => [pressed && styles.pressed]}
                  >
                    <Text style={styles.helperLinkCompact}>+ Add</Text>
                  </Pressable>
                  {fromFarm ? (
                    <Pressable
                      accessibilityLabel="Clear from farm"
                      accessibilityRole="button"
                      hitSlop={12}
                      onPress={() => {
                        setFromFarm('');
                        setFromLocation('');
                      }}
                      style={({ pressed }) => [pressed && styles.pressed]}
                    >
                      <Text style={styles.helperLinkCompact}>Clear</Text>
                    </Pressable>
                  ) : null}
                </View>
                <SelectRow
                  label="From Location"
                  value={fromLocation}
                  placeholder={
                    fromLocationOptions.length === 0
                      ? fromFarm
                        ? 'No locations for this farm'
                        : 'No locations available'
                      : `${fromLocationOptions.length} ${fromLocationOptions.length === 1 ? 'location' : 'locations'} available`
                  }
                  onPress={() => openMovementPicker('fromLocation')}
                />
                <View style={styles.helperLinkRow}>
                  <Pressable
                    accessibilityLabel="Add location"
                    accessibilityRole="button"
                    hitSlop={12}
                    onPress={() => openSetupScreen('/setup-locations', 'fromLocation')}
                    style={({ pressed }) => [pressed && styles.pressed]}
                  >
                    <Text style={styles.helperLinkCompact}>+ Add</Text>
                  </Pressable>
                  {fromLocation ? (
                    <Pressable
                      accessibilityLabel="Clear from location"
                      accessibilityRole="button"
                      hitSlop={12}
                      onPress={() => setFromLocation('')}
                      style={({ pressed }) => [pressed && styles.pressed]}
                    >
                      <Text style={styles.helperLinkCompact}>Clear</Text>
                    </Pressable>
                  ) : null}
                </View>
                <SelectRow
                  label="To Farm *"
                  value={toFarm}
                  placeholder={
                    farms.length === 0
                      ? 'No farms available'
                      : `${farms.length} ${farms.length === 1 ? 'farm' : 'farms'} available`
                  }
                  onPress={() => openMovementPicker('toFarm')}
                />
                <View style={styles.helperLinkRow}>
                  <Pressable
                    accessibilityLabel="Add farm"
                    accessibilityRole="button"
                    hitSlop={12}
                    onPress={() => openSetupScreen('/setup-farms', 'toFarm')}
                    style={({ pressed }) => [pressed && styles.pressed]}
                  >
                    <Text style={styles.helperLinkCompact}>+ Add</Text>
                  </Pressable>
                  {toFarm ? (
                    <Pressable
                      accessibilityLabel="Clear to farm"
                      accessibilityRole="button"
                      hitSlop={12}
                      onPress={() => {
                        setToFarm('');
                        setToLocation('');
                      }}
                      style={({ pressed }) => [pressed && styles.pressed]}
                    >
                      <Text style={styles.helperLinkCompact}>Clear</Text>
                    </Pressable>
                  ) : null}
                </View>
                <SelectRow
                  label="To Location"
                  value={toLocation}
                  placeholder={
                    toLocationOptions.length === 0
                      ? toFarm
                        ? 'No locations for this farm'
                        : 'No locations available'
                      : `${toLocationOptions.length} ${toLocationOptions.length === 1 ? 'location' : 'locations'} available`
                  }
                  onPress={() => openMovementPicker('toLocation')}
                />
                <View style={styles.helperLinkRow}>
                  <Pressable
                    accessibilityLabel="Add location"
                    accessibilityRole="button"
                    hitSlop={12}
                    onPress={() => openSetupScreen('/setup-locations', 'toLocation')}
                    style={({ pressed }) => [pressed && styles.pressed]}
                  >
                    <Text style={styles.helperLinkCompact}>+ Add</Text>
                  </Pressable>
                  {toLocation ? (
                    <Pressable
                      accessibilityLabel="Clear to location"
                      accessibilityRole="button"
                      hitSlop={12}
                      onPress={() => setToLocation('')}
                      style={({ pressed }) => [pressed && styles.pressed]}
                    >
                      <Text style={styles.helperLinkCompact}>Clear</Text>
                    </Pressable>
                  ) : null}
                </View>
              </>
            ) : null}

            {recordType === 'Weight' ? (
              <>
                <View style={styles.inlineRow}>
                  <View style={styles.inlineGrow}>
                    <DesignField
                      value={weight}
                      label="Average Weight *"
                      placeholder="2.4"
                      keyboardType="decimal-pad"
                      onChangeText={setWeight}
                      onInfoPress={showFieldNote('weight')}
                    />
                  </View>
                  <View style={styles.inlineUnit}>
                    <View style={styles.block}>
                      <Text style={styles.label}>Unit *</Text>
                      <Pressable
                        accessibilityLabel="Select weight unit"
                        accessibilityRole="button"
                        onPress={() => openOptions('Select unit', WEIGHT_UNITS, weightUnit, (value) =>
                          setWeightUnit(value as (typeof WEIGHT_UNITS)[number]),
                        )}
                        style={({ pressed }) => [styles.selectField, pressed && styles.pressed]}
                      >
                        <Text style={styles.selectValue}>{weightUnit}</Text>
                        <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                      </Pressable>
                    </View>
                  </View>
                </View>
                <DesignField
                  value={sampleSize}
                  label="Sample Size"
                  placeholder="How many were weighed"
                  keyboardType="number-pad"
                  onChangeText={setSampleSize}
                />
              </>
            ) : null}

            {recordType === 'Feed' ? (
              <>
                <View style={styles.inlineRow}>
                  <View style={styles.inlineGrow}>
                    <DesignField
                      value={feedQuantity}
                      label="Quantity *"
                      placeholder="25"
                      keyboardType="decimal-pad"
                      onChangeText={setFeedQuantity}
                      onInfoPress={showFieldNote('feedQuantity')}
                    />
                  </View>
                  <View style={styles.inlineGrow}>
                    <View style={styles.block}>
                      <Text style={styles.label}>Unit *</Text>
                      <Pressable
                        accessibilityLabel="Select feed unit"
                        accessibilityRole="button"
                        onPress={() => openOptions('Select unit', FEED_UNITS, feedUnit, setFeedUnit)}
                        style={({ pressed }) => [styles.selectField, pressed && styles.pressed]}
                      >
                        <Text style={styles.selectValue}>{feedUnit}</Text>
                        <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                      </Pressable>
                    </View>
                  </View>
                </View>
                <DesignField
                  value={feedType}
                  label="Feed Type"
                  placeholder="Layer pellets, hay, meal"
                  onChangeText={setFeedType}
                />
                <DesignField
                  value={cost}
                  label="Cost"
                  placeholder="Total paid"
                  left={<Text style={styles.currencyPrefix}>{currencyPrefix}</Text>}
                  keyboardType="decimal-pad"
                  onChangeText={setCost}
                  onInfoPress={showFieldNote('cost')}
                />
              </>
            ) : null}

            {recordType === 'Egg Production' ? (
              <>
                <DesignField
                  value={eggsCollected}
                  label="Eggs Collected *"
                  placeholder="284"
                  keyboardType="number-pad"
                  onChangeText={setEggsCollected}
                  onInfoPress={showFieldNote('eggsCollected')}
                />
                <DesignField
                  value={eggsDamaged}
                  label="Damaged / Cracked"
                  placeholder="3"
                  keyboardType="number-pad"
                  onChangeText={setEggsDamaged}
                  onInfoPress={showFieldNote('eggsDamaged')}
                />
              </>
            ) : null}

            {recordType === 'Other' ? (
              <DesignField
                value={cost}
                label="Cost"
                placeholder="What it cost"
                left={<Text style={styles.currencyPrefix}>{currencyPrefix}</Text>}
                keyboardType="decimal-pad"
                onChangeText={setCost}
                onInfoPress={showFieldNote('cost')}
              />
            ) : null}

            {recordType === 'Vaccination' || recordType === 'Medication' ? (
              <>
                <SelectRow
                  label={isVaccinationRecord ? 'Vaccine *' : 'Medicine *'}
                  value={medicine}
                  placeholder={
                    availableTreatments.length === 0
                      ? isVaccinationRecord
                        ? 'No vaccines available'
                        : 'No medicines available'
                      : `Select from your ${isVaccinationRecord ? 'vaccines' : 'medicine cabinet'}`
                  }
                  onPress={() => {
                    if (availableTreatments.length === 0) {
                      openMedicinesScreen();
                      return;
                    }

                    const names = availableTreatments
                      .map((entity) => entity.name.trim())
                      .filter(Boolean);

                    openOptions(
                      isVaccinationRecord ? 'Select vaccine' : 'Select medicine',
                      names,
                      medicine,
                      (value) => {
                        const match = availableTreatments.find((entity) => entity.name.trim() === value);

                        if (match) {
                          applyTreatment(match);
                          return;
                        }

                        setMedicine(value);
                      },
                    );
                  }}
                />
                <View style={styles.helperLinkRow}>
                  <Pressable
                    accessibilityLabel={isVaccinationRecord ? 'Add vaccine' : 'Add medicine'}
                    accessibilityRole="button"
                    hitSlop={12}
                    onPress={openMedicinesScreen}
                    style={({ pressed }) => [pressed && styles.pressed]}
                  >
                    <Text style={styles.helperLinkCompact}>+ Add</Text>
                  </Pressable>
                  {medicine ? (
                    <Pressable
                      accessibilityLabel={isVaccinationRecord ? 'Clear vaccine' : 'Clear medicine'}
                      accessibilityRole="button"
                      hitSlop={12}
                      onPress={clearTreatment}
                      style={({ pressed }) => [pressed && styles.pressed]}
                    >
                      <Text style={styles.helperLinkCompact}>Clear</Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.inlineRow}>
                  <View style={styles.inlineGrow}>
                    <DesignField
                      value={dose}
                      label="Dose Per Animal"
                      placeholder="1"
                      keyboardType="decimal-pad"
                      onChangeText={setDose}
                    />
                  </View>
                  <View style={styles.inlineGrow}>
                    <SelectRow
                      label="Dose Unit"
                      value={doseUnit}
                      onPress={() => openOptions('Select dose unit', DOSE_UNITS, doseUnit, setDoseUnit)}
                    />
                  </View>
                </View>
                <SelectRow
                  label="Route"
                  value={route}
                  onPress={() => openOptions('Select route', ROUTE_OPTIONS, route, setRoute)}
                />
                <View style={styles.inlineRow}>
                  <View style={styles.inlineGrow}>
                    <DesignField
                      value={withdrawal}
                      label="Meat Withdrawal (Days)"
                      placeholder="0"
                      keyboardType="number-pad"
                      onChangeText={setWithdrawal}
                      onInfoPress={showFieldNote('withdrawal')}
                    />
                  </View>
                  <View style={styles.inlineGrow}>
                    <DesignField
                      value={milkWithdrawal}
                      label="Milk Withdrawal (Days)"
                      placeholder="0"
                      keyboardType="number-pad"
                      onChangeText={setMilkWithdrawal}
                      onInfoPress={showFieldNote('withdrawal')}
                    />
                  </View>
                </View>
                <View style={styles.inlineRow}>
                  <View style={styles.inlineGrow}>
                    <DesignField
                      value={batchNumber}
                      label="Batch / Lot No."
                      placeholder="Batch number"
                      onChangeText={setBatchNumber}
                    />
                  </View>
                  <View style={styles.inlineGrow}>
                    <SelectRow
                      label="Expiry Date"
                      value={expiryDate ? formatDateForDisplay(expiryDate, profile.dateFormat) : ''}
                      placeholder="Select date"
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowExpiryDatePicker(true);
                      }}
                    />
                  </View>
                </View>
                <ClearLink
                  label="Clear Expiry Date"
                  visible={Boolean(expiryDate)}
                  onPress={() => setExpiryDate('')}
                />
              </>
            ) : null}

            {recordType === 'Health Check' ? (
              <>
                <SelectRow
                  label="Health Status *"
                  value={healthStatus}
                  onPress={() =>
                    openOptions('Select health status', HEALTH_STATUSES, healthStatus, setHealthStatus)
                  }
                />
                <DesignField
                  value={conditionDiagnosis}
                  label="Condition / Diagnosis"
                  placeholder="What was found"
                  onChangeText={setConditionDiagnosis}
                />
                <View style={styles.block}>
                  <Text style={styles.label}>Vet Seen</Text>
                  <View style={styles.radioRow}>
                    {(['Yes', 'No'] as const).map((option) => (
                      <Pressable
                        key={option}
                        accessibilityLabel={option}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: vetSeen === option }}
                        onPress={() => setVetSeen(option)}
                        style={({ pressed }) => [
                          styles.binaryOption,
                          vetSeen === option && styles.binaryOptionActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.binaryOptionText,
                            vetSeen === option && styles.binaryOptionTextActive,
                          ]}
                        >
                          {option}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </>
            ) : null}

            {recordType === 'Deaths' ? (
              <>
                <SelectRow
                  label="Cause of Death"
                  value={causeOfDeath}
                  placeholder="Select cause of death"
                  onPress={() =>
                    openOptions('Select cause of death', CAUSE_OF_DEATH_OPTIONS, causeOfDeath, setCauseOfDeath)
                  }
                />
                <ClearLink
                  label="Clear Cause"
                  visible={Boolean(causeOfDeath)}
                  onPress={() => setCauseOfDeath('')}
                />
                <SelectRow
                  label="Disposal Method"
                  value={disposalMethod}
                  placeholder="Select disposal method"
                  onPress={() =>
                    openOptions('Select disposal method', DISPOSAL_METHOD_OPTIONS, disposalMethod, setDisposalMethod)
                  }
                />
                <ClearLink
                  label="Clear Method"
                  visible={Boolean(disposalMethod)}
                  onPress={() => setDisposalMethod('')}
                />
              </>
            ) : null}

            {recordType === 'Sale' ? (
              <>
                <DesignField
                  value={salePrice}
                  label="Sale Price *"
                  placeholder="Total received"
                  left={<Text style={styles.currencyPrefix}>{currencyPrefix}</Text>}
                  keyboardType="decimal-pad"
                  onChangeText={setSalePrice}
                />
                <DesignField value={buyer} label="Buyer" placeholder="Who bought them" onChangeText={setBuyer} />
              </>
            ) : null}

            {recordType === 'Purchase' ? (
              <>
                <DesignField
                  value={purchasePrice}
                  label="Purchase Price *"
                  placeholder="Total paid"
                  left={<Text style={styles.currencyPrefix}>{currencyPrefix}</Text>}
                  keyboardType="decimal-pad"
                  onChangeText={setPurchasePrice}
                />
                <DesignField value={seller} label="Seller" placeholder="Who sold them" onChangeText={setSeller} />
              </>
            ) : null}

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
              onPress={() => void handleAddImage()}
              style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}
            >
              <View style={styles.photoCopy}>
                <AppIcon name="image-add" size={22} color={tokens.colors.accent} />
                <Text style={styles.photoText}>{`Attach Image (${imageUris.length}/1)`}</Text>
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
                      onPress={() => setImageUris([])}
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
          onPress={() => void handleSave()}
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

        <Modal
          animationType="none"
          transparent
          visible={showDatePicker && Platform.OS === 'ios'}
          onRequestClose={() => setShowDatePicker(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setShowDatePicker(false)}>
            <AnimatedPopupCard
              visible={showDatePicker && Platform.OS === 'ios'}
              style={styles.modalCard}
              onPress={() => undefined}
            >
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

        {showExpiryDatePicker && Platform.OS === 'android' ? (
          <DateTimePicker
            mode="date"
            display="default"
            value={parseStoredDate(expiryDate) ?? new Date()}
            onChange={handleExpiryDateChange}
          />
        ) : null}

        <Modal
          animationType="none"
          transparent
          visible={showExpiryDatePicker && Platform.OS === 'ios'}
          onRequestClose={() => setShowExpiryDatePicker(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setShowExpiryDatePicker(false)}>
            <AnimatedPopupCard
              visible={showExpiryDatePicker && Platform.OS === 'ios'}
              style={styles.modalCard}
              onPress={() => undefined}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select expiry date</Text>
                <Pressable
                  accessibilityLabel="Done"
                  accessibilityRole="button"
                  onPress={() => setShowExpiryDatePicker(false)}
                >
                  <Text style={styles.modalDone}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                mode="date"
                display="spinner"
                value={parseStoredDate(expiryDate) ?? new Date()}
                onChange={handleExpiryDateChange}
              />
            </AnimatedPopupCard>
          </Pressable>
        </Modal>

        <Modal
          animationType="none"
          transparent
          visible={showCollectivePicker}
          onRequestClose={() => setShowCollectivePicker(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setShowCollectivePicker(false)}>
            <AnimatedPopupCard
              visible={showCollectivePicker}
              style={styles.modalCard}
              onPress={() => undefined}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select herd or flock</Text>
                <Pressable
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setShowCollectivePicker(false)}
                >
                  <AppIcon name="close" size={26} color={tokens.colors.text} />
                </Pressable>
              </View>

              {collectives.length === 0 ? (
                <View style={styles.emptyPicker}>
                  <Text style={styles.emptyPickerText}>
                    You have not added a herd or flock yet. Close this and tap + Add under the field.
                  </Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.pickerList}
                  contentContainerStyle={styles.pickerListContent}
                  showsVerticalScrollIndicator={false}
                >
                  {collectives.map((item) => {
                    const theme = getSpeciesThemeByLabel(item.species);
                    const selected = item.uid === collectiveUid;

                    return (
                      <Pressable
                        key={item.uid}
                        accessibilityRole="button"
                        onPress={() => {
                          setCollectiveUid(item.uid);
                          setShowCollectivePicker(false);
                        }}
                        style={({ pressed }) => [
                          styles.collectiveRow,
                          selected && styles.collectiveRowActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={[styles.speciesIconBadge, { backgroundColor: theme.chipBackground }]}>
                          <AppIcon
                            name={SPECIES_ICONS.get(item.species) ?? 'animals'}
                            size={20}
                            color={theme.icon}
                          />
                        </View>
                        <View style={styles.collectiveCopy}>
                          <Text style={styles.collectiveTitle}>{collectiveLabel(item)}</Text>
                          <Text style={styles.collectiveMeta}>
                            {`${item.species} ${collectiveTermForSpecies(item.species)} · ${getCollectiveCount(item)} animals`}
                          </Text>
                        </View>
                        {selected ? <AppIcon name="check" size={16} color="#fff" /> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </AnimatedPopupCard>
          </Pressable>
        </Modal>

        <Modal
          animationType="none"
          transparent
          visible={optionPicker !== null}
          onRequestClose={() => setOptionPicker(null)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setOptionPicker(null)}>
            <AnimatedPopupCard
              visible={optionPicker !== null}
              style={styles.selectionCard}
              onPress={() => undefined}
            >
              <Text style={styles.selectionTitle}>{optionPicker?.title ?? ''}</Text>
              <ScrollView
                style={styles.pickerList}
                contentContainerStyle={styles.optionListContent}
                showsVerticalScrollIndicator={false}
              >
                {(optionPicker?.options ?? []).map((option) => (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    onPress={() => {
                      optionPicker?.onSelect(option);
                      setOptionPicker(null);
                    }}
                    style={({ pressed }) => [
                      styles.selectionRow,
                      option === optionPicker?.selected && styles.selectionRowActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.selectionText,
                        option === optionPicker?.selected && styles.selectionTextActive,
                      ]}
                    >
                      {option}
                    </Text>
                    {option === optionPicker?.selected ? (
                      <AppIcon name="check" size={16} color="#fff" />
                    ) : null}
                  </Pressable>
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

function capitalize(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : '';
}

/**
 * The Clear link under an optional dropdown. A picker can be re-picked but not
 * un-picked, so anything that may legitimately be left blank needs a way back
 * to blank. Dropdowns that always carry a value (units, route, status) have
 * nothing to clear and get none.
 */
function ClearLink({ label, visible, onPress }: { label: string; visible: boolean; onPress: () => void }) {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.helperLinkRow}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        hitSlop={12}
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        {/* The field above says what is being cleared, so the link only has to
            say the verb. `label` still carries the full phrase for screen
            readers, which have no such context. */}
        <Text style={styles.helperLinkCompact}>Clear</Text>
      </Pressable>
    </View>
  );
}

function SelectRow({
  label,
  value,
  placeholder,
  onPress,
  onInfoPress,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onPress: () => void;
  onInfoPress?: () => void;
}) {
  return (
    <View style={styles.block}>
      <FieldLabel label={label} onInfoPress={onInfoPress} />
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.selectField, pressed && styles.pressed]}
      >
        <Text style={[styles.selectValue, !value && styles.placeholderValue]}>
          {value || placeholder || 'Select'}
        </Text>
        <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: tokens.colors.background },
  content: { padding: 18, paddingBottom: 220, gap: 18 },
  pressed: { opacity: 0.85 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' },
  typeChip: {
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  typeChipIdle: { backgroundColor: '#EFECF1' },
  typeChipActive: { backgroundColor: tokens.colors.accent },
  typeChipText: { fontSize: 14, fontWeight: '600' },
  typeChipTextIdle: { color: '#544F49' },
  typeChipTextActive: { color: '#fff' },
  formCard: { borderRadius: 24, backgroundColor: '#EFECF0', padding: 16, gap: 18 },
  block: { gap: 8 },
  label: { color: tokens.colors.text, fontSize: 14, fontWeight: '500' },
  helperText: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
  },
  selectField: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectValue: { color: '#2b2b2b', fontSize: 13, fontWeight: '500', flex: 1, paddingRight: 10 },
  placeholderValue: { color: '#7a7a7a' },
  helperLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: -10,
    marginBottom: 4,
  },
  helperLinkCompact: {
    color: tokens.colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  radioRow: { flexDirection: 'row', gap: 12 },
  binaryOption: {
    flex: 1,
    minHeight: 52,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  binaryOptionActive: { backgroundColor: tokens.colors.accent },
  binaryOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.text,
  },
  binaryOptionTextActive: { color: '#fff' },
  inlineRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  inlineGrow: { flex: 1 },
  inlineUnit: { width: 130 },
  currencyPrefix: { color: '#7a7a7a', fontSize: 13, fontWeight: '600' },
  // Matches the animal and herd cards on the Animals tab: a rounded square in
  // the species colour, not a circle.
  speciesIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
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
  photoCopy: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  photoText: { color: tokens.colors.text, fontSize: 15, fontWeight: '600' },
  fieldChevron: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  imageGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  imageCard: {
    width: 88,
    height: 88,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#fff',
    position: 'relative',
  },
  imagePreview: { width: '100%', height: '100%' },
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
  selectionCard: {
    marginHorizontal: 18,
    marginBottom: 28,
    borderRadius: 26,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 8,
  },
  selectionTitle: { color: tokens.colors.text, fontSize: 18, fontWeight: '700', marginBottom: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
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
    marginBottom: 10,
  },
  modalTitle: { color: tokens.colors.text, fontSize: 18, fontWeight: '700' },
  modalDone: { color: tokens.colors.accent, fontSize: 15, fontWeight: '700' },
  pickerList: { maxHeight: 340 },
  // The rows are bordered cards now, so they need air between them rather
  // than stacking into one block.
  pickerListContent: { gap: 10, paddingBottom: 4 },
  // The plain option rows match the individual Add Record screen's picker,
  // whose rows take this gap from the card itself. Inside a ScrollView the
  // card's gap does not reach them, so it is restated here.
  optionListContent: { gap: 8, paddingBottom: 4 },
  selectionRow: {
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: '#EFECF0',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionRowActive: { backgroundColor: tokens.colors.accent },
  selectionText: { color: tokens.colors.text, fontSize: 14, fontWeight: '500' },
  selectionTextActive: { color: '#fff' },
  // Same card as the individual animal picker: white, subtly bordered at
  // rest, accent-bordered when selected. Bordered either way so picking one
  // never resizes it.
  collectiveRow: {
    minHeight: 62,
    borderRadius: 18,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  collectiveRowActive: { backgroundColor: tokens.colors.accent, borderColor: tokens.colors.accentDeep },
  collectiveCopy: { flex: 1, gap: 2 },
  collectiveTitle: { color: tokens.colors.text, fontSize: 15, fontWeight: '700' },
  collectiveMeta: { color: tokens.colors.textSoft, fontSize: 12, fontWeight: '500' },
  emptyPicker: { paddingVertical: 18, alignItems: 'center', gap: 14 },
  emptyPickerText: { color: tokens.colors.textSoft, fontSize: 14, fontWeight: '500', textAlign: 'center' },
});
