import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { AppIcon, type AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { DesignField } from '../src/components/DesignField';
import { FloatingActionButton } from '../src/components/FloatingActionButton';
import { InfoModal } from '../src/components/InfoModal';
import { SPECIES_OPTIONS } from '../src/constants/records';
import { getSpeciesThemeByLabel } from '../src/constants/speciesTheme';
import { useAccount } from '../src/context/AccountContext';
import { useCollectives } from '../src/context/CollectivesContext';
import { useSetup } from '../src/context/SetupContext';
import type { AnimalWeightUnit } from '../src/entities/animal';
import {
  COLLECTIVE_GENERIC_LABEL,
  collectiveIdLabelForSpecies,
  collectiveTermForSpecies,
  getCollectiveCount,
} from '../src/entities/collective';
import { tokens } from '../src/theme/tokens';
import { formatDateForDisplay, formatDateForStorage, parseStoredDate } from '../src/utils/dateFormat';
import { filterAccessibleImageUris, persistCollectiveImage } from '../src/utils/imageStorage';

const SPECIES_ICONS = new Map<string, AppIconName>(
  SPECIES_OPTIONS.map((item) => [item.label, item.icon]),
);

type PickerKey = 'farm' | 'location' | 'label';

const ESTABLISHED_HELP =
  'When the group arrived or was formed on your farm — the day it became yours.\n\n' +
  'This is the date your ownership runs from, which is what an inventory or a movement question is asking about.';

const BORN_OR_HATCHED_HELP =
  'When the animals themselves were born or hatched.\n\n' +
  'Fill it in only when it differs from the date established. Point-of-lay pullets hatched in March and bought in July have two different dates, and it is the hatch date that tells you how old they are.';

export default function AddCollectiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { collectiveUid } = useLocalSearchParams<{ collectiveUid?: string }>();
  const { collectives, addCollective, updateCollective } = useCollectives();
  const { farms, locationEntities, labelEntities } = useSetup();
  const { profile } = useAccount();

  const existing = useMemo(
    () => collectives.find((item) => item.uid === collectiveUid),
    [collectives, collectiveUid],
  );
  const isEditing = !!existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [reference, setReference] = useState(existing?.id ?? '');
  const [species, setSpecies] = useState(existing?.species ?? '');
  const [breed, setBreed] = useState(existing?.breed ?? '');
  const [farm, setFarm] = useState(existing?.farm ?? '');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? '');
  const [purpose, setPurpose] = useState(existing?.purpose ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [startingCount, setStartingCount] = useState(
    existing ? String(getCollectiveCount(existing)) : '',
  );
  const [birthDate, setBirthDate] = useState(existing?.birthDate ?? '');
  const [supplier, setSupplier] = useState(existing?.supplier ?? '');
  const [imageUris, setImageUris] = useState<string[]>(() =>
    filterAccessibleImageUris(existing?.imageUris),
  );
  const [showImageOnCard, setShowImageOnCard] = useState(
    existing?.showImageOnCard === true && filterAccessibleImageUris(existing.imageUris).length > 0,
  );
  const [activePicker, setActivePicker] = useState<PickerKey | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showBirthDatePicker, setShowBirthDatePicker] = useState(false);
  const [labels, setLabels] = useState<string[]>(existing?.labels ?? []);
  const [showSpeciesPicker, setShowSpeciesPicker] = useState(false);
  const [datesHelp, setDatesHelp] = useState<'established' | 'birth' | null>(null);
  const [saving, setSaving] = useState(false);

  // "flock" once poultry is picked, "herd" for cattle and pigs, "batch" for
  // anything without an everyday collective noun.
  const term = species ? collectiveTermForSpecies(species) : '';
  // The verb leads, so the bar says what the screen does rather than just
  // naming the thing: "Add Chicken flock", not "Chicken flock". The generic
  // label is sentence-cased down since it is no longer starting the title.
  const heading = species
    ? `Add ${species} ${term}`
    : `Add ${COLLECTIVE_GENERIC_LABEL.charAt(0).toLowerCase()}${COLLECTIVE_GENERIC_LABEL.slice(1)}`;

  // Locations belong to a farm, so the list narrows once one is chosen — the
  // same relationship Add Animal enforces.
  const availableLocations = useMemo(
    () =>
      locationEntities
        .filter((entry) => entry.farm.trim().toLowerCase() === farm.trim().toLowerCase())
        .map((entry) => entry.name),
    [farm, locationEntities],
  );
  const availableLabels = useMemo(() => labelEntities.map((entry) => entry.name), [labelEntities]);
  const parsedStartDate = useMemo(() => parseStoredDate(startDate), [startDate]);
  const parsedBirthDate = useMemo(() => parseStoredDate(birthDate), [birthDate]);
  const displayedStartDate = useMemo(
    () => formatDateForDisplay(startDate, profile.dateFormat),
    [startDate, profile.dateFormat],
  );
  const displayedBirthDate = useMemo(
    () => formatDateForDisplay(birthDate, profile.dateFormat),
    [birthDate, profile.dateFormat],
  );
  const pickerOptions =
    activePicker === 'farm'
      ? farms
      : activePicker === 'location'
        ? availableLocations
        : activePicker === 'label'
          ? availableLabels
          : [];
  const pickerValue =
    activePicker === 'farm'
      ? farm
      : activePicker === 'location'
        ? location
        : '';

  const openSetupScreen = (pathname: '/setup-farms' | '/setup-locations' | '/setup-labels') => {
    router.push({ pathname, params: { source: 'add-collective' } });
  };

  const makeDateChangeHandler =
    (apply: (value: string) => void, close: () => void) =>
    (event: DateTimePickerEvent, nextDate?: Date) => {
      if (Platform.OS === 'android') {
        if (event.type === 'dismissed') {
          close();
          return;
        }

        if (nextDate) {
          apply(formatDateForStorage(nextDate));
        }

        close();
        return;
      }

      if (nextDate) {
        apply(formatDateForStorage(nextDate));
      }
    };

  const handleStartDateChange = makeDateChangeHandler(setStartDate, () => setShowStartDatePicker(false));
  const handleBirthDateChange = makeDateChangeHandler(setBirthDate, () => setShowBirthDatePicker(false));

  useEffect(() => {
    const nextImageUris = filterAccessibleImageUris(existing?.imageUris);
    setImageUris(nextImageUris);
    setShowImageOnCard(nextImageUris.length > 0 && existing?.showImageOnCard === true);
  }, [existing?.uid, existing?.imageUris, existing?.showImageOnCard]);

  const handleAddImage = async () => {
    if (imageUris.length >= 1) {
      Alert.alert('Image limit reached', 'You can attach only 1 profile picture.');
      return;
    }

    // No permission request first — launchImageLibraryAsync presents the system
    // photo picker out of process and hands back only the chosen image, so the
    // app never needs library access (Expo SDK 57). See add-animal.tsx for the
    // longer version of why asking anyway was actively harmful.
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
      const storedUri = await persistCollectiveImage(nextUri);
      setImageUris([storedUri]);
    } catch {
      Alert.alert('Image unavailable', 'The selected image could not be saved. Please choose it again.');
    }
  };

  const handleRemoveImage = (uri: string) => {
    setImageUris((current) => current.filter((item) => item !== uri));
    setShowImageOnCard(false);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/animals');
  };

  async function handleSave() {
    if (saving) {
      return;
    }

    if (!species) {
      Alert.alert('Species needed', 'Choose which species this group is.');
      return;
    }

    if (!reference.trim()) {
      Alert.alert(
        `${collectiveIdLabelForSpecies(species)} needed`,
        `Give this ${term} a flock mark, batch number or other ID so you can identify it.`,
      );
      return;
    }

    const parsedCount = Number.parseInt(startingCount.trim(), 10);

    if (!isEditing && (!Number.isFinite(parsedCount) || parsedCount < 0)) {
      Alert.alert('How many?', 'Enter how many animals this group starts with.');
      return;
    }

    setSaving(true);

    const base = {
      id: reference.trim(),
      name: name.trim(),
      species,
      breed: breed.trim(),
      status: existing?.status ?? ('Active' as const),
      farm: farm.trim(),
      location: location.trim(),
      startDate: startDate.trim(),
      birthDate: birthDate.trim(),
      supplier: supplier.trim(),
      // No longer collected here — a flock's weight and what it cost are
      // recorded as dated Weight and Purchase records instead. Existing values
      // are carried through untouched rather than blanked.
      cost: existing?.cost ?? '',
      averageWeight: existing?.averageWeight ?? '',
      weightUnit: existing?.weightUnit ?? 'kg',
      endDate: existing?.endDate ?? '',
      purpose: purpose.trim(),
      notes: notes.trim(),
      labelUids: labels
        .map((name) => labelEntities.find((entry) => entry.name.trim().toLowerCase() === name.trim().toLowerCase())?.uid)
        .filter((uid): uid is string => !!uid),
      labels: labels.map((name) => name.trim()).filter(Boolean),
      imageUris: imageUris.length > 0 ? imageUris : undefined,
      showImageOnCard: imageUris.length > 0 && showImageOnCard,
      // Editing never rewrites history: the count is only ever changed by
      // adding a dated event from the detail screen.
      countEvents: existing?.countEvents ?? [
        {
          id: `cev-${Date.now()}`,
          date: startDate.trim() || new Date().toISOString().slice(0, 10),
          delta: parsedCount,
          reason: 'Established' as const,
          notes: '',
        },
      ],
    };

    const result = isEditing
      ? await updateCollective(existing.uid, base)
      : await addCollective(base);

    setSaving(false);

    if (!result.ok) {
      Alert.alert('Could not save', result.message);
      return;
    }

    handleBack();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title={isEditing ? `Edit ${term || 'group'}` : heading}
        leftAction={{ icon: 'back', accessibilityLabel: 'Back', onPress: handleBack }}
        // Nothing in the bar: deleting lives on the view screen's three-dot
        // menu, and help sits on the field it explains rather than up here.
        actions={[]}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.formCard}>
          <View style={styles.block}>
            <Text style={styles.label}>Species *</Text>
            <Pressable
              accessibilityLabel="Choose species"
              accessibilityRole="button"
              onPress={() => setShowSpeciesPicker(true)}
              style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
            >
              <View style={styles.fieldWithIcon}>
                {species ? (
                  <AppIcon
                    name={SPECIES_ICONS.get(species) ?? 'animals'}
                    size={20}
                    color={tokens.colors.text}
                  />
                ) : null}
                <Text style={[styles.dateValue, !species && styles.placeholderValue]}>
                  {species || 'Select species'}
                </Text>
              </View>
              <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
            </Pressable>
          </View>

          <DesignField
            value={name}
            label="Name"
            placeholder="Layer Flock A"
            onChangeText={setName}
          />

          <DesignField
            value={reference}
            label={`${species ? collectiveIdLabelForSpecies(species) : 'Group ID'} *`}
            placeholder="Flock mark or batch number"
            onChangeText={setReference}
          />

          <DesignField
            value={startingCount}
            label={isEditing ? 'Head count' : 'How many animals *'}
            placeholder="600"
            keyboardType="number-pad"
            editable={!isEditing}
            onChangeText={setStartingCount}
          />
          {isEditing ? (
            <Text style={styles.helperText}>
              Change this from the herd or flock itself, by recording what changed and when.
            </Text>
          ) : null}

          <DesignField
            value={breed}
            label="Breed or type"
            placeholder="Lohmann Brown"
            onChangeText={setBreed}
          />

          <DesignField
            value={supplier}
            label="Supplier"
            placeholder="Hatchery, market, or keeper"
            onChangeText={setSupplier}
          />

          <SelectionField
            label="Farm"
            value={farm}
            emptyLabel={farms.length === 0 ? 'No farms available' : 'Select farm'}
            onPress={() => {
              if (farms.length === 0) {
                openSetupScreen('/setup-farms');
                return;
              }

              setActivePicker('farm');
            }}
          />
          <View style={styles.helperLinkRow}>
            <BouncyPressable
              accessibilityLabel="Add farm"
              accessibilityRole="button"
              onPress={() => openSetupScreen('/setup-farms')}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Text style={styles.helperLink}>+ Add</Text>
            </BouncyPressable>
            {farm ? (
              <BouncyPressable
                accessibilityLabel="Clear farm"
                accessibilityRole="button"
                onPress={() => {
                  setFarm('');
                  setLocation('');
                }}
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Text style={styles.helperLink}>Clear</Text>
              </BouncyPressable>
            ) : null}
          </View>

          <SelectionField
            label="Location"
            value={location}
            emptyLabel={
              !farm
                ? 'Select farm first'
                : availableLocations.length === 0
                  ? 'No locations for this farm'
                  : 'Select location'
            }
            onPress={() => {
              if (!farm) {
                return;
              }

              if (availableLocations.length === 0) {
                openSetupScreen('/setup-locations');
                return;
              }

              setActivePicker('location');
            }}
          />
          <View style={styles.helperLinkRow}>
            <BouncyPressable
              accessibilityLabel="Add location"
              accessibilityRole="button"
              onPress={() => openSetupScreen('/setup-locations')}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Text style={styles.helperLink}>+ Add</Text>
            </BouncyPressable>
            {location ? (
              <BouncyPressable
                accessibilityLabel="Clear location"
                accessibilityRole="button"
                onPress={() => setLocation('')}
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Text style={styles.helperLink}>Clear</Text>
              </BouncyPressable>
            ) : null}
          </View>

          <SelectionField
            label="Labels"
            value={formatLabelSelection(labels)}
            emptyLabel={availableLabels.length === 0 ? 'No labels set up yet' : 'Select labels'}
            onPress={() => {
              if (availableLabels.length === 0) {
                openSetupScreen('/setup-labels');
                return;
              }

              setActivePicker('label');
            }}
          />
          <View style={styles.helperLinkRow}>
            <BouncyPressable
              accessibilityLabel="Add label"
              accessibilityRole="button"
              onPress={() => openSetupScreen('/setup-labels')}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Text style={styles.helperLink}>+ Add</Text>
            </BouncyPressable>
            {labels.length > 0 ? (
              <BouncyPressable
                accessibilityLabel="Clear labels"
                accessibilityRole="button"
                onPress={() => setLabels([])}
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Text style={styles.helperLink}>Clear</Text>
              </BouncyPressable>
            ) : null}
          </View>

          {/* Side by side: the two dates are the same kind of answer and are
              usually filled together, and at half width each they still hold a
              formatted date without truncating. */}
          <View style={styles.dateRow}>
            <View style={styles.dateRowHalf}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Date established</Text>
                <Pressable
                  accessibilityLabel="About date established"
                  accessibilityRole="button"
                  hitSlop={12}
                  onPress={() => setDatesHelp('established')}
                  style={({ pressed }) => [styles.labelInfoButton, pressed && styles.pressed]}
                >
                  <AppIcon name="info" size={15} color={tokens.colors.textSoft} />
                </Pressable>
              </View>
              <Pressable
                accessibilityLabel="Select date established"
                accessibilityRole="button"
                onPress={() => setShowStartDatePicker(true)}
                style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.dateValue, !startDate && styles.placeholderValue]}
                >
                  {displayedStartDate || 'Select'}
                </Text>
                <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
              </Pressable>
            </View>
            <View style={styles.dateRowHalf}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Born or hatched</Text>
                <Pressable
                  accessibilityLabel="About born or hatched"
                  accessibilityRole="button"
                  hitSlop={12}
                  onPress={() => setDatesHelp('birth')}
                  style={({ pressed }) => [styles.labelInfoButton, pressed && styles.pressed]}
                >
                  <AppIcon name="info" size={15} color={tokens.colors.textSoft} />
                </Pressable>
              </View>
              <Pressable
                accessibilityLabel="Select date born or hatched"
                accessibilityRole="button"
                onPress={() => setShowBirthDatePicker(true)}
                style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.dateValue, !birthDate && styles.placeholderValue]}
                >
                  {displayedBirthDate || 'Select'}
                </Text>
                <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
              </Pressable>
            </View>
          </View>
          <DesignField
            value={purpose}
            label="Purpose"
            placeholder="Laying, fattening, breeding"
            onChangeText={setPurpose}
          />

          <DesignField
            value={notes}
            label="Notes"
            placeholder="Anything worth remembering"
            large
            onChangeText={setNotes}
          />

          <Pressable
            accessibilityLabel="Add profile picture"
            accessibilityRole="button"
            onPress={() => void handleAddImage()}
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
                  <Text style={styles.cardImagePreferenceTitle}>
                    {`Show image on ${term || 'group'} card`}
                  </Text>
                  <Text style={styles.cardImagePreferenceText}>
                    Otherwise, the species icon will be shown.
                  </Text>
                </View>
                <Switch
                  style={styles.cardImagePreferenceSwitch}
                  accessibilityLabel={`Show image on ${term || 'group'} card`}
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

      {showStartDatePicker && Platform.OS === 'android' ? (
        <DateTimePicker
          mode="date"
          display="default"
          value={parsedStartDate ?? new Date()}
          onChange={handleStartDateChange}
        />
      ) : null}

      {showBirthDatePicker && Platform.OS === 'android' ? (
        <DateTimePicker
          mode="date"
          display="default"
          value={parsedBirthDate ?? new Date()}
          onChange={handleBirthDateChange}
        />
      ) : null}

      <Modal
        animationType="none"
        transparent
        visible={showStartDatePicker && Platform.OS === 'ios'}
        onRequestClose={() => setShowStartDatePicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowStartDatePicker(false)}>
          <AnimatedPopupCard
            visible={showStartDatePicker && Platform.OS === 'ios'}
            style={styles.modalCard}
            onPress={() => undefined}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select date established</Text>
              <Pressable
                accessibilityLabel="Done"
                accessibilityRole="button"
                onPress={() => {
                  // Commits whatever the spinner currently shows — onChange
                  // only fires once a wheel is actually scrolled, so without
                  // this, opening on an already-correct date and tapping Done
                  // saves nothing.
                  setStartDate(formatDateForStorage(parsedStartDate ?? new Date()));
                  setShowStartDatePicker(false);
                }}
              >
                <Text style={styles.modalDone}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              mode="date"
              display="spinner"
              value={parsedStartDate ?? new Date()}
              onChange={handleStartDateChange}
            />
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

      <Modal
        animationType="none"
        transparent
        visible={showBirthDatePicker && Platform.OS === 'ios'}
        onRequestClose={() => setShowBirthDatePicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowBirthDatePicker(false)}>
          <AnimatedPopupCard
            visible={showBirthDatePicker && Platform.OS === 'ios'}
            style={styles.modalCard}
            onPress={() => undefined}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select date born or hatched</Text>
              <Pressable
                accessibilityLabel="Done"
                accessibilityRole="button"
                onPress={() => {
                  setBirthDate(formatDateForStorage(parsedBirthDate ?? new Date()));
                  setShowBirthDatePicker(false);
                }}
              >
                <Text style={styles.modalDone}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              mode="date"
              display="spinner"
              value={parsedBirthDate ?? new Date()}
              onChange={handleBirthDateChange}
            />
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

      <Modal
        animationType="none"
        transparent
        visible={activePicker !== null}
        onRequestClose={() => setActivePicker(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setActivePicker(null)}>
          <AnimatedPopupCard
            visible={activePicker !== null}
            style={styles.selectionCard}
            onPress={() => undefined}
          >
            <Text style={styles.selectionTitle}>
              {activePicker === 'farm'
                ? 'Select farm'
                : activePicker === 'location'
                  ? 'Select location'
                  : 'Select labels'}
            </Text>
            {pickerOptions.map((option) => {
              // Labels are the one multi-select picker here — a group can carry
              // several — so the row toggles and the sheet stays open.
              const isLabelPicker = activePicker === 'label';
              const active = isLabelPicker ? labels.includes(option) : option === pickerValue;

              return (
              <Pressable
                key={option}
                accessibilityLabel={option}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  if (isLabelPicker) {
                    setLabels((current) =>
                      current.includes(option)
                        ? current.filter((entry) => entry !== option)
                        : [...current, option],
                    );
                    return;
                  }

                  if (activePicker === 'farm') {
                    setFarm(option);

                    // A farm with exactly one location has no real choice to
                    // make, so fill it in; changing farms drops a location that
                    // belongs to the old one.
                    const matching = locationEntities.filter(
                      (entry) => entry.farm.trim().toLowerCase() === option.trim().toLowerCase(),
                    );
                    const currentBelongs = matching.some(
                      (entry) => entry.name.trim().toLowerCase() === location.trim().toLowerCase(),
                    );

                    if (!currentBelongs) {
                      setLocation(matching.length === 1 ? matching[0].name : '');
                    }
                  } else if (activePicker === 'location') {
                    setLocation(option);
                  }

                  setActivePicker(null);
                }}
                style={({ pressed }) => [
                  styles.selectionRow,
                  active && styles.selectionRowActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.selectionText, active && styles.selectionTextActive]}>
                  {option}
                </Text>
                {active ? <AppIcon name="check" size={16} color="#fff" /> : null}
              </Pressable>
              );
            })}
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

      <FloatingActionButton
        accessibilityLabel={isEditing ? 'Save changes' : 'Add herd or flock'}
        icon="check"
        bottomOffset={insets.bottom + 78}
        onPress={() => void handleSave()}
      />

      <Modal
        transparent
        animationType="none"
        visible={showSpeciesPicker}
        onRequestClose={() => setShowSpeciesPicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowSpeciesPicker(false)}>
          <AnimatedPopupCard
            visible={showSpeciesPicker}
            style={styles.modalCard}
            onPress={() => undefined}
          >
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
              {SPECIES_OPTIONS.map((item) => {
                const theme = getSpeciesThemeByLabel(item.label);

                return (
                  <Pressable
                    key={item.label}
                    accessibilityRole="button"
                    onPress={() => {
                      setSpecies(item.label);
                      setShowSpeciesPicker(false);
                    }}
                    style={({ pressed }) => [
                      styles.speciesModalCard,
                      { backgroundColor: theme.chipBackground },
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppIcon name={item.icon} size={26} color={theme.icon} />
                    <Text style={[styles.speciesModalCardLabel, { color: theme.text }]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

      <InfoModal
        visible={datesHelp !== null}
        onClose={() => setDatesHelp(null)}
        title={datesHelp === 'birth' ? 'Born or hatched' : 'Date established'}
        description={datesHelp === 'birth' ? BORN_OR_HATCHED_HELP : ESTABLISHED_HELP}
      />

    </SafeAreaView>
  );
}

function formatLabelSelection(labels: string[]) {
  if (labels.length === 0) {
    return '';
  }

  // Two still fit on one line; beyond that the names are wider than the field.
  return labels.length <= 2 ? labels.join(', ') : `${labels.length} labels selected`;
}

function SelectionField({
  label,
  value,
  emptyLabel,
  onPress,
}: {
  label: string;
  value: string;
  emptyLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        onPress={onPress}
        style={styles.dateField}
      >
        <Text style={[styles.dateValue, !value && styles.placeholderValue]}>{value || emptyLabel}</Text>
        <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: tokens.colors.background },
  content: { paddingHorizontal: 26, paddingTop: 16, paddingBottom: 120, gap: 14 },
  pressed: { opacity: 0.85 },
  // Mirrors add-animal: fields are white pills inside a grey form card, rather
  // than grey inputs sitting directly on the page.
  formCard: {
    borderRadius: 24,
    backgroundColor: '#F5F3F7',
    padding: 16,
    gap: 14,
  },
  block: { gap: 8 },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  // The info sits with the label it explains rather than under the pair, so a
  // half-width column carries only its own explanation.
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  labelInfoButton: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // flexBasis 0 with equal grow, so both halves are exactly half the row
  // whatever their content — a wider formatted date on one side cannot push
  // the other narrower.
  dateRowHalf: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
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
  placeholderValue: { color: '#7a7a7a' },
  fieldWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
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
    backgroundColor: tokens.colors.accent,
  },
  selectionText: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  selectionTextActive: {
    color: '#fff',
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
  fieldChevron: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageOptionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  imageGrid: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    flexShrink: 0,
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
  cardImagePreference: {
    flex: 1,
    minHeight: 108,
    justifyContent: 'center',
    gap: 10,
  },
  cardImagePreferenceCopy: {
    gap: 4,
  },
  cardImagePreferenceSwitch: {
    alignSelf: 'flex-start',
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
  // Copied from add-animal: a bottom sheet with no height cap. The centred,
  // maxHeight-capped card this replaced clipped the final row of species.
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
  speciesModalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 18,
    paddingBottom: 12,
  },
  speciesModalCard: {
    width: '48%',
    minHeight: 74,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingLeft: 24,
    paddingRight: 14,
  },
  speciesModalCardLabel: { fontSize: 15, fontWeight: '500' },
});
