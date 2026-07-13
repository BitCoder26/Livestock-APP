import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { DesignField } from '../src/components/DesignField';
import { RECORD_TYPES, SPECIES_OPTIONS } from '../src/constants/records';
import { useAccount } from '../src/context/AccountContext';
import { getSpeciesThemeByLabel } from '../src/constants/speciesTheme';
import { useAnimals } from '../src/context/AnimalsContext';
import { useRecords } from '../src/context/RecordsContext';
import { useSetup } from '../src/context/SetupContext';
import { formatCurrencyPrefix, getCurrencyCodeForCountry } from '../src/entities/account';
import type { AnimalSex } from '../src/entities/animal';
import { tokens } from '../src/theme/tokens';

const DOSE_UNITS = ['ml', 'mg', 'g', 'tablet(s)', 'bolus', 'sachet', 'dose'] as const;
const WEIGHT_UNITS = ['kg', 'lb'] as const;
const HEALTH_STATUSES = ['Healthy', 'Under Observation', 'Sick', 'Injured', 'Recovering', 'Other'] as const;
const ROUTE_OPTIONS = ['Injection', 'Oral', 'Pour-on', 'Drench', 'Topical', 'Feed', 'Water', 'Other'] as const;
const DISPOSAL_METHOD_OPTIONS = ['Burial', 'Rendering', 'Incineration', 'Collection', 'Other'] as const;
const MOVEMENT_PICKERS = ['fromFarm', 'fromPaddock', 'toFarm', 'toPaddock'] as const;

type MovementPickerKey = (typeof MOVEMENT_PICKERS)[number];

