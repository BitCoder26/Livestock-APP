import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { CircularRevealView } from '../src/components/CircularRevealView';
import { DesignField } from '../src/components/DesignField';
import { FloatingActionButton } from '../src/components/FloatingActionButton';
import { SPECIES_OPTIONS } from '../src/constants/records';
import { getSpeciesThemeByLabel } from '../src/constants/speciesTheme';
import { FREE_ANIMAL_LIMIT } from '../src/constants/subscription';
import { useAccount } from '../src/context/AccountContext';
import { useAnimals } from '../src/context/AnimalsContext';
import { useRecords } from '../src/context/RecordsContext';
import { useSetup } from '../src/context/SetupContext';
import { useSubscription } from '../src/context/SubscriptionContext';
import type { AnimalAgeUnit, AnimalSex, AnimalSource, AnimalStatus, AnimalWeightUnit } from '../src/entities/animal';
import { tokens } from '../src/theme/tokens';
import { formatDateForDisplay, formatDateForStorage, parseStoredDate } from '../src/utils/dateFormat';
import { filterAccessibleImageUris, persistAnimalProfileImage } from '../src/utils/imageStorage';
import { resolveRecordAnimalUids } from '../src/utils/recordAnimals';
import { resolveAnimalFarmName, resolveAnimalPaddockName } from '../src/utils/recordLocations';

const STATUS_OPTIONS: AnimalStatus[] = ['Active', 'Sold', 'Deceased'];
const WEIGHT_UNITS: AnimalWeightUnit[] = ['kg', 'lb'];
const SOURCE_OPTIONS: AnimalSource[] = ['Born on farm', 'Purchased', 'Transferred in', 'Other'];

const SPECIES_ICONS: Record<string, AppIconName> = Object.fromEntries(
  SPECIES_OPTIONS.map((item) => [item.label, item.icon]),
) as Record<string, AppIconName>;

type PickerKey = 'status' | 'weightUnit' | 'farm' | 'paddock' | 'group' | 'source';

