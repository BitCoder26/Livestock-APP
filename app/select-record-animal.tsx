import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { useAnimals } from '../src/context/AnimalsContext';
import { useRecords } from '../src/context/RecordsContext';
import { useSetup } from '../src/context/SetupContext';
import { tokens } from '../src/theme/tokens';
import { resolveAnimalFarmName, resolveAnimalPaddockName } from '../src/utils/recordLocations';
import { motionDuration } from '../src/utils/motion';

type SelectionMode = 'animals' | 'groups';

export default function SelectRecordAnimalScreen() {
  const router = useRouter();
  const {
    selectedAnimalIds,
    recordId,
    draftRecord,
    source,
    recordType,
    fromFarm,
    fromPaddock,
    recordDate,
  } = useLocalSearchParams<{
    selectedAnimalIds?: string;
    recordId?: string;
    draftRecord?: string;
    source?: string;
    recordType?: string;
    fromFarm?: string;
    fromPaddock?: string;
    recordDate?: string;
  }>();
  const { animals } = useAnimals();
  const { previewAnimalLocationAsOf } = useRecords();
  // A Weight record stores one shared value for every animal attached to it,
  // so selecting more than one animal would silently give them all the same
  // weight. Restrict it to a single animal.
  const isSingleAnimalRecord = recordType === 'Weight';
  const { groups, farmEntities, paddockEntities } = useSetup();
  const initialIds = useMemo(
    () => (selectedAnimalIds ? selectedAnimalIds.split(',').filter(Boolean) : []),
    [selectedAnimalIds],
  );
  const [draftIds, setDraftIds] = useState<string[]>(initialIds);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('animals');
  const [focusedGroup, setFocusedGroup] = useState<string | null>(null);
  const entrance = useRef(new Animated.Value(0)).current;
  const isClosing = useRef(false);
  const availableGroups = useMemo(
    () =>
      Array.from(
        new Set(
          [...groups, ...animals.map((animal) => animal.group)]
            .map((group) => group.trim())
            .filter(Boolean),
        ),
      ),
    [animals, groups],
  );

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: motionDuration(380),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  useEffect(() => {
    setDraftIds(initialIds);
  }, [initialIds]);

  const handleAddAnimal = () => {
    router.push({
      pathname: '/add-animal',
      params: {
        returnToRecordSelector: '1',
        recordSelectorSelectedAnimalIds: draftIds.join(','),
        ...(recordId ? { recordSelectorRecordId: recordId } : {}),
        ...(draftRecord ? { recordSelectorDraftRecord: draftRecord } : {}),
        ...(source ? { recordSelectorSource: source } : {}),
        ...(recordType ? { recordSelectorRecordType: recordType } : {}),
        ...(fromFarm ? { recordSelectorFromFarm: fromFarm } : {}),
        ...(fromPaddock ? { recordSelectorFromPaddock: fromPaddock } : {}),
      },
    });
  };

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

  const getAnimalsInGroup = (group: string) =>
    animals.filter((animal) => animal.group.trim().toLowerCase() === group.toLowerCase());

  const visibleAnimals = focusedGroup ? getAnimalsInGroup(focusedGroup) : animals;

  const getGroupLocations = (group: string) =>
    Array.from(
      new Set(
        getAnimalsInGroup(group).map(
          (animal) => `${animal.farm.trim().toLowerCase()}|${animal.paddock.trim().toLowerCase()}`,
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
      (!fromPaddock?.trim() || !locationAsOf.paddock.trim() || equalsIgnoreCase(locationAsOf.paddock, fromPaddock))
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

  const toggleGroup = (group: string) => {
    const groupAnimalIds = getAnimalsInGroup(group).map((animal) => animal.uid);

    if (groupAnimalIds.length === 0) {
      return;
    }

    const hasAnimalsOutsideFromLocation = groupAnimalIds.some((id) => {
      const animal = animals.find((entry) => entry.uid === id);
      return animal ? !isAnimalAtFromLocation(animal) : false;
    });
    const hasIneligibleAnimals = groupAnimalIds.some((id) => {
      const animal = animals.find((entry) => entry.uid === id);
      return animal ? !isAnimalEligibleForRecord(animal) : false;
    });

    if (
      hasIneligibleAnimals ||
      (recordType === 'Movement' && (getGroupLocations(group).length > 1 || hasAnimalsOutsideFromLocation))
    ) {
      setFocusedGroup(group);
      setSelectionMode('animals');
      return;
    }

    setDraftIds((current) => {
      const allSelected = groupAnimalIds.every((id) => current.includes(id));

      if (allSelected) {
        const groupIds = new Set(groupAnimalIds);
        return current.filter((id) => !groupIds.has(id));
      }

      return Array.from(new Set([...current, ...groupAnimalIds]));
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
      duration: 280,
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
                {(['animals', 'groups'] as const).map((mode) => {
                  const active = selectionMode === mode;

                  return (
                    <Pressable
                      key={mode}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        // Manually switching tabs is a deliberate "start
                        // fresh" action — don't leave a stale group focus
                        // (set automatically when a problematic group was
                        // tapped) silently filtering the Animals tab.
                        setFocusedGroup(null);
                        setSelectionMode(mode);
                      }}
                      style={({ pressed }) => [
                        styles.modeButton,
                        active && styles.modeButtonActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>
                        {mode === 'animals' ? 'Animals' : 'Groups'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {recordType === 'Purchase' && selectionMode === 'animals' ? (
              <BouncyPressable
                accessibilityLabel="Add new purchased animal"
                accessibilityRole="button"
                onPress={handleAddAnimal}
                style={({ pressed }) => [styles.addAnimalAction, pressed && styles.pressed]}
              >
                <AppIcon name="plus" size={17} color="#7E4542" />
                <Text style={styles.addAnimalActionText}>Add new animal</Text>
              </BouncyPressable>
            ) : null}

            {focusedGroup && selectionMode === 'animals' ? (
              <View style={styles.focusedGroupRow}>
                <Text style={styles.focusedGroupText}>{`Animals in ${focusedGroup}`}</Text>
                <Pressable accessibilityRole="button" onPress={() => setFocusedGroup(null)}>
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
                  <BouncyPressable
                    accessibilityLabel="Add animal"
                    accessibilityRole="button"
                    onPress={handleAddAnimal}
                    style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
                  >
                    <AppIcon name="plus" size={16} color="#fff" />
                    <Text style={styles.addButtonText}>Add Animal</Text>
                  </BouncyPressable>
                </View>
              ) : selectionMode === 'groups' && availableGroups.length === 0 ? (
                <View style={styles.emptyState}>
                  <AppIcon name="group" size={72} color="#E5E0E7" opacity={1} />
                  <Text style={styles.emptyTitle}>No groups available</Text>
                  <Text style={styles.emptyText}>Assign animals to a group from their animal profile.</Text>
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
                            <View style={styles.cardCopy}>
                              <Text style={styles.cardTitle}>
                                {animal.id} • {animal.species}
                              </Text>
                              <Text style={styles.cardMeta}>{animal.name.trim() || 'Unnamed'}</Text>
                              <Text style={[styles.locationMeta, !isAtFromLocation && styles.locationMismatch]}>
                                {formatAnimalLocation(
                                  resolveAnimalFarmName(animal, farmEntities),
                                  resolveAnimalPaddockName(animal, paddockEntities),
                                )}
                                {!isAtFromLocation ? ' • Not at From location' : ''}
                                {!isEligible ? ` • ${animal.status}` : ''}
                              </Text>
                            </View>
                            {isSelected ? <AppIcon name="check" size={18} color={tokens.colors.accent} /> : null}
                          </Pressable>
                        );
                      })
                    : availableGroups.map((group) => {
                        const groupAnimals = getAnimalsInGroup(group);
                        const selectedCount = groupAnimals.filter((animal) => draftIds.includes(animal.uid)).length;
                        const allSelected = groupAnimals.length > 0 && selectedCount === groupAnimals.length;
                        const hasMixedLocations = recordType === 'Movement' && getGroupLocations(group).length > 1;
                        const hasAnimalsOutsideFromLocation = groupAnimals.some((animal) => !isAnimalAtFromLocation(animal));
                        const hasIneligibleAnimals = groupAnimals.some((animal) => !isAnimalEligibleForRecord(animal));

                        return (
                          <Pressable
                            key={group}
                            accessibilityLabel={`Select group ${group}`}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: allSelected, disabled: groupAnimals.length === 0 }}
                            disabled={groupAnimals.length === 0}
                            onPress={() => toggleGroup(group)}
                            style={({ pressed }) => [
                              styles.card,
                              allSelected && styles.cardActive,
                              groupAnimals.length === 0 && styles.cardDisabled,
                              pressed && styles.pressed,
                            ]}
                          >
                            <View style={styles.cardCopy}>
                              <Text style={styles.cardTitle}>{group}</Text>
                              <Text style={styles.cardMeta}>
                                {groupAnimals.length === 0
                                  ? 'No animals assigned'
                                  : hasIneligibleAnimals
                                    ? `${groupAnimals.length} animals • Some statuses require individual selection`
                                  : hasMixedLocations
                                    ? `${groupAnimals.length} animals • Mixed locations — choose individually`
                                    : hasAnimalsOutsideFromLocation
                                      ? `${groupAnimals.length} ${groupAnimals.length === 1 ? 'animal' : 'animals'} • Not at From location`
                                    : `${groupAnimals.length} ${groupAnimals.length === 1 ? 'animal' : 'animals'}${
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
    backgroundColor: '#F5F3F7',
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
    backgroundColor: '#FCE5E4',
  },
  modeButtonText: {
    color: '#777178',
    fontSize: 15,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#7E4542',
    fontWeight: '700',
  },
  addAnimalAction: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#FCE5E4',
    paddingHorizontal: 18,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addAnimalActionText: {
    color: '#7E4542',
    fontSize: 15,
    fontWeight: '700',
  },
  focusedGroupRow: {
    minHeight: 36,
    paddingHorizontal: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  focusedGroupText: {
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
  addButton: {
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: tokens.colors.accent,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    minHeight: 72,
    borderRadius: 18,
    backgroundColor: '#F5F3F7',
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    // Border is always present, just invisible (matches the card's own
    // background) until active — keeps the card the same size either way
    // instead of growing and shifting the rest of the layout on selection.
    borderWidth: 1,
    borderColor: '#F5F3F7',
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
    gap: 5,
  },
  cardTitle: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cardMeta: {
    color: '#5E5E5E',
    fontSize: 13,
    fontWeight: '500',
  },
  locationMeta: {
    color: '#777178',
    fontSize: 12,
    fontWeight: '500',
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

function formatAnimalLocation(farm: string, paddock: string) {
  return [farm.trim(), paddock.trim()].filter(Boolean).join(' • ') || 'Location not set';
}
