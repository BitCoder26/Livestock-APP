import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text } from '../src/theme/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import DateTimePicker from '../src/components/AppDateTimePicker';
import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { AppIcon, type AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { DesignField } from '../src/components/DesignField';
import { FieldLabel } from '../src/components/FieldLabel';
import { FloatingActionButton } from '../src/components/FloatingActionButton';
import { InfoModal } from '../src/components/InfoModal';
import { InlineDropdown, InlineMultiDropdown } from '../src/components/InlineDropdown';
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
import { TAB_ALIGNED_FAB_BOTTOM_OFFSET, tokens } from '../src/theme/tokens';
import { formatDateForDisplay, formatDateForStorage, parseStoredDate } from '../src/utils/dateFormat';
import { filterAccessibleImageUris, persistCollectiveImage } from '../src/utils/imageStorage';

const SPECIES_ICONS = new Map<string, AppIconName>(SPECIES_OPTIONS.map((item) => [item.label, item.icon]));

const ESTABLISHED_HELP =
  'When the group arrived or was formed on your farm — the day it became yours.\n\n' +
  'This is the date your ownership runs from, which is what an inventory or a movement question is asking about.';

export default function AddCollectiveScreen() {
  const router = useRouter();
  const { collectiveUid } = useLocalSearchParams<{ collectiveUid?: string }>();
  const { collectives, addCollective, updateCollective } = useCollectives();
  const { farms, locationEntities, labelEntities } = useSetup();
  const { profile } = useAccount();

  const existing = useMemo(() => collectives.find((item) => item.uid === collectiveUid), [collectives, collectiveUid]);
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
  const [startingCount, setStartingCount] = useState(existing ? String(getCollectiveCount(existing)) : '');
  const [supplier, setSupplier] = useState(existing?.supplier ?? '');
  const [imageUris, setImageUris] = useState<string[]>(() => filterAccessibleImageUris(existing?.imageUris));
  const [showImageOnCard, setShowImageOnCard] = useState(
    existing?.showImageOnCard === true && filterAccessibleImageUris(existing.imageUris).length > 0,
  );
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [labels, setLabels] = useState<string[]>(existing?.labels ?? []);
  const [showSpeciesPicker, setShowSpeciesPicker] = useState(false);
  const [showEstablishedHelp, setShowEstablishedHelp] = useState(false);
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
  const displayedStartDate = useMemo(
    () => formatDateForDisplay(startDate, profile.dateFormat),
    [startDate, profile.dateFormat],
  );
  const openSetupScreen = (pathname: '/setup-farms' | '/setup-locations' | '/setup-labels') => {
    router.push({ pathname, params: { source: 'add-collective' } });
  };

  const handleFarmSelect = (option: string) => {
    setFarm(option);

    // A farm with exactly one location has no real choice to make, so fill it
    // in; changing farms drops a location that belongs to the old one.
    const matching = locationEntities.filter(
      (entry) => entry.farm.trim().toLowerCase() === option.trim().toLowerCase(),
    );
    const currentBelongs = matching.some((entry) => entry.name.trim().toLowerCase() === location.trim().toLowerCase());

    if (!currentBelongs) {
      setLocation(matching.length === 1 ? matching[0].name : '');
    }
  };

  const makeDateChangeHandler =
    (apply: (value: string) => void, close: () => void) => (event: DateTimePickerEvent, nextDate?: Date) => {
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
      // Kept only for backward compatibility with previously saved groups.
      // A collective may contain animals born or hatched at different times.
      birthDate: existing?.birthDate ?? '',
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
        .map(
          (name) => labelEntities.find((entry) => entry.name.trim().toLowerCase() === name.trim().toLowerCase())?.uid,
        )
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

    const result = isEditing ? await updateCollective(existing.uid, base) : await addCollective(base);

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
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: handleBack,
        }}
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
                  <AppIcon name={SPECIES_ICONS.get(species) ?? 'animals'} size={20} color={tokens.colors.text} />
                ) : null}
                <Text style={[styles.dateValue, !species && styles.placeholderValue]}>
                  {species || 'Select species'}
                </Text>
              </View>
              <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
            </Pressable>
          </View>

          <DesignField value={name} label="Name" placeholder="Layer Flock A" onChangeText={setName} />

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

          <DesignField value={breed} label="Breed or type" placeholder="Lohmann Brown" onChangeText={setBreed} />

          <DesignField
            value={supplier}
            label="Supplier"
            placeholder="Hatchery, market, or keeper"
            onChangeText={setSupplier}
          />

          <View style={styles.block}>
            <FieldLabel label="Farm" addAccessibilityLabel="Add farm" onAddPress={() => openSetupScreen('/setup-farms')} />
            <InlineDropdown
              accessibilityLabel="Farm"
              options={farms}
              value={farm === '' ? null : farm}
              placeholder={farms.length === 0 ? 'No farms available' : 'Select farm'}
              onSelect={handleFarmSelect}
              onEmptyPress={() => openSetupScreen('/setup-farms')}
              onClear={() => {
                setFarm('');
                setLocation('');
              }}
              clearAccessibilityLabel="Clear farm"
            />
          </View>

          <View style={styles.block}>
            <FieldLabel
              label="Location"
              addAccessibilityLabel="Add location"
              onAddPress={() => openSetupScreen('/setup-locations')}
            />
            <InlineDropdown
              accessibilityLabel="Location"
              options={availableLocations}
              value={location === '' ? null : location}
              placeholder={
                !farm
                  ? 'Select farm first'
                  : availableLocations.length === 0
                    ? 'No locations for this farm'
                    : 'Select location'
              }
              onSelect={setLocation}
              // Without a farm there is no list to set up yet, so the field
              // stays inert rather than sending the keeper to Locations.
              onEmptyPress={farm ? () => openSetupScreen('/setup-locations') : undefined}
              onClear={() => setLocation('')}
              clearAccessibilityLabel="Clear location"
            />
          </View>

          <View style={styles.block}>
            <FieldLabel label="Labels" addAccessibilityLabel="Add label" onAddPress={() => openSetupScreen('/setup-labels')} />
            <InlineMultiDropdown
              accessibilityLabel="Labels"
              options={availableLabels}
              selected={labels}
              placeholder={availableLabels.length === 0 ? 'No labels set up yet' : 'Select labels'}
              formatSummary={formatLabelSelection}
              onToggle={(option) =>
                setLabels((current) =>
                  current.includes(option) ? current.filter((entry) => entry !== option) : [...current, option],
                )
              }
              onEmptyPress={() => openSetupScreen('/setup-labels')}
              onClear={() => setLabels([])}
              clearAccessibilityLabel="Clear labels"
            />
          </View>

          <View style={styles.block}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Date established</Text>
              <Pressable
                accessibilityLabel="About date established"
                accessibilityRole="button"
                hitSlop={12}
                onPress={() => setShowEstablishedHelp(true)}
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
              <Text numberOfLines={1} style={[styles.dateValue, !startDate && styles.placeholderValue]}>
                {displayedStartDate || 'Select'}
              </Text>
              <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
            </Pressable>
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
              <Text style={styles.photoText}>{imageUris.length === 0 ? 'Profile picture' : 'Profile picture 1/1'}</Text>
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
                    <Image source={{ uri }} style={styles.imagePreview} onError={() => handleRemoveImage(uri)} />
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
                  <Text style={styles.cardImagePreferenceTitle}>{`Show image on ${term || 'group'} card`}</Text>
                  <Text style={styles.cardImagePreferenceText}>Otherwise, the species icon will be shown.</Text>
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


      <FloatingActionButton
        accessibilityLabel={isEditing ? 'Save changes' : 'Add herd or flock'}
        icon="check"
        bottomOffset={TAB_ALIGNED_FAB_BOTTOM_OFFSET}
        onPress={() => void handleSave()}
      />

      <Modal
        transparent
        animationType="none"
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
                <AppIcon name="close" size={26} color={tokens.colors.text} />
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
                    <Text style={[styles.speciesModalCardLabel, { color: theme.text }]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

      <InfoModal
        visible={showEstablishedHelp}
        onClose={() => setShowEstablishedHelp(false)}
        title="Date established"
        description={ESTABLISHED_HELP}
      />
    </SafeAreaView>
  );
}

function formatLabelSelection(labels: readonly string[]) {
  if (labels.length === 0) {
    return '';
  }

  // Two still fit on one line; beyond that the names are wider than the field.
  return labels.length <= 2 ? labels.join(', ') : `${labels.length} labels selected`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: tokens.colors.background },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 120,
    gap: 14,
  },
  pressed: { opacity: 0.85 },
  // Mirrors add-animal: fields are white pills inside a grey form card, rather
  // than grey inputs sitting directly on the page.
  formCard: {
    borderRadius: 24,
    backgroundColor: '#EFECF0',
    padding: 16,
    gap: 14,
  },
  block: { gap: 8 },
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
    backgroundColor: '#EFECF0',
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