export function AddAnimalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    species,
    animalUid,
    animalId: selectedAnimalId,
    reveal,
    openSpeciesPicker,
    returnToRecordSelector,
    recordSelectorSelectedAnimalIds,
    recordSelectorRecordId,
    recordSelectorDraftRecord,
    recordSelectorSource,
    recordSelectorRecordType,
    recordSelectorFromFarm,
    recordSelectorFromPaddock,
  } = useLocalSearchParams<{
    species?: string;
    animalUid?: string;
    animalId?: string;
    reveal?: string;
    openSpeciesPicker?: string;
    returnToRecordSelector?: string;
    recordSelectorSelectedAnimalIds?: string;
    recordSelectorRecordId?: string;
    recordSelectorDraftRecord?: string;
    recordSelectorSource?: string;
    recordSelectorRecordType?: string;
    recordSelectorFromFarm?: string;
    recordSelectorFromPaddock?: string;
  }>();
  const { profile } = useAccount();
  const { animals, addAnimal, updateAnimal } = useAnimals();
  const { records } = useRecords();
  const { farms, farmEntities, paddockEntities, groupEntities } = useSetup();
  const { isPro } = useSubscription();
  const existingAnimal = animalUid
    ? animals.find((animal) => animal.uid === animalUid)
    : selectedAnimalId
      ? animals.find((animal) => animal.id === selectedAnimalId)
      : undefined;
  const existingAnimalRecordCount = useMemo(() => {
    if (!existingAnimal) {
      return 0;
    }

    return records.filter((record) => resolveRecordAnimalUids(record, animals).includes(existingAnimal.uid)).length;
  }, [animals, existingAnimal, records]);
  const preferredWeightUnit: AnimalWeightUnit = profile.measurementUnits === 'Imperial' ? 'lb' : 'kg';
  const previousPreferredWeightUnit = useRef<AnimalWeightUnit>(preferredWeightUnit);
  const saveInProgress = useRef(false);

  const [selectedSpecies, setSelectedSpecies] = useState(species ?? existingAnimal?.species ?? 'Cattle');
  const activeSpecies = selectedSpecies;
  const speciesIcon = SPECIES_ICONS[activeSpecies] ?? 'cow';
  const [animalId, setAnimalId] = useState(existingAnimal?.id ?? '');
  const [name, setName] = useState(existingAnimal?.name ?? '');
  const [selectedSex, setSelectedSex] = useState<AnimalSex>(normalizeAnimalSex(existingAnimal?.sex));
  const [dateOfBirth, setDateOfBirth] = useState(existingAnimal?.dateOfBirth ?? '');
  const [breed, setBreed] = useState(existingAnimal?.breed ?? '');
  const [status, setStatus] = useState<AnimalStatus>(existingAnimal?.status ?? 'Active');
  const [weight, setWeight] = useState(existingAnimal?.weight ?? '');
  const [weightUnit, setWeightUnit] = useState<AnimalWeightUnit>(existingAnimal?.weightUnit ?? preferredWeightUnit);
  const [farm, setFarm] = useState(existingAnimal ? resolveAnimalFarmName(existingAnimal, farmEntities) : '');
  const [paddock, setPaddock] = useState(existingAnimal ? resolveAnimalPaddockName(existingAnimal, paddockEntities) : '');
  const [group, setGroup] = useState(existingAnimal?.group ?? '');
  const [source, setSource] = useState<AnimalSource | ''>(existingAnimal?.source ?? '');
  // Defaults to today for a new animal — most animals join the farm "now",
  // and leaving it blank meant the field silently stayed empty unless the
  // user opened the picker and explicitly touched it (see the Done-button
  // fix below for the general version of that problem).
  const [farmEntryDate, setFarmEntryDate] = useState(existingAnimal?.farmEntryDate ?? formatDateForStorage(new Date()));
  const [notes, setNotes] = useState(existingAnimal?.notes ?? '');
  const [imageUris, setImageUris] = useState<string[]>(() =>
    filterAccessibleImageUris(existingAnimal?.imageUris),
  );
  const [showImageOnCard, setShowImageOnCard] = useState(
    existingAnimal?.showImageOnCard === true && filterAccessibleImageUris(existingAnimal.imageUris).length > 0,
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showEntryDatePicker, setShowEntryDatePicker] = useState(false);
  const [showSpeciesPicker, setShowSpeciesPicker] = useState(false);
  const [activePicker, setActivePicker] = useState<PickerKey | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const availablePaddocks = useMemo(
    () => paddockEntities.filter((entry) => equalsIgnoreCase(entry.farm, farm)).map((entry) => entry.name),
    [farm, paddockEntities],
  );
  const availableGroups = useMemo(() => groupEntities.map((entry) => entry.name), [groupEntities]);

  useEffect(() => {
    if (openSpeciesPicker === '1') {
      setShowSpeciesPicker(true);
    }
  }, [openSpeciesPicker]);

  useEffect(() => {
    const nextImageUris = filterAccessibleImageUris(existingAnimal?.imageUris);
    setImageUris(nextImageUris);
    setShowImageOnCard(nextImageUris.length > 0 && existingAnimal?.showImageOnCard === true);
  }, [existingAnimal?.uid, existingAnimal?.imageUris, existingAnimal?.showImageOnCard]);

  useEffect(() => {
    if (!existingAnimal) {
      setWeightUnit((current) =>
        current === previousPreferredWeightUnit.current ? preferredWeightUnit : current,
      );
    }

    previousPreferredWeightUnit.current = preferredWeightUnit;
  }, [existingAnimal, preferredWeightUnit]);

  const parsedDateOfBirth = useMemo(() => parseStoredDate(dateOfBirth), [dateOfBirth]);
  const displayedDateOfBirth = useMemo(() => formatDateForDisplay(dateOfBirth, profile.dateFormat), [dateOfBirth, profile.dateFormat]);
  const parsedFarmEntryDate = useMemo(() => parseStoredDate(farmEntryDate), [farmEntryDate]);
  const displayedFarmEntryDate = useMemo(
    () => formatDateForDisplay(farmEntryDate, profile.dateFormat),
    [farmEntryDate, profile.dateFormat],
  );
  const derivedAge = useMemo(() => {
    if (!parsedDateOfBirth) {
      return null;
    }

    return getDerivedAge(parsedDateOfBirth, new Date());
  }, [parsedDateOfBirth]);

  const handleSave = async () => {
    if (saveInProgress.current) {
      return;
    }

    if (!activeSpecies.trim()) {
      Alert.alert('Species required', 'Please select a species first.');
      return;
    }

    if (!animalId.trim()) {
      Alert.alert('Animal ID required', 'Please enter the primary animal ID / tag.');
      return;
    }

    const duplicateTag = animals.some(
      (animal) =>
        animal.uid !== existingAnimal?.uid &&
        animal.id.trim().toLowerCase() === animalId.trim().toLowerCase(),
    );

    if (duplicateTag) {
      Alert.alert(
        'Animal ID already in use',
        'Each animal needs a unique ID / tag. Enter a different one before saving.',
      );
      return;
    }

    if (
      paddock.trim() &&
      !paddockEntities.some(
        (entry) => equalsIgnoreCase(entry.name, paddock) && equalsIgnoreCase(entry.farm, farm),
      )
    ) {
      Alert.alert('Paddock does not match farm', 'Select a paddock belonging to the selected farm.');
      return;
    }

    const derivedAgeParts = parsedDateOfBirth ? getAgeParts(parsedDateOfBirth, new Date()) : null;

    const payload = {
      id: animalId.trim(),
      species: activeSpecies,
      sex: selectedSex,
      name: name.trim(),
      ageValue: derivedAgeParts?.value ?? '',
      ageUnit: derivedAgeParts?.unit ?? ('days old' satisfies AnimalAgeUnit),
      breed: breed.trim(),
      dateOfBirth: dateOfBirth.trim(),
      // Current weight is derived from Weight records once an animal exists;
      // the profile form can only set it at creation time.
      weight: existingAnimal ? existingAnimal.weight : weight.trim(),
      weightUnit: existingAnimal ? existingAnimal.weightUnit : weightUnit,
      // Status is derived from Death/Sale/Purchase records once an animal exists;
      // the profile form can only set it at creation time.
      status: existingAnimal ? existingAnimal.status : status,
      // Location is derived from Movement records once an animal exists;
      // the profile form can only set it at creation time.
      farmUid: existingAnimal
        ? existingAnimal.farmUid
        : farmEntities.find((entry) => equalsIgnoreCase(entry.name, farm))?.uid,
      farm: existingAnimal ? existingAnimal.farm : farm.trim(),
      paddockUid: existingAnimal
        ? existingAnimal.paddockUid
        : paddockEntities.find((entry) => equalsIgnoreCase(entry.name, paddock))?.uid,
      paddock: existingAnimal ? existingAnimal.paddock : paddock.trim(),
      groupUid: groupEntities.find((entry) => equalsIgnoreCase(entry.name, group))?.uid,
      group: group.trim(),
      source,
      farmEntryDate: farmEntryDate.trim(),
      notes: notes.trim(),
      imageUris: imageUris.length > 0 ? imageUris : undefined,
      showImageOnCard: imageUris.length > 0 && showImageOnCard,
    };

    if (existingAnimal) {
      saveInProgress.current = true;
      const result = await updateAnimal(existingAnimal.uid, payload);

      if (!result.ok) {
        saveInProgress.current = false;
        showAnimalMutationError(result.reason);
        return;
      }

      router.dismissTo({
        pathname: '/animal-timeline',
        params: { animalUid: existingAnimal.uid },
      });
    } else {
      if (!isPro && animals.length >= FREE_ANIMAL_LIMIT) {
        router.push({
          pathname: '/upgrade-to-pro',
          params: { limitType: 'animals' },
        });
        return;
      }

      saveInProgress.current = true;
      const result = await addAnimal(payload);

      if (!result.ok) {
        saveInProgress.current = false;
        showAnimalMutationError(result.reason);
        return;
      }

      if (returnToRecordSelector === '1') {
        const selectedUids = new Set(
          (recordSelectorSelectedAnimalIds ?? '').split(',').filter(Boolean),
        );
        selectedUids.add(result.animal.uid);
        router.dismissTo({
          pathname: '/select-record-animal',
          params: {
            selectedAnimalIds: [...selectedUids].join(','),
            ...(recordSelectorRecordId ? { recordId: recordSelectorRecordId } : {}),
            ...(recordSelectorDraftRecord ? { draftRecord: recordSelectorDraftRecord } : {}),
            ...(recordSelectorSource ? { source: recordSelectorSource } : {}),
            ...(recordSelectorRecordType ? { recordType: recordSelectorRecordType } : {}),
            ...(recordSelectorFromFarm ? { fromFarm: recordSelectorFromFarm } : {}),
            ...(recordSelectorFromPaddock ? { fromPaddock: recordSelectorFromPaddock } : {}),
          },
        });
        return;
      }

      router.push({
        pathname: '/(tabs)/animals',
        params: {
          saveReveal: Date.now().toString(),
          saveTarget: 'animals',
          newAnimalUid: result.animal.uid,
        },
      });
    }
  };

  const handleDateChange = (event: DateTimePickerEvent, nextDate?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        setShowDatePicker(false);
        return;
      }

      if (nextDate) {
        setDateOfBirth(formatDateForStorage(nextDate));
      }

      setShowDatePicker(false);
      return;
    }

    if (nextDate) {
      setDateOfBirth(formatDateForStorage(nextDate));
    }
  };

  const handleEntryDateChange = (event: DateTimePickerEvent, nextDate?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        setShowEntryDatePicker(false);
        return;
      }

      if (nextDate) {
        setFarmEntryDate(formatDateForStorage(nextDate));
      }

      setShowEntryDatePicker(false);
      return;
    }

    if (nextDate) {
      setFarmEntryDate(formatDateForStorage(nextDate));
    }
  };

  const handleAddImages = async () => {
    if (imageUris.length >= 1) {
      Alert.alert('Image limit reached', 'You can attach only 1 profile picture.');
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
      const storedUri = await persistAnimalProfileImage(nextUri);
      setImageUris([storedUri]);
    } catch {
      Alert.alert('Image unavailable', 'The selected image could not be saved. Please choose it again.');
    }
  };

  const handleRemoveImage = (uri: string) => {
    setImageUris((current) => current.filter((item) => item !== uri));
    setShowImageOnCard(false);
  };

  const pickerOptions = getPickerOptions(activePicker, farms, availablePaddocks, availableGroups);

  const openSetupScreen = (pathname: '/setup-farms' | '/setup-paddocks' | '/setup-groups') => {
    router.push({
      pathname,
      params: { source: 'add-animal' },
    });
  };

  const handleDeleteAnimal = () => {
    if (!existingAnimal) {
      return;
    }

    setShowDeleteConfirm(true);
  };

  const confirmDeleteAnimal = () => {
    if (!existingAnimal) {
      return;
    }

    setShowDeleteConfirm(false);
    router.replace({
      pathname: '/(tabs)/animals',
      params: { deletingAnimalUid: existingAnimal.uid },
    });
  };

  return (
    <CircularRevealView active={reveal === '1'}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title={existingAnimal ? 'Edit Animal' : 'Add Animal'}
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
        actions={
          existingAnimal
            ? [
                {
                  icon: 'trash',
                  accessibilityLabel: 'Delete animal',
                  onPress: handleDeleteAnimal,
                  size: 28,
                },
              ]
            : []
        }
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.formCard}>
          <View style={styles.block}>
            <Text style={styles.label}>Selected Species *</Text>
            <Pressable
              accessibilityLabel="Select species"
              accessibilityRole="button"
              onPress={() => setShowSpeciesPicker(true)}
              style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
            >
              <View style={styles.fieldWithIcon}>
                <AppIcon name={speciesIcon} size={20} color={tokens.colors.text} />
                <Text style={styles.dateValue}>{activeSpecies}</Text>
              </View>
              <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
            </Pressable>
          </View>

          <DesignField value={animalId} label="Animal ID / Tag *" onChangeText={setAnimalId} />

          <DesignField value={name} label="Name" onChangeText={setName} />

          <View style={styles.block}>
            <Text style={styles.label}>Status *</Text>
            <Pressable
              accessibilityLabel="Select status"
              accessibilityRole="button"
              disabled={Boolean(existingAnimal)}
              onPress={() => {
                if (existingAnimal) {
                  return;
                }

                setActivePicker('status');
              }}
              style={({ pressed }) => [
                styles.dateField,
                Boolean(existingAnimal) && styles.dateFieldDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.dateValue}>{existingAnimal ? existingAnimal.status : status}</Text>
              <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
            </Pressable>
            {existingAnimal ? (
              <Text style={styles.helperText}>
                Status updates automatically from Death, Sale, and Purchase records. Add one of those records to
                change it.
              </Text>
            ) : null}
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>Sex</Text>
            <View style={styles.sexTabs}>
              <SexOption
                label="Female"
                icon="female"
                active={selectedSex === 'female'}
                onPress={() => setSelectedSex('female')}
              />
              <SexOption
                label="Male"
                icon="male"
                active={selectedSex === 'male'}
                onPress={() => setSelectedSex('male')}
              />
            </View>
          </View>

          <DesignField value={breed} label="Breed" onChangeText={setBreed} />

          <View style={styles.block}>
            <Text style={styles.label}>Date of Birth</Text>
            <Pressable
              accessibilityLabel="Select date of birth"
              accessibilityRole="button"
              onPress={() => setShowDatePicker(true)}
              style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
            >
              <Text style={[styles.dateValue, !dateOfBirth && styles.placeholderValue]}>
                {displayedDateOfBirth || 'Select date of birth'}
              </Text>
              <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
            </Pressable>
            {derivedAge ? <Text style={styles.helperText}>Age: {derivedAge}</Text> : null}
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>Acquired Date</Text>
            <Pressable
              accessibilityLabel="Select acquired date"
              accessibilityRole="button"
              onPress={() => setShowEntryDatePicker(true)}
              style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
            >
              <Text style={[styles.dateValue, !farmEntryDate && styles.placeholderValue]}>
                {displayedFarmEntryDate || 'Select acquired date'}
              </Text>
              <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
            </Pressable>
          </View>

          <SelectionField
            label="Source"
            value={source}
            emptyLabel="Select source"
            onPress={() => setActivePicker('source')}
          />

          <View style={styles.inlineRow}>
            <View style={styles.inlineGrow}>
              <DesignField
                value={existingAnimal ? existingAnimal.weight : weight}
                label="Weight"
                onChangeText={existingAnimal ? undefined : setWeight}
                editable={!existingAnimal}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inlineUnit}>
              <View style={styles.block}>
                <Text style={styles.label}>Unit</Text>
                <Pressable
                  accessibilityLabel="Select weight unit"
                  accessibilityRole="button"
                  disabled={Boolean(existingAnimal)}
                  onPress={() => setActivePicker('weightUnit')}
                  style={({ pressed }) => [
                    styles.dateField,
                    Boolean(existingAnimal) && styles.dateFieldDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.dateValue}>{existingAnimal ? existingAnimal.weightUnit : weightUnit}</Text>
                  <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
                </Pressable>
              </View>
            </View>
          </View>
          {existingAnimal ? (
            <Text style={styles.helperText}>
              Weight updates automatically from the animal's Weight records. Add a Weight record to change it.
            </Text>
          ) : null}

          <SelectionField
            label="Farm"
            value={farm}
            disabled={Boolean(existingAnimal)}
            emptyLabel={farms.length === 0 ? 'No farms available' : 'Select farm'}
            onPress={() => {
              if (existingAnimal) {
                return;
              }

              if (farms.length === 0) {
                openSetupScreen('/setup-farms');
                return;
              }

              setActivePicker('farm');
            }}
          />
          {existingAnimal ? null : (
            <View style={styles.helperLinkRow}>
              <BouncyPressable
                accessibilityLabel="Add farm"
                accessibilityRole="button"
                onPress={() => openSetupScreen('/setup-farms')}
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Text style={styles.helperLink}>+ Add Farm</Text>
              </BouncyPressable>
              {farm ? (
                <BouncyPressable
                  accessibilityLabel="Clear farm"
                  accessibilityRole="button"
                  onPress={() => {
                    setFarm('');
                    setPaddock('');
                  }}
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <Text style={styles.helperLink}>Clear Farm</Text>
                </BouncyPressable>
              ) : null}
            </View>
          )}

          <SelectionField
            label="Paddock"
            value={paddock}
            disabled={Boolean(existingAnimal)}
            emptyLabel={!farm ? 'Select farm first' : availablePaddocks.length === 0 ? 'No paddocks for this farm' : 'Select paddock'}
            onPress={() => {
              if (existingAnimal || !farm) {
                return;
              }

              if (availablePaddocks.length === 0) {
                openSetupScreen('/setup-paddocks');
                return;
              }

              setActivePicker('paddock');
            }}
          />
          {existingAnimal ? (
            <Text style={styles.helperText}>
              Farm and paddock update automatically from the animal's Movement records. Add a Movement record to change them.
            </Text>
          ) : null}
          {existingAnimal ? null : (
            <View style={styles.helperLinkRow}>
              <BouncyPressable
                accessibilityLabel="Add paddock"
                accessibilityRole="button"
                onPress={() => openSetupScreen('/setup-paddocks')}
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Text style={styles.helperLink}>+ Add Paddock</Text>
              </BouncyPressable>
              {paddock ? (
                <BouncyPressable
                  accessibilityLabel="Clear paddock"
                  accessibilityRole="button"
                  onPress={() => setPaddock('')}
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <Text style={styles.helperLink}>Clear Paddock</Text>
                </BouncyPressable>
              ) : null}
            </View>
          )}

          <SelectionField
            label="Group"
            value={group}
            emptyLabel={availableGroups.length === 0 ? 'No matching groups available' : 'Select group'}
            onPress={() => {
              if (availableGroups.length === 0) {
                openSetupScreen('/setup-groups');
                return;
              }

              setActivePicker('group');
            }}
          />
          <View style={styles.helperLinkRow}>
            <BouncyPressable
              accessibilityLabel="Add group"
              accessibilityRole="button"
              onPress={() => openSetupScreen('/setup-groups')}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Text style={styles.helperLink}>+ Add Group</Text>
            </BouncyPressable>
            {group ? (
              <BouncyPressable
                accessibilityLabel="Clear group"
                accessibilityRole="button"
                onPress={() => setGroup('')}
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Text style={styles.helperLink}>Clear Group</Text>
              </BouncyPressable>
            ) : null}
          </View>

          <DesignField value={notes} label="Notes" large onChangeText={setNotes} />

          <Pressable
            accessibilityLabel="Add profile picture"
            accessibilityRole="button"
            onPress={handleAddImages}
            style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}
          >
            <View style={styles.photoCopy}>
              <AppIcon name="image-add" size={22} color={tokens.colors.accent} />
              <Text style={styles.photoText}>
                {imageUris.length === 0 ? 'Profile picture' : 'Profile picture 1/1'}
              </Text>
            </View>
            <View style={styles.fieldChevron}>
              <AppIcon name="chevron-right-minimal" size={18} color="#171717" />
            </View>
          </Pressable>
          {imageUris.length > 0 ? (
            <View style={styles.imageOptionsRow}>
              <View style={styles.imageGrid}>
                {imageUris.map((uri) => (
                  <View key={uri} style={styles.imageCard}>
                    <Image
                      source={{ uri }}
                      style={styles.imagePreview}
                      onError={() => handleRemoveImage(uri)}
                    />
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
              <View style={styles.cardImagePreference}>
                <View style={styles.cardImagePreferenceCopy}>
                  <Text style={styles.cardImagePreferenceTitle}>Show image on animal card</Text>
                  <Text style={styles.cardImagePreferenceText}>Otherwise, the species icon will be shown.</Text>
                </View>
                <Switch
                  accessibilityLabel="Show image on animal card"
                  accessibilityRole="switch"
                  ios_backgroundColor="#E5E0E7"
                  onValueChange={setShowImageOnCard}
                  thumbColor="#fff"
                  trackColor={{ false: '#E5E0E7', true: tokens.colors.accent }}
                  value={showImageOnCard}
                />
              </View>
            </View>
          ) : null}
        </View>

      </ScrollView>

      <FloatingActionButton
        accessibilityLabel="Save animal"
        icon="check"
        bottomOffset={insets.bottom + 78}
        onPress={handleSave}
      />

      {showDatePicker && Platform.OS === 'android' ? (
        <DateTimePicker
          mode="date"
          display="default"
          value={parsedDateOfBirth ?? new Date()}
          onChange={handleDateChange}
        />
      ) : null}

      {showEntryDatePicker && Platform.OS === 'android' ? (
        <DateTimePicker
          mode="date"
          display="default"
          value={parsedFarmEntryDate ?? new Date()}
          onChange={handleEntryDateChange}
        />
      ) : null}

      <Modal
        animationType="fade"
        transparent
        visible={showDeleteConfirm}
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <Pressable style={styles.centeredModalBackdrop} onPress={() => setShowDeleteConfirm(false)}>
          <Pressable style={styles.deleteConfirmCard} onPress={() => undefined}>
            <Text style={styles.deleteConfirmTitle}>Delete animal?</Text>
            <Text style={styles.deleteConfirmText}>
              {existingAnimalRecordCount > 0
                ? `This animal has ${existingAnimalRecordCount} ${existingAnimalRecordCount === 1 ? 'record' : 'records'}. They'll stay in your Records list as history, but won't be linked to a live animal anymore. This action cannot be undone.`
                : 'This action cannot be undone.'}
            </Text>
            <View style={styles.deleteConfirmActions}>
              <BouncyPressable
                accessibilityLabel="Cancel delete"
                accessibilityRole="button"
                containerStyle={{ flex: 1 }}
                onPress={() => setShowDeleteConfirm(false)}
                style={({ pressed }) => [styles.deleteCancelButton, pressed && styles.pressed]}
              >
                <Text style={styles.deleteCancelButtonText}>Cancel</Text>
              </BouncyPressable>
              <BouncyPressable
                accessibilityLabel="Confirm delete animal"
                accessibilityRole="button"
                containerStyle={{ flex: 1 }}
                onPress={confirmDeleteAnimal}
                style={({ pressed }) => [styles.deleteConfirmButton, pressed && styles.pressed]}
              >
                <Text style={styles.deleteConfirmButtonText}>Delete</Text>
              </BouncyPressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={showSpeciesPicker}
        onRequestClose={() => setShowSpeciesPicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowSpeciesPicker(false)}>
          <AnimatedPopupCard visible={showSpeciesPicker} style={styles.modalCard} onPress={() => undefined}>
            <View style={styles.speciesModalHeader}>
              <Text style={styles.speciesModalTitle}>Select Species</Text>
              <Pressable
                accessibilityLabel="Close species selector"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setShowSpeciesPicker(false)}
                style={styles.speciesModalClose}
              >
                <AppIcon name="close" size={16} color={tokens.colors.text} />
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
                        setSelectedSpecies(item.label);
                        setShowSpeciesPicker(false);
                      }}
                      style={({ pressed }) => [
                        styles.speciesModalCard,
                        {
                          backgroundColor: theme.chipBackground,
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

      <Modal
        animationType="fade"
        transparent
        visible={showDatePicker && Platform.OS === 'ios'}
        onRequestClose={() => setShowDatePicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowDatePicker(false)}>
          <AnimatedPopupCard visible={showDatePicker && Platform.OS === 'ios'} style={styles.modalCard} onPress={() => undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select date of birth</Text>
              <Pressable
                accessibilityLabel="Done"
                accessibilityRole="button"
                onPress={() => {
                  // Commits whatever date the spinner is currently showing —
                  // onChange only fires once the user actually scrolls a
                  // wheel, so without this, opening the picker on an already-
                  // correct date and tapping Done straight away silently
                  // saved nothing.
                  setDateOfBirth(formatDateForStorage(parsedDateOfBirth ?? new Date()));
                  setShowDatePicker(false);
                }}
              >
                <Text style={styles.modalDone}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              mode="date"
              display="spinner"
              value={parsedDateOfBirth ?? new Date()}
              onChange={handleDateChange}
            />
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={showEntryDatePicker && Platform.OS === 'ios'}
        onRequestClose={() => setShowEntryDatePicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowEntryDatePicker(false)}>
          <AnimatedPopupCard visible={showEntryDatePicker && Platform.OS === 'ios'} style={styles.modalCard} onPress={() => undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select acquired date</Text>
              <Pressable
                accessibilityLabel="Done"
                accessibilityRole="button"
                onPress={() => {
                  setFarmEntryDate(formatDateForStorage(parsedFarmEntryDate ?? new Date()));
                  setShowEntryDatePicker(false);
                }}
              >
                <Text style={styles.modalDone}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              mode="date"
              display="spinner"
              value={parsedFarmEntryDate ?? new Date()}
              onChange={handleEntryDateChange}
            />
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={activePicker !== null}
        onRequestClose={() => setActivePicker(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setActivePicker(null)}>
          <AnimatedPopupCard visible={activePicker !== null} style={styles.selectionCard} onPress={() => undefined}>
            <Text style={styles.selectionTitle}>{getPickerTitle(activePicker)}</Text>
            {pickerOptions.map((option) => {
              const activeValue = getPickerValue(activePicker, status, weightUnit, farm, paddock, group, source);

              return (
                <Pressable
                  key={option}
                  accessibilityLabel={option}
                  accessibilityRole="button"
                  onPress={() => {
                    if (activePicker === 'farm') {
                      setFarm(option);
                      const currentPaddock = paddockEntities.find((entry) => equalsIgnoreCase(entry.name, paddock));
                      // A farm with exactly one paddock has no real choice to
                      // make, so fill it in — still fully editable/clearable
                      // afterward if that's not what the user wants.
                      const matchingPaddocks = paddockEntities.filter((entry) => equalsIgnoreCase(entry.farm, option));

                      if (currentPaddock && !equalsIgnoreCase(currentPaddock.farm, option)) {
                        setPaddock(matchingPaddocks.length === 1 ? matchingPaddocks[0].name : '');
                      } else if (!paddock.trim() && matchingPaddocks.length === 1) {
                        setPaddock(matchingPaddocks[0].name);
                      }
                    } else {
                      applyPickerSelection(option, activePicker, setStatus, setWeightUnit, setFarm, setPaddock, setGroup, setSource);
                    }
                    setActivePicker(null);
                  }}
                  style={({ pressed }) => [
                    styles.selectionRow,
                    option === activeValue && styles.selectionRowActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.selectionText, option === activeValue && styles.selectionTextActive]}>
                    {option}
                  </Text>
                  {option === activeValue ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
                </Pressable>
              );
            })}
          </AnimatedPopupCard>
        </Pressable>
      </Modal>
      </SafeAreaView>
    </CircularRevealView>
  );
}

export default AddAnimalScreen;

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
  formCard: {
    borderRadius: 24,
    backgroundColor: '#F5F3F7',
    padding: 16,
    gap: 14,
  },
  block: {
    gap: 8,
  },
  label: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  helperText: {
    marginTop: -6,
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
  },
  helperLink: {
    color: tokens.colors.accent,
    fontSize: 13,
    fontWeight: '700',
    marginTop: -6,
  },
  helperLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  radioRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sexTabs: {
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
    width: 112,
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
    flex: 1,
    paddingRight: 10,
  },
  dateFieldDisabled: {
    backgroundColor: '#F0EEF1',
  },
  placeholderValue: {
    color: '#7a7a7a',
  },
  fieldWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  fieldChevron: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
  sexOptionTextActive: {},
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
    flexShrink: 0,
  },
  imageOptionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cardImagePreference: {
    flex: 1,
    minHeight: 108,
    justifyContent: 'center',
    gap: 10,
  },
  cardImagePreferenceCopy: {
    gap: 4,
  },
  cardImagePreferenceTitle: {
    color: tokens.colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  cardImagePreferenceText: {
    color: tokens.colors.textSoft,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  imageCard: {
    width: 108,
    height: 108,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F5F3F7',
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
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
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
  },
  pressed: {
    opacity: 0.92,
  },
});

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

type SelectionFieldProps = {
  label: string;
  value: string;
  emptyLabel: string;
  onPress: () => void;
  disabled?: boolean;
};

function SelectionField({ label, value, emptyLabel, onPress, disabled = false }: SelectionFieldProps) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={[styles.dateField, disabled && styles.dateFieldDisabled]}
      >
        <Text style={[styles.dateValue, !value && styles.placeholderValue]}>{value || emptyLabel}</Text>
        <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
      </Pressable>
    </View>
  );
}

function equalsIgnoreCase(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function getDerivedAge(dateOfBirth: Date, now: Date) {
  const ageParts = getAgeParts(dateOfBirth, now);

  if (!ageParts) {
    return null;
  }

  return `${ageParts.value} ${ageParts.unit}`;
}

function getAgeParts(dateOfBirth: Date, now: Date): { value: string; unit: AnimalAgeUnit } | null {
  if (dateOfBirth > now) {
    return null;
  }

  const millisDiff = now.getTime() - dateOfBirth.getTime();
  const totalDays = Math.floor(millisDiff / (1000 * 60 * 60 * 24));
  const totalMonths = (now.getFullYear() - dateOfBirth.getFullYear()) * 12 + (now.getMonth() - dateOfBirth.getMonth());
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

function normalizeAnimalSex(sex: unknown): AnimalSex {
  return sex === 'male' ? 'male' : 'female';
}

function showAnimalMutationError(reason: string) {
  if (reason === 'duplicate-tag') {
    Alert.alert(
      'Animal ID already in use',
      'Each animal needs a unique ID / tag. Enter a different one before saving.',
    );
    return;
  }

  Alert.alert(
    'Animal could not be saved',
    'The animal was left unchanged. Return to the Animals page, reopen it, and try again.',
  );
}

function getPickerTitle(picker: PickerKey | null) {
  switch (picker) {
    case 'status':
      return 'Select status';
    case 'weightUnit':
      return 'Select unit';
    case 'farm':
      return 'Select farm';
    case 'paddock':
      return 'Select paddock';
    case 'group':
      return 'Select group';
    case 'source':
      return 'Select source';
    default:
      return '';
  }
}

function getPickerOptions(picker: PickerKey | null, farms: string[], paddocks: string[], groups: string[]) {
  switch (picker) {
    case 'status':
      return STATUS_OPTIONS;
    case 'weightUnit':
      return WEIGHT_UNITS;
    case 'farm':
      return farms;
    case 'paddock':
      return paddocks;
    case 'group':
      return groups;
    case 'source':
      return SOURCE_OPTIONS;
    default:
      return [];
  }
}

function getPickerValue(
  picker: PickerKey | null,
  status: AnimalStatus,
  weightUnit: AnimalWeightUnit,
  farm: string,
  paddock: string,
  group: string,
  source: AnimalSource | '',
) {
  switch (picker) {
    case 'status':
      return status;
    case 'weightUnit':
      return weightUnit;
    case 'farm':
      return farm;
    case 'paddock':
      return paddock;
    case 'group':
      return group;
    case 'source':
      return source;
    default:
      return '';
  }
}

function applyPickerSelection(
  option: string,
  picker: PickerKey | null,
  setStatus: (value: AnimalStatus) => void,
  setWeightUnit: (value: AnimalWeightUnit) => void,
  setFarm: (value: string) => void,
  setPaddock: (value: string) => void,
  setGroup: (value: string) => void,
  setSource: (value: AnimalSource | '') => void,
) {
  switch (picker) {
    case 'status':
      setStatus(option as AnimalStatus);
      break;
    case 'weightUnit':
      setWeightUnit(option as AnimalWeightUnit);
      break;
    case 'farm':
      setFarm(option);
      break;
    case 'paddock':
      setPaddock(option);
      break;
    case 'group':
      setGroup(option);
      break;
    case 'source':
      setSource(option as AnimalSource);
      break;
  }
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
