import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../src/theme/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '../src/components/AppIcon';
import { SPECIES_OPTIONS } from '../src/constants/records';
import { getSpeciesThemeByLabel } from '../src/constants/speciesTheme';
import { useAnimals } from '../src/context/AnimalsContext';
import { useRecords } from '../src/context/RecordsContext';
import { useSetup } from '../src/context/SetupContext';
import { tokens } from '../src/theme/tokens';
import { resolveAnimalFarmName, resolveAnimalLocationName } from '../src/utils/recordLocations';
import { FAST_MOTION_DURATION, SHEET_ENTRANCE_DURATION } from '../src/utils/motion';

type SelectionMode = 'animals' | 'labels';

// Same lookup the herd and flock picker uses, so an animal and the label it
// carries are drawn with the same badge in both pickers.
const SPECIES_ICONS = new Map<string, AppIconName>(SPECIES_OPTIONS.map((item) => [item.label, item.icon]));

export default function SelectRecordAnimalScreen() {
  const router = useRouter();
  const {
    selectedAnimalIds,
    recordId,
    draftRecord,
    source,
    recordType,
    fromFarm,
    fromLocation,
    recordDate,
  } = useLocalSearchParams<{
    selectedAnimalIds?: string;
    recordId?: string;
    draftRecord?: string;
    source?: string;
    recordType?: string;
    fromFarm?: string;
    fromLocation?: string;
    recordDate?: string;
  }>();
  const { animals } = useAnimals();
  const { previewAnimalLocationAsOf } = useRecords();
  // A Weight record stores one shared value for every animal attached to it,
  // so selecting more than one animal would silently give them all the same
  // weight. Restrict it to a single animal.
  const isSingleAnimalRecord = recordType === 'Weight';
  const { labels, farmEntities, locationEntities } = useSetup();
  const initialIds = useMemo(
    () => (selectedAnimalIds ? selectedAnimalIds.split(',').filter(Boolean) : []),
    [selectedAnimalIds],
  );
  const [draftIds, setDraftIds] = useState<string[]>(initialIds);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('animals');
  const [focusedLabel, setFocusedLabel] = useState<string | null>(null);
  const entrance = useRef(new Animated.Value(0)).current;
  const isClosing = useRef(false);
  const availableLabels = useMemo(
    () =>
      Array.from(
        new Set(
          [...labels, ...animals.flatMap((animal) => animal.labels)]
            .map((label) => label.trim())
            .filter(Boolean),
        ),
      ),
    [animals, labels],
  );

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: SHEET_ENTRANCE_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  useEffect(() => {
    setDraftIds(initialIds);
  }, [initialIds]);

  const toggleAnimal = (animalUid: string) => {
    if (isSingleAnimalRecord) {
      setDraftIds((current) => (current.includes(animalUid) ? [] : [animalUid]));
      return;
    }

    setDraftIds((current) =>
      current.includes(animalUid)
        ? current.filter((uid) => uid !== animalUid)
        : [...current, animalUid],
    );
  };

  const getAnimalsWithLabel = (label: string) =>
    animals.filter((animal) =>
      animal.labels.some((entry) => entry.trim().toLowerCase() === label.toLowerCase()),
    );

  const visibleAnimals = focusedLabel ? getAnimalsWithLabel(focusedLabel) : animals;

  const getLabelLocations = (label: string) =>
    Array.from(
      new Set(
        getAnimalsWithLabel(label).map(
          (animal) => `${animal.farm.trim().toLowerCase()}|${animal.location.trim().toLowerCase()}`,
        ),
      ),
    );

  const hasFromLocation = recordType === 'Movement' && Boolean(fromFarm?.trim());
  const isAnimalAtFromLocation = (animal: (typeof animals)[number]) => {
    if (!hasFromLocation) {
      return true;
    }

    // Mirrors handleSave's date-aware check exactly (same function, same
    // record date, same excluded record when editing) so the picker never
    // blocks a selection that saving would actually allow — only a real,
    // dated Movement record that contradicts the chosen From location
    // disqualifies an animal here.
    const locationAsOf = previewAnimalLocationAsOf(animal.uid, recordDate ?? '', recordId);

    if (locationAsOf.status !== 'found') {
      return true;
    }

    return (
      equalsIgnoreCase(locationAsOf.farm, fromFarm ?? '') &&
      (!fromLocation?.trim() || !locationAsOf.location.trim() || equalsIgnoreCase(locationAsOf.location, fromLocation))
    );
  };
  const isAnimalEligibleForRecord = (animal: (typeof animals)[number]) => {
    // Movement is exempt: an animal that's since been Sold or marked
    // Deceased can still get a backdated Movement logged for a date while
    // it was genuinely still Active and on the farm.
    if (
      recordType === 'Death' ||
      recordType === 'Sale' ||
      recordType === 'Weight' ||
      recordType === 'Vaccination' ||
      recordType === 'Medication' ||
      recordType === 'Health Check'
    ) {
      return animal.status === 'Active';
    }
    if (recordType === 'Purchase') {
      return animal.status !== 'Deceased';
    }
    return true;
  };

  const toggleLabel = (label: string) => {
    const labelAnimalIds = getAnimalsWithLabel(label).map((animal) => animal.uid);

    if (labelAnimalIds.length === 0) {
      return;
    }

    const hasAnimalsOutsideFromLocation = labelAnimalIds.some((id) => {
      const animal = animals.find((entry) => entry.uid === id);
      return animal ? !isAnimalAtFromLocation(animal) : false;
    });
    const hasIneligibleAnimals = labelAnimalIds.some((id) => {
      const animal = animals.find((entry) => entry.uid === id);
      return animal ? !isAnimalEligibleForRecord(animal) : false;
    });

    if (
      hasIneligibleAnimals ||
      (recordType === 'Movement' && (getLabelLocations(label).length > 1 || hasAnimalsOutsideFromLocation))
    ) {
      setFocusedLabel(label);
      setSelectionMode('animals');
      return;
    }

    setDraftIds((current) => {
      const allSelected = labelAnimalIds.every((id) => current.includes(id));

      if (allSelected) {
        const labelIds = new Set(labelAnimalIds);
        return current.filter((id) => !labelIds.has(id));
      }

      return Array.from(new Set([...current, ...labelAnimalIds]));
    });
  };

  const returnToRecordForm = () => {
    if (isClosing.current) {
      return;
    }

    isClosing.current = true;
    entrance.stopAnimation();
    Animated.timing(entrance, {
      toValue: 0,
      duration: FAST_MOTION_DURATION,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      router.dismissTo({
        pathname: recordId ? '/edit-record' : '/add-record',
        params: {
          selectedAnimalIds: draftIds.join(','),
          ...(recordId ? { recordId } : {}),
          ...(draftRecord ? { draftRecord } : {}),
          ...(source === 'add-record' ? { reveal: '1' } : {}),
        },
      });
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <Animated.View pointerEvents="none" style={[styles.entranceBackdrop, { opacity: entrance }]} />
      <Pressable style={styles.overlay} onPress={returnToRecordForm}>
        <Animated.View
          style={[
            styles.sheet,
            {
              opacity: entrance.interpolate({
                inputRange: [0, 0.28, 1],
                outputRange: [0, 1, 1],
              }),
              transform: [
                {
                  translateY: entrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [140, 0],
                  }),
                },
                {
                  scale: entrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.985, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable onPress={() => undefined} style={styles.sheetInner}>
            <View style={styles.sheetHeader}>
              <View style={styles.headerActionSlot} />
              <Text style={styles.sheetTitle}>{isSingleAnimalRecord ? 'Select Animal' : 'Select Animals'}</Text>
              <Pressable
                accessibilityLabel={`Confirm ${draftIds.length} selected animals`}
                accessibilityRole="button"
                onPress={returnToRecordForm}
                style={({ pressed }) => [styles.headerDoneButton, pressed && styles.pressed]}
              >
                <Text style={styles.headerDoneText}>Done</Text>
              </Pressable>
            </View>

            {isSingleAnimalRecord ? null : (
              <View style={styles.modeToggle}>
                {(['animals', 'labels'] as const).map((mode) => {
                  const active = selectionMode === mode;

                  return (
                    <Pressable
                      key={mode}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        // Manually switching tabs is a deliberate "start
                        // fresh" action — don't leave a stale label focus
                        // (set automatically when a problematic label was
                        // tapped) silently filtering the Animals tab.
                        setFocusedLabel(null);
                        setSelectionMode(mode);
                      }}
                      style={({ pressed }) => [
                        styles.modeButton,
                        active && styles.modeButtonActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>
                        {mode === 'animals' ? 'Animals' : 'Labels'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {focusedLabel && selectionMode === 'animals' ? (
              <View style={styles.focusedLabelRow}>
                <Text style={styles.focusedLabelText}>{`Animals in ${focusedLabel}`}</Text>
                <Pressable accessibilityRole="button" onPress={() => setFocusedLabel(null)}>
                  <Text style={styles.showAllText}>Show all</Text>
                </Pressable>
              </View>
            ) : null}

            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.sheetContent}
              showsVerticalScrollIndicator={false}
            >
              {animals.length === 0 ? (
                <View style={styles.emptyState}>
                  <AppIcon name="animals" size={86} color="#E5E0E7" opacity={1} />
                  <Text style={styles.emptyTitle}>No animals available</Text>
                  <Text style={styles.emptyText}>Close this and tap + Add under the animal field.</Text>
                </View>
              ) : selectionMode === 'labels' && availableLabels.length === 0 ? (
                <View style={styles.emptyState}>
                  <AppIcon name="group" size={72} color="#E5E0E7" opacity={1} />
                  <Text style={styles.emptyTitle}>No labels available</Text>
                  <Text style={styles.emptyText}>Add labels to animals from their animal profile.</Text>
                </View>
              ) : (
                <>
                  {selectionMode === 'animals'
                    ? visibleAnimals.map((animal) => {
                        const isSelected = draftIds.includes(animal.uid);
                        const isAtFromLocation = isAnimalAtFromLocation(animal);
                        const isEligible = isAnimalEligibleForRecord(animal);
                        const cannotAdd = (!isAtFromLocation || !isEligible) && !isSelected;

                        return (
                          <Pressable
                            key={animal.uid}
                            accessibilityLabel={`Select ${animal.name}`}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: isSelected, disabled: cannotAdd }}
                            disabled={cannotAdd}
                            onPress={() => toggleAnimal(animal.uid)}
                            style={({ pressed }) => [
                              styles.card,
                              isSelected && styles.cardActive,
                              cannotAdd && styles.cardDisabled,
                              pressed && styles.pressed,
                            ]}
                          >
                            <View
                              style={[
                                styles.speciesIconBadge,
                                { backgroundColor: getSpeciesThemeByLabel(animal.species).chipBackground },
                              ]}
                            >
                              <AppIcon
                                name={SPECIES_ICONS.get(animal.species) ?? 'animals'}
                                size={20}
                                color={getSpeciesThemeByLabel(animal.species).icon}
                              />
                            </View>
                            <View style={styles.cardCopy}>
                              {/* Tag first — it is what identifies the animal
                                  on paper — with the name in brackets only
                                  where one was given. The species is already
                                  said by the badge to the left. */}
                              <Text style={styles.cardTitle}>
                                {animal.name.trim() ? `${animal.id} (${animal.name.trim()})` : animal.id}
                              </Text>
                              <Text style={[styles.cardMeta, !isAtFromLocation && styles.locationMismatch]}>
                                {formatAnimalLocation(
                                  resolveAnimalFarmName(animal, farmEntities),
                                  resolveAnimalLocationName(animal, locationEntities),
                                )}
                                {!isAtFromLocation ? ' • Not at From location' : ''}
                                {!isEligible ? ` • ${animal.status}` : ''}
                              </Text>
                            </View>
                            {isSelected ? <AppIcon name="check" size={18} color={tokens.colors.accent} /> : null}
                          </Pressable>
                        );
                      })
                    : availableLabels.map((label) => {
                        const labelAnimals = getAnimalsWithLabel(label);
                        const selectedCount = labelAnimals.filter((animal) => draftIds.includes(animal.uid)).length;
                        const allSelected = labelAnimals.length > 0 && selectedCount === labelAnimals.length;
                        const hasMixedLocations = recordType === 'Movement' && getLabelLocations(label).length > 1;
                        const hasAnimalsOutsideFromLocation = labelAnimals.some((animal) => !isAnimalAtFromLocation(animal));
                        const hasIneligibleAnimals = labelAnimals.some((animal) => !isAnimalEligibleForRecord(animal));

                        return (
                          <Pressable
                            key={label}
                            accessibilityLabel={`Select label ${label}`}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: allSelected, disabled: labelAnimals.length === 0 }}
                            disabled={labelAnimals.length === 0}
                            onPress={() => toggleLabel(label)}
                            style={({ pressed }) => [
                              styles.card,
                              allSelected && styles.cardActive,
                              labelAnimals.length === 0 && styles.cardDisabled,
                              pressed && styles.pressed,
                            ]}
                          >
                            <View style={[styles.speciesIconBadge, styles.labelIconBadge]}>
                              <AppIcon name="group" size={20} color="#7E4542" />
                            </View>
                            <View style={styles.cardCopy}>
                              <Text style={styles.cardTitle}>{label}</Text>
                              <Text style={styles.cardMeta}>
                                {labelAnimals.length === 0
                                  ? 'No animals assigned'
                                  : hasIneligibleAnimals
                                    ? `${labelAnimals.length} animals • Some statuses require individual selection`
                                  : hasMixedLocations
                                    ? `${labelAnimals.length} animals • Mixed locations — choose individually`
                                    : hasAnimalsOutsideFromLocation
                                      ? `${labelAnimals.length} ${labelAnimals.length === 1 ? 'animal' : 'animals'} • Not at From location`
                                    : `${labelAnimals.length} ${labelAnimals.length === 1 ? 'animal' : 'animals'}${
                                      selectedCount > 0 && !allSelected ? ` • ${selectedCount} selected` : ''
                                    }`}
                              </Text>
                            </View>
                            {allSelected ? <AppIcon name="check" size={18} color={tokens.colors.accent} /> : null}
                          </Pressable>
                        );
                      })}
                </>
              )}
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  entranceBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 26,
    maxHeight: '86%',
  },
  sheetInner: {
    flexShrink: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 10,
  },
  sheetTitle: {
    flex: 1,
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerActionSlot: {
    width: 64,
  },
  headerDoneButton: {
    minHeight: 36,
    width: 64,
    borderRadius: 18,
    backgroundColor: tokens.colors.accent,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDoneText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  listScroll: {
    flexShrink: 1,
  },
  sheetContent: {
    gap: 12,
    paddingBottom: 24,
  },
  modeToggle: {
    flexDirection: 'row',
    borderRadius: 24,
    backgroundColor: '#EFECF0',
    padding: 4,
    marginBottom: 12,
  },
  modeButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    backgroundColor: tokens.colors.accent,
  },
  modeButtonText: {
    color: '#777178',
    fontSize: 15,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  focusedLabelRow: {
    minHeight: 36,
    paddingHorizontal: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  focusedLabelText: {
    flex: 1,
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  showAllText: {
    color: tokens.colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 24,
    gap: 16,
  },
  emptyTitle: {
    color: '#8A8A8A',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    color: '#777178',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  card: {
    minHeight: 62,
    borderRadius: 18,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    // Always bordered — subtle at rest, accent when selected — so the card
    // never changes size on selection and shifts the rest of the list.
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  cardActive: {
    backgroundColor: '#FCE5E4',
    borderColor: '#E79D99',
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardCopy: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  cardMeta: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '500',
  },
  // Matches the herd and flock picker's badge: a rounded square in the
  // species colour, not a circle.
  speciesIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  // A label has no species of its own — it can span several — so it takes the
  // neutral accent tint rather than any one species' colour.
  labelIconBadge: {
    backgroundColor: '#FCE5E4',
  },
  locationMismatch: {
    color: '#B94F4A',
  },
  pressed: {
    opacity: 0.9,
  },
});

function equalsIgnoreCase(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function formatAnimalLocation(farm: string, location: string) {
  return [farm.trim(), location.trim()].filter(Boolean).join(' • ') || 'Location not set';
}