export default function AddRecordScreen() {
  const router = useRouter();
  const { selectedAnimalIds, selectedMotherName } = useLocalSearchParams<{ selectedAnimalIds?: string; selectedMotherName?: string }>();
  const { profile } = useAccount();
  const { animals, addAnimal } = useAnimals();
  const { addRecord, records } = useRecords();
  const { farms, paddocks, groups } = useSetup();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [recordType, setRecordType] = useState<(typeof RECORD_TYPES)[number]>('Movement');
  const [recordTitle, setRecordTitle] = useState('');
  const [medicine, setMedicine] = useState('');
  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState<(typeof WEIGHT_UNITS)[number]>('kg');
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
  const [motherName, setMotherName] = useState('');
  const [birthTagId, setBirthTagId] = useState('');
  const [birthSpecies, setBirthSpecies] = useState('');
  const [birthBreed, setBirthBreed] = useState('');
  const [birthSex, setBirthSex] = useState<AnimalSex>('female');
  const [birthWeight, setBirthWeight] = useState('');
  const [birthWeightUnit, setBirthWeightUnit] = useState<(typeof WEIGHT_UNITS)[number]>('kg');
  const [dose, setDose] = useState('12');
  const [doseUnit, setDoseUnit] = useState<(typeof DOSE_UNITS)[number]>('ml');
  const [route, setRoute] = useState<(typeof ROUTE_OPTIONS)[number]>('Injection');
  const [withdrawal, setWithdrawal] = useState('0');
  const [fromFarm, setFromFarm] = useState('');
  const [fromPaddock, setFromPaddock] = useState('');
  const [toFarm, setToFarm] = useState('');
  const [toPaddock, setToPaddock] = useState('');
  const [details, setDetails] = useState('');
  const [chosenAnimalIds, setChosenAnimalIds] = useState<string[]>(
    selectedAnimalIds ? selectedAnimalIds.split(',').filter(Boolean) : [],
  );
  const [showDoseUnitPicker, setShowDoseUnitPicker] = useState(false);
  const [showWeightUnitPicker, setShowWeightUnitPicker] = useState(false);
  const [showBirthWeightUnitPicker, setShowBirthWeightUnitPicker] = useState(false);
  const [showHealthStatusPicker, setShowHealthStatusPicker] = useState(false);
  const [showRoutePicker, setShowRoutePicker] = useState(false);
  const [showDisposalMethodPicker, setShowDisposalMethodPicker] = useState(false);
  const [showBirthSpeciesPicker, setShowBirthSpeciesPicker] = useState(false);
  const [activeMovementPicker, setActiveMovementPicker] = useState<MovementPickerKey | null>(null);
  const [imageUris, setImageUris] = useState<string[]>([]);

  const date = formatDate(selectedDate);
  const selectedAnimals = animals.filter((animal) => chosenAnimalIds.includes(animal.id));
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
  const currencyPrefix = formatCurrencyPrefix(profile.country);
  const currencyCode = getCurrencyCodeForCountry(profile.country);
  const medicineSuggestions = useMemo(() => {
    const seen = new Set<string>();
    return records
      .map((record) => record.medicine?.trim())
      .filter((value): value is string => Boolean(value))
      .filter((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .filter((value) => medicine.trim().length > 0 && value.toLowerCase().includes(medicine.trim().toLowerCase()))
      .filter((value) => value.toLowerCase() !== medicine.trim().toLowerCase())
      .slice(0, 5);
  }, [medicine, records]);

  useEffect(() => {
    if (selectedAnimalIds) {
      setChosenAnimalIds(selectedAnimalIds.split(',').filter(Boolean));
    }
  }, [selectedAnimalIds]);

  useEffect(() => {
    if (selectedMotherName) {
      setMotherName(selectedMotherName);
    }
  }, [selectedMotherName]);

  const showMissingRequiredFields = (fields: string[]) => {
    Alert.alert(
      'Required fields missing',
      `Please complete the required field${fields.length > 1 ? 's' : ''}: ${fields.join(', ')}.`,
    );
  };

  const handleSave = () => {
    const missingFields: string[] = [];

    if (!isBirthRecord && chosenAnimalIds.length === 0) {
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

    if (isMedicationRecord) {
      if (!medicine.trim()) {
        missingFields.push('Medicine');
      }

      if (!dose.trim()) {
        missingFields.push('Dose');
      }
    }

    if (isVaccinationRecord) {
      if (!medicine.trim()) {
        missingFields.push('Vaccine');
      }

      if (!dose.trim()) {
        missingFields.push('Dose');
      }
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

    if (isOtherRecord && !recordTitle.trim()) {
      missingFields.push('Title');
    }

    if (missingFields.length > 0) {
      showMissingRequiredFields([...new Set(missingFields)]);
      return;
    }

    const movementTitle = [formatMovementPlace(fromFarm, fromPaddock), formatMovementPlace(toFarm, toPaddock)]
      .filter(Boolean)
      .join(' to ');
    const deathDetails = [disposalMethod.trim() ? `Disposal Method: ${disposalMethod.trim()}` : '', details.trim()]
      .filter(Boolean)
      .join('\n\n');
    const birthDetails = [
      motherName.trim() ? `Mother: ${motherName.trim()}` : '',
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
    const saleDetails = [
      buyer.trim() ? `Buyer: ${buyer.trim()}` : '',
      salePrice.trim() ? `Sale Price: ${currencyPrefix}${salePrice.trim()} ${currencyCode}`.trim() : '',
      destination.trim() ? `Destination: ${destination.trim()}` : '',
      details.trim(),
    ]
      .filter(Boolean)
      .join('\n\n');
    const purchaseDetails = [
      seller.trim() ? `Seller: ${seller.trim()}` : '',
      purchasePrice.trim() ? `Purchase Price: ${currencyPrefix}${purchasePrice.trim()} ${currencyCode}`.trim() : '',
      sourceFarm.trim() ? `Source: ${sourceFarm.trim()}` : '',
      details.trim(),
    ]
      .filter(Boolean)
      .join('\n\n');
    addRecord({
      date: date.trim(),
      animal: isBirthRecord ? birthTagId.trim() : selectedAnimals.map((animal) => animal.name.trim()).join(', '),
      animalTag: isBirthRecord ? birthTagId.trim() : selectedAnimals.map((animal) => animal.id.trim()).join(', '),
      animalIds: isBirthRecord ? undefined : selectedAnimals.map((animal) => animal.id),
      species: isBirthRecord ? birthSpecies.trim() : getCombinedSpecies(selectedAnimals),
      type: recordType,
      title: isMedicationRecord || isVaccinationRecord
        ? `${recordType}: ${medicine.trim()}`.trim()
        : isMovementRecord
          ? `${recordType}: ${movementTitle}`.trim()
        : isWeightRecord
          ? `${recordType}: ${weight.trim()} ${weightUnit}`.trim()
        : isDeathRecord
          ? `${recordType}: ${causeOfDeath.trim()}`.trim()
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
      dose: isMedicationRecord || isVaccinationRecord ? dose.trim() : isWeightRecord ? weight.trim() : undefined,
      doseUnit: isMedicationRecord || isVaccinationRecord ? doseUnit : isWeightRecord ? weightUnit : undefined,
      route: isMedicationRecord || isVaccinationRecord ? route : undefined,
      withdrawal: isMedicationRecord || isVaccinationRecord ? withdrawal.trim() : undefined,
      imageUris: imageUris.length > 0 ? imageUris : undefined,
    });

    if (isBirthRecord) {
      addAnimal({
        id: birthTagId.trim() || '#UNSET',
        species: birthSpecies.trim() || 'Unknown',
        sex: birthSex,
        name: birthTagId.trim() || 'Unnamed',
        ageValue: '0',
        ageUnit: 'days old',
        breed: birthBreed.trim(),
        dateOfBirth: date.trim(),
        weight: birthWeight.trim(),
        weightUnit: birthWeightUnit,
        status: 'Active',
        farm: farms[0] ?? '',
        paddock: paddocks[0] ?? '',
        group: groups[0] ?? '',
        notes: motherName.trim() ? `Mother: ${motherName.trim()}` : '',
      });
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

    setSelectedDate(nextDate);
  };

  const handleAddImages = async () => {
    if (imageUris.length >= 3) {
      Alert.alert('Image limit reached', 'You can attach up to 3 images.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission required', 'Permission to access the photo library is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: 3 - imageUris.length,
    });

    if (result.canceled) {
      return;
    }

    setImageUris((current) => [...current, ...result.assets.map((asset) => asset.uri)].slice(0, 3));
  };

  const handleRemoveImage = (uri: string) => {
    setImageUris((current) => current.filter((item) => item !== uri));
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Add Record"
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
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
                onPress={() => setRecordType(type)}
                style={[styles.typeChip, active ? styles.typeChipActive : styles.typeChipIdle]}
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
            <View style={styles.block}>
              <Text style={styles.label}>Animal(s) *</Text>
              <Pressable
                accessibilityLabel="Select animal"
                accessibilityRole="button"
                onPress={() => router.push('/select-record-animal')}
                style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
              >
                <Text
                  style={[
                    styles.dateValue,
                    selectedAnimals.length === 0 && styles.placeholderValue,
                  ]}
                >
                  {animals.length === 0
                    ? 'No animals available'
                    : selectedAnimals.length === 0
                      ? `${animals.length} ${animals.length === 1 ? 'animal' : 'animals'} available`
                    : selectedAnimals.length === 1
                      ? `${selectedAnimals[0].name} (${selectedAnimals[0].id})`
                      : `${selectedAnimals.length} animals selected`}
                </Text>
                <View style={styles.fieldChevron}>
                  <AppIcon name="chevron-right" size={12} color="#EFEFEF" />
                </View>
              </Pressable>
              {selectedAnimals.length > 1 ? (
                <Text style={styles.selectionSummary}>
                  {selectedAnimals.map((animal) => animal.name).join(', ')}
                </Text>
              ) : null}
              {animals.length === 0 ? (
                <View style={styles.helperRow}>
                  <Pressable
                    accessibilityLabel="Add animal"
                    accessibilityRole="button"
                    onPress={() => router.push('/add-animal')}
                  >
                    <Text style={styles.helperLink}>+ Add Animal</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}
          {isBirthRecord ? (
            <View style={styles.birthBlock}>
              <View style={styles.block}>
                <Text style={styles.label}>Mother</Text>
                <Pressable
                  accessibilityLabel="Select mother"
                  accessibilityRole="button"
                  onPress={() => router.push('/select-mother-animal')}
                  style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                >
                  <Text style={[styles.dateValue, !motherName && styles.placeholderValue]}>
                    {animals.length === 0
                      ? 'No animals available'
                      : motherName || `${animals.length} ${animals.length === 1 ? 'animal' : 'animals'} available`}
                  </Text>
                  <View style={styles.fieldChevron}>
                    <AppIcon name="chevron-right" size={12} color="#EFEFEF" />
                  </View>
                </Pressable>
                {animals.length === 0 ? (
                  <View style={styles.helperRow}>
                    <Pressable
                      accessibilityLabel="Add animal"
                      accessibilityRole="button"
                      onPress={() => router.push('/add-animal')}
                    >
                      <Text style={styles.helperLink}>+ Add Animal</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              <DesignField value={birthTagId} label="Tag / ID *" onChangeText={setBirthTagId} />
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
                    <Pressable
                      accessibilityLabel="Select birth weight unit"
                      accessibilityRole="button"
                      onPress={() => setShowBirthWeightUnitPicker(true)}
                      style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                    >
                      <Text style={styles.dateValue}>{birthWeightUnit}</Text>
                      <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          ) : isMedicationRecord ? (
            <>
              <DesignField value={medicine} label="Medicine *" onChangeText={setMedicine} />
              {medicineSuggestions.length > 0 ? (
                <View style={styles.suggestionList}>
                  {medicineSuggestions.map((suggestion) => (
                    <Pressable
                      key={suggestion}
                      accessibilityLabel={`Use ${suggestion}`}
                      accessibilityRole="button"
                      onPress={() => setMedicine(suggestion)}
                      style={({ pressed }) => [styles.suggestionRow, pressed && styles.pressed]}
                    >
                      <Text style={styles.suggestionText}>{suggestion}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={styles.inlineRow}>
                <View style={styles.inlineGrow}>
                  <DesignField value={dose} label="Dose *" onChangeText={setDose} keyboardType="decimal-pad" />
                </View>
                <View style={styles.inlineUnit}>
                  <View style={styles.block}>
                    <Text style={styles.label}>Unit *</Text>
                    <Pressable
                      accessibilityLabel="Select dose quantity type"
                      accessibilityRole="button"
                      onPress={() => setShowDoseUnitPicker(true)}
                      style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                    >
                      <Text style={styles.dateValue}>{doseUnit}</Text>
                      <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                    </Pressable>
                  </View>
                </View>
              </View>
              <View style={styles.block}>
                <Text style={styles.label}>Route</Text>
                <Pressable
                  accessibilityLabel="Select route"
                  accessibilityRole="button"
                  onPress={() => setShowRoutePicker(true)}
                  style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                >
                  <Text style={styles.dateValue}>{route}</Text>
                  <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                </Pressable>
              </View>
              <View style={styles.withdrawalBlock}>
                <Text style={styles.label}>Withdrawal Period</Text>
                <View style={styles.withdrawalField}>
                  <TextInput
                    accessibilityLabel="Withdrawal days"
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
            </>
          ) : isVaccinationRecord ? (
            <>
              <DesignField value={medicine} label="Vaccine *" onChangeText={setMedicine} />
              <View style={styles.inlineRow}>
                <View style={styles.inlineGrow}>
                  <DesignField value={dose} label="Dose *" onChangeText={setDose} keyboardType="decimal-pad" />
                </View>
                <View style={styles.inlineUnit}>
                  <View style={styles.block}>
                    <Text style={styles.label}>Unit *</Text>
                    <Pressable
                      accessibilityLabel="Select dose quantity type"
                      accessibilityRole="button"
                      onPress={() => setShowDoseUnitPicker(true)}
                      style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                    >
                      <Text style={styles.dateValue}>{doseUnit}</Text>
                      <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                    </Pressable>
                  </View>
                </View>
              </View>
              <View style={styles.block}>
                <Text style={styles.label}>Route</Text>
                <Pressable
                  accessibilityLabel="Select route"
                  accessibilityRole="button"
                  onPress={() => setShowRoutePicker(true)}
                  style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                >
                  <Text style={styles.dateValue}>{route}</Text>
                  <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                </Pressable>
              </View>
              <View style={styles.withdrawalBlock}>
                <Text style={styles.label}>Withdrawal Period</Text>
                <View style={styles.withdrawalField}>
                  <TextInput
                    accessibilityLabel="Withdrawal period days"
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
            </>
          ) : isHealthCheckRecord ? (
            <>
              <View style={styles.block}>
                <Text style={styles.label}>Health Status *</Text>
                <Pressable
                  accessibilityLabel="Select health status"
                  accessibilityRole="button"
                  onPress={() => setShowHealthStatusPicker(true)}
                  style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                >
                  <Text style={styles.dateValue}>{healthStatus}</Text>
                  <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                </Pressable>
              </View>
              <DesignField value={conditionDiagnosis} label="Condition / Diagnosis" onChangeText={setConditionDiagnosis} />
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
              <DesignField value={buyer} label="Buyer" onChangeText={setBuyer} />
              <DesignField
                value={salePrice}
                label="Sale Price"
                left={<Text style={styles.currencyPrefix}>{currencyPrefix}</Text>}
                onChangeText={setSalePrice}
                keyboardType="decimal-pad"
              />
              <DesignField value={destination} label="Destination" onChangeText={setDestination} />
            </>
          ) : isPurchaseRecord ? (
            <>
              <DesignField value={seller} label="Seller" onChangeText={setSeller} />
              <DesignField
                value={purchasePrice}
                label="Purchase Price"
                left={<Text style={styles.currencyPrefix}>{currencyPrefix}</Text>}
                onChangeText={setPurchasePrice}
                keyboardType="decimal-pad"
              />
              <DesignField value={sourceFarm} label="Source" onChangeText={setSourceFarm} />
            </>
          ) : isMovementRecord ? (
            <>
              <View style={styles.block}>
                <Text style={styles.label}>From Farm *</Text>
                <Pressable
                  accessibilityLabel="Select from farm"
                  accessibilityRole="button"
                  onPress={() => {
                    if (farms.length === 0) {
                      router.push('/setup-farms');
                      return;
                    }

                    setActiveMovementPicker('fromFarm');
                  }}
                  style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                >
                  <Text style={[styles.dateValue, (!fromFarm || farms.length === 0) && styles.placeholderValue]}>
                    {farms.length === 0
                      ? 'No farms available'
                      : fromFarm || `${farms.length} ${farms.length === 1 ? 'farm' : 'farms'} available`}
                  </Text>
                  <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                </Pressable>
                {farms.length === 0 ? (
                  <View style={styles.helperRowCompact}>
                    <Pressable
                      accessibilityLabel="Add farm"
                      accessibilityRole="button"
                      onPress={() => router.push('/setup-farms')}
                    >
                      <Text style={styles.helperLink}>+ Add Farm</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              <View style={styles.block}>
                <Text style={styles.label}>From Paddock</Text>
                <Pressable
                  accessibilityLabel="Select from paddock"
                  accessibilityRole="button"
                  onPress={() => {
                    if (paddocks.length === 0) {
                      router.push('/setup-paddocks');
                      return;
                    }

                    setActiveMovementPicker('fromPaddock');
                  }}
                  style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                >
                  <Text style={[styles.dateValue, (!fromPaddock || paddocks.length === 0) && styles.placeholderValue]}>
                    {paddocks.length === 0
                      ? 'No paddocks available'
                      : fromPaddock || `${paddocks.length} ${paddocks.length === 1 ? 'paddock' : 'paddocks'} available`}
                  </Text>
                  <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                </Pressable>
                {paddocks.length === 0 ? (
                  <View style={styles.helperRowCompact}>
                    <Pressable
                      accessibilityLabel="Add paddock"
                      accessibilityRole="button"
                      onPress={() => router.push('/setup-paddocks')}
                    >
                      <Text style={styles.helperLink}>+ Add Paddock</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              <View style={styles.block}>
                <Text style={styles.label}>To Farm *</Text>
                <Pressable
                  accessibilityLabel="Select to farm"
                  accessibilityRole="button"
                  onPress={() => {
                    if (farms.length === 0) {
                      router.push('/setup-farms');
                      return;
                    }

                    setActiveMovementPicker('toFarm');
                  }}
                  style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                >
                  <Text style={[styles.dateValue, (!toFarm || farms.length === 0) && styles.placeholderValue]}>
                    {farms.length === 0
                      ? 'No farms available'
                      : toFarm || `${farms.length} ${farms.length === 1 ? 'farm' : 'farms'} available`}
                  </Text>
                  <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                </Pressable>
                {farms.length === 0 ? (
                  <View style={styles.helperRowCompact}>
                    <Pressable
                      accessibilityLabel="Add farm"
                      accessibilityRole="button"
                      onPress={() => router.push('/setup-farms')}
                    >
                      <Text style={styles.helperLink}>+ Add Farm</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              <View style={styles.block}>
                <Text style={styles.label}>To Paddock</Text>
                <Pressable
                  accessibilityLabel="Select to paddock"
                  accessibilityRole="button"
                  onPress={() => {
                    if (paddocks.length === 0) {
                      router.push('/setup-paddocks');
                      return;
                    }

                    setActiveMovementPicker('toPaddock');
                  }}
                  style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                >
                  <Text style={[styles.dateValue, (!toPaddock || paddocks.length === 0) && styles.placeholderValue]}>
                    {paddocks.length === 0
                      ? 'No paddocks available'
                      : toPaddock || `${paddocks.length} ${paddocks.length === 1 ? 'paddock' : 'paddocks'} available`}
                  </Text>
                  <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                </Pressable>
                {paddocks.length === 0 ? (
                  <View style={styles.helperRowCompact}>
                    <Pressable
                      accessibilityLabel="Add paddock"
                      accessibilityRole="button"
                      onPress={() => router.push('/setup-paddocks')}
                    >
                      <Text style={styles.helperLink}>+ Add Paddock</Text>
                    </Pressable>
                  </View>
                ) : null}
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
                    <Pressable
                      accessibilityLabel="Select weight unit"
                      accessibilityRole="button"
                      onPress={() => setShowWeightUnitPicker(true)}
                      style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                    >
                      <Text style={styles.dateValue}>{weightUnit}</Text>
                      <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                    </Pressable>
                  </View>
                </View>
              </View>
            </>
          ) : isDeathRecord ? (
            <>
              <DesignField value={causeOfDeath} label="Cause of Death" onChangeText={setCauseOfDeath} />
              <View style={styles.block}>
                <Text style={styles.label}>Disposal Method</Text>
                <Pressable
                  accessibilityLabel="Select disposal method"
                  accessibilityRole="button"
                  onPress={() => setShowDisposalMethodPicker(true)}
                  style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                >
                  <Text style={[styles.dateValue, !disposalMethod && styles.placeholderValue]}>
                    {disposalMethod || 'Select disposal method'}
                  </Text>
                  <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                </Pressable>
              </View>
            </>
          ) : isOtherRecord ? (
            <DesignField
              value={recordTitle}
              label="Title *"
              onChangeText={setRecordTitle}
            />
          ) : (
            <DesignField
              value={recordTitle}
              label="Medicine / Record"
              onChangeText={setRecordTitle}
            />
          )}
            <DesignField
            value={details}
            label={isOtherRecord ? 'Description' : isMedicationRecord || isVaccinationRecord || isMovementRecord || isWeightRecord || isDeathRecord || isBirthRecord || isHealthCheckRecord || isSaleRecord || isPurchaseRecord ? 'Notes' : 'Details'}
            large
            onChangeText={setDetails}
          />
          <Pressable
            accessibilityLabel="Add images"
            accessibilityRole="button"
            onPress={handleAddImages}
            style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}
          >
            <View style={styles.photoCopy}>
              <AppIcon name="image-add" size={22} color={tokens.colors.accent} />
              <Text style={styles.photoText}>
                {imageUris.length === 0 ? 'Attach Images' : `Attach Images ${imageUris.length}/3`}
              </Text>
            </View>
            <View style={styles.fieldChevron}>
              <AppIcon name="chevron-right" size={12} color="#EFEFEF" />
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

        <Pressable
          accessibilityLabel="Save record"
          accessibilityRole="button"
          onPress={handleSave}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <AppIcon name="save" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Save Record</Text>
        </Pressable>
      </ScrollView>

      {showDatePicker && Platform.OS === 'android' ? (
        <DateTimePicker
          mode="date"
          display="default"
          value={selectedDate}
          onChange={handleDateChange}
        />
      ) : null}

      <Modal
        animationType="fade"
        transparent
        visible={showDatePicker && Platform.OS === 'ios'}
        onRequestClose={() => setShowDatePicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowDatePicker(false)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
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
              onChange={handleDateChange}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={showDoseUnitPicker}
        onRequestClose={() => setShowDoseUnitPicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowDoseUnitPicker(false)}>
          <Pressable style={styles.selectionCard} onPress={() => undefined}>
            <Text style={styles.selectionTitle}>Select quantity</Text>
            {DOSE_UNITS.map((unit) => (
              <Pressable
                key={unit}
                accessibilityLabel={unit}
                accessibilityRole="button"
                onPress={() => {
                  setDoseUnit(unit);
                  setShowDoseUnitPicker(false);
                }}
                style={({ pressed }) => [
                  styles.selectionRow,
                  unit === doseUnit && styles.selectionRowActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.selectionText,
                    unit === doseUnit && styles.selectionTextActive,
                  ]}
                >
                  {unit}
                </Text>
                {unit === doseUnit ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={showHealthStatusPicker}
        onRequestClose={() => setShowHealthStatusPicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowHealthStatusPicker(false)}>
          <Pressable style={styles.selectionCard} onPress={() => undefined}>
            <Text style={styles.selectionTitle}>Select health status</Text>
            {HEALTH_STATUSES.map((status) => (
              <Pressable
                key={status}
                accessibilityLabel={status}
                accessibilityRole="button"
                onPress={() => {
                  setHealthStatus(status);
                  setShowHealthStatusPicker(false);
                }}
                style={({ pressed }) => [
                  styles.selectionRow,
                  status === healthStatus && styles.selectionRowActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.selectionText,
                    status === healthStatus && styles.selectionTextActive,
                  ]}
                >
                  {status}
                </Text>
                {status === healthStatus ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={showWeightUnitPicker}
        onRequestClose={() => setShowWeightUnitPicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowWeightUnitPicker(false)}>
          <Pressable style={styles.selectionCard} onPress={() => undefined}>
            <Text style={styles.selectionTitle}>Select unit</Text>
            {WEIGHT_UNITS.map((unit) => (
              <Pressable
                key={unit}
                accessibilityLabel={unit}
                accessibilityRole="button"
                onPress={() => {
                  setWeightUnit(unit);
                  setShowWeightUnitPicker(false);
                }}
                style={({ pressed }) => [
                  styles.selectionRow,
                  unit === weightUnit && styles.selectionRowActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.selectionText,
                    unit === weightUnit && styles.selectionTextActive,
                  ]}
                >
                  {unit}
                </Text>
                {unit === weightUnit ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={showBirthWeightUnitPicker}
        onRequestClose={() => setShowBirthWeightUnitPicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowBirthWeightUnitPicker(false)}>
          <Pressable style={styles.selectionCard} onPress={() => undefined}>
            <Text style={styles.selectionTitle}>Select unit</Text>
            {WEIGHT_UNITS.map((unit) => (
              <Pressable
                key={unit}
                accessibilityLabel={unit}
                accessibilityRole="button"
                onPress={() => {
                  setBirthWeightUnit(unit);
                  setShowBirthWeightUnitPicker(false);
                }}
                style={({ pressed }) => [
                  styles.selectionRow,
                  unit === birthWeightUnit && styles.selectionRowActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.selectionText,
                    unit === birthWeightUnit && styles.selectionTextActive,
                  ]}
                >
                  {unit}
                </Text>
                {unit === birthWeightUnit ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={showRoutePicker}
        onRequestClose={() => setShowRoutePicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowRoutePicker(false)}>
          <Pressable style={styles.selectionCard} onPress={() => undefined}>
            <Text style={styles.selectionTitle}>Select route</Text>
            {ROUTE_OPTIONS.map((option) => (
              <Pressable
                key={option}
                accessibilityLabel={option}
                accessibilityRole="button"
                onPress={() => {
                  setRoute(option);
                  setShowRoutePicker(false);
                }}
                style={({ pressed }) => [
                  styles.selectionRow,
                  option === route && styles.selectionRowActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.selectionText,
                    option === route && styles.selectionTextActive,
                  ]}
                >
                  {option}
                </Text>
                {option === route ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={showDisposalMethodPicker}
        onRequestClose={() => setShowDisposalMethodPicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowDisposalMethodPicker(false)}>
          <Pressable style={styles.selectionCard} onPress={() => undefined}>
            <Text style={styles.selectionTitle}>Select disposal method</Text>
            {DISPOSAL_METHOD_OPTIONS.map((option) => (
              <Pressable
                key={option}
                accessibilityLabel={option}
                accessibilityRole="button"
                onPress={() => {
                  setDisposalMethod(option);
                  setShowDisposalMethodPicker(false);
                }}
                style={({ pressed }) => [
                  styles.selectionRow,
                  option === disposalMethod && styles.selectionRowActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.selectionText,
                    option === disposalMethod && styles.selectionTextActive,
                  ]}
                >
                  {option}
                </Text>
                {option === disposalMethod ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={showBirthSpeciesPicker}
        onRequestClose={() => setShowBirthSpeciesPicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowBirthSpeciesPicker(false)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <View style={styles.speciesModalHeader}>
              <Text style={styles.speciesModalTitle}>Select Species</Text>
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
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={activeMovementPicker !== null}
        onRequestClose={() => setActiveMovementPicker(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setActiveMovementPicker(null)}>
          <Pressable style={styles.selectionCard} onPress={() => undefined}>
            <Text style={styles.selectionTitle}>{getMovementPickerTitle(activeMovementPicker)}</Text>
            {getMovementPickerOptions(activeMovementPicker, farms, paddocks).map((option) => {
              const activeValue = getMovementPickerValue(
                activeMovementPicker,
                fromFarm,
                fromPaddock,
                toFarm,
                toPaddock,
              );

              return (
                <Pressable
                  key={option}
                  accessibilityLabel={option}
                  accessibilityRole="button"
                  onPress={() => {
                    applyMovementSelection(
                      activeMovementPicker,
                      option,
                      setFromFarm,
                      setFromPaddock,
                      setToFarm,
                      setToPaddock,
                    );
                    setActiveMovementPicker(null);
                  }}
                  style={({ pressed }) => [
                    styles.selectionRow,
                    option === activeValue && styles.selectionRowActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.selectionText,
                      option === activeValue && styles.selectionTextActive,
                    ]}
                  >
                    {option}
                  </Text>
                  {option === activeValue ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
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
    paddingBottom: 36,
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
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  typeChipActive: {
    backgroundColor: '#FCE5E4',
  },
  typeChipIdle: {
    backgroundColor: '#F5F3F7',
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  typeChipTextActive: {
    color: '#74423F',
    fontWeight: '700',
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
    backgroundColor: '#F5F3F7',
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
  placeholderValue: {
    color: '#7a7a7a',
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  helperRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
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
  helperLink: {
    color: tokens.colors.accent,
    fontSize: 13,
    fontWeight: '700',
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
    color: '#74423F',
    fontSize: 13,
    fontWeight: '600',
  },
  withdrawalBlock: {
    gap: 8,
    width: 156,
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
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 26,
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
    backgroundColor: '#F5F3F7',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionRowActive: {
    backgroundColor: '#FCE5E4',
  },
  selectionText: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  selectionTextActive: {
    color: '#74423F',
    fontWeight: '700',
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
  speciesModalCard: {
    width: '48%',
    minHeight: 74,
    borderRadius: 16,
    backgroundColor: '#F5F3F7',
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
    backgroundColor: '#FCE5E4',
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
  sexOptionTextActive: {
    fontWeight: '700',
  },
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
    backgroundColor: '#FCE5E4',
  },
  binaryOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.text,
  },
  binaryOptionTextActive: {
    fontWeight: '700',
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 27,
    backgroundColor: tokens.colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.92,
  },
});

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

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

function formatMovementPlace(farm: string, paddock: string) {
  return [farm.trim(), paddock.trim()].filter(Boolean).join(' / ');
}

function getMovementPickerTitle(picker: MovementPickerKey | null) {
  switch (picker) {
    case 'fromFarm':
      return 'Select from farm';
    case 'fromPaddock':
      return 'Select from paddock';
    case 'toFarm':
      return 'Select to farm';
    case 'toPaddock':
      return 'Select to paddock';
    default:
      return 'Select option';
  }
}

function getMovementPickerOptions(
  picker: MovementPickerKey | null,
  farms: string[],
  paddocks: string[],
) {
  if (picker === 'fromFarm' || picker === 'toFarm') {
    return farms;
  }

  if (picker === 'fromPaddock' || picker === 'toPaddock') {
    return paddocks;
  }

  return [];
}

function getMovementPickerValue(
  picker: MovementPickerKey | null,
  fromFarm: string,
  fromPaddock: string,
  toFarm: string,
  toPaddock: string,
) {
  switch (picker) {
    case 'fromFarm':
      return fromFarm;
    case 'fromPaddock':
      return fromPaddock;
    case 'toFarm':
      return toFarm;
    case 'toPaddock':
      return toPaddock;
    default:
      return '';
  }
}

function applyMovementSelection(
  picker: MovementPickerKey | null,
  value: string,
  setFromFarm: (value: string) => void,
  setFromPaddock: (value: string) => void,
  setToFarm: (value: string) => void,
  setToPaddock: (value: string) => void,
) {
  switch (picker) {
    case 'fromFarm':
      setFromFarm(value);
      break;
    case 'fromPaddock':
      setFromPaddock(value);
      break;
    case 'toFarm':
      setToFarm(value);
      break;
    case 'toPaddock':
      setToPaddock(value);
      break;
  }
}

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
        <AppIcon name={icon} size={18} color={tokens.colors.text} />
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
