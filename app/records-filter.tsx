import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { SPECIES_OPTIONS } from '../src/constants/records';
import { deriveRecordTypeOptions } from '../src/utils/recordTypeOptions';
import { useAccount } from '../src/context/AccountContext';
import { useAnimals } from '../src/context/AnimalsContext';
import {
  DEFAULT_RECORD_FILTERS,
  type RecordFilters,
  type RecordKindFilter,
  useRecords,
} from '../src/context/RecordsContext';
import { useSetup } from '../src/context/SetupContext';
import { tokens } from '../src/theme/tokens';
import { formatDateForDisplay, formatDateForStorage, parseStoredDate } from '../src/utils/dateFormat';
import { SHEET_ENTRANCE_DURATION } from '../src/utils/motion';

type MultiSelectKey = 'species' | 'recordTypes' | 'farms' | 'locations';
type DateFieldKey = 'startDate' | 'endDate';

const FILTER_FIELD_SURFACE = '#F5F3F7';

const KIND_OPTIONS: Array<{ value: RecordKindFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'individual', label: 'Individuals' },
  { value: 'collective', label: 'Herds & flocks' },
];

export default function RecordsFilterScreen() {
  const router = useRouter();
  const { profile } = useAccount();
  const { records, filters, setFilters } = useRecords();
  const { animals } = useAnimals();
  const { farms, locations } = useSetup();
  // Spread over the defaults rather than taken as-is: a filter object built
  // before a newer key existed would otherwise leave that control with no
  // selection at all.
  const [draftFilters, setDraftFilters] = useState<RecordFilters>({
    ...DEFAULT_RECORD_FILTERS,
    ...filters,
  });
  // One value for the three inputs — only one can hold focus at a time.
  const [focusedField, setFocusedField] = useState<'animalId' | 'animalName' | null>(null);
  const [activeMultiSelect, setActiveMultiSelect] = useState<MultiSelectKey | null>(null);
  const [activeDateField, setActiveDateField] = useState<DateFieldKey | null>(null);
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: SHEET_ENTRANCE_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const speciesOptions = useMemo(() => {
    const knownSpecies = new Map(SPECIES_OPTIONS.map((item) => [item.label.toLowerCase(), item.label]));

    for (const animal of animals) {
      if (animal.species.trim()) {
        knownSpecies.set(animal.species.trim().toLowerCase(), animal.species.trim());
      }
    }

    for (const record of records) {
      if (record.species.trim() && record.species.trim().toLowerCase() !== 'mixed') {
        knownSpecies.set(record.species.trim().toLowerCase(), record.species.trim());
      }
    }

    return Array.from(knownSpecies.values());
  }, [animals, records]);

  const recordTypeOptions = useMemo(
    () => deriveRecordTypeOptions(records, draftFilters.recordTypes),
    [draftFilters.recordTypes, records],
  );

  const farmOptions = useMemo(() => {
    const knownFarms = new Map<string, string>();

    for (const farm of farms) {
      if (farm.trim()) {
        knownFarms.set(farm.trim().toLowerCase(), farm.trim());
      }
    }

    for (const animal of animals) {
      if (animal.farm.trim()) {
        knownFarms.set(animal.farm.trim().toLowerCase(), animal.farm.trim());
      }
    }

    return Array.from(knownFarms.values());
  }, [animals, farms]);

  const locationOptions = useMemo(() => {
    const knownLocations = new Map<string, string>();

    for (const location of locations) {
      if (location.trim()) {
        knownLocations.set(location.trim().toLowerCase(), location.trim());
      }
    }

    for (const animal of animals) {
      if (animal.location.trim()) {
        knownLocations.set(animal.location.trim().toLowerCase(), animal.location.trim());
      }
    }

    return Array.from(knownLocations.values());
  }, [animals, locations]);

  const activeDateValue = activeDateField ? parseStoredDate(draftFilters[activeDateField]) ?? new Date() : new Date();

  function updateFilter<Key extends keyof RecordFilters>(key: Key, value: RecordFilters[Key]) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleMultiSelectValue(key: MultiSelectKey, value: string) {
    setDraftFilters((current) => {
      const nextValues = current[key].some((entry) => equalsIgnoreCase(entry, value))
        ? current[key].filter((entry) => !equalsIgnoreCase(entry, value))
        : [...current[key], value];

      return { ...current, [key]: nextValues };
    });
  }

  function handleDateChange(event: DateTimePickerEvent, nextDate?: Date) {
    if (!activeDateField) {
      return;
    }

    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        setActiveDateField(null);
        return;
      }

      if (nextDate) {
        updateFilter(activeDateField, formatDateForStorage(nextDate));
      }

      setActiveDateField(null);
      return;
    }

    if (nextDate) {
      updateFilter(activeDateField, formatDateForStorage(nextDate));
    }
  }

  function applyFilters() {
    setFilters({
      ...draftFilters,
      animalIdQuery: draftFilters.animalIdQuery.trim(),
      animalNameQuery: draftFilters.animalNameQuery.trim(),
    });
    router.back();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <Animated.View
        pointerEvents="none"
        style={[styles.entranceBackdrop, { opacity: entrance }]}
      />
      <Pressable style={styles.overlay} onPress={() => router.back()}>
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
          <Pressable onPress={() => undefined}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderSpacer} />
            <Text style={styles.sheetTitle}>Filter</Text>
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              onPress={() => router.back()}
              style={styles.closeButton}
            >
              <AppIcon name="close" size={22} color="#000" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            <View style={styles.block}>
              <Text style={styles.label}>By Kind</Text>
              <View style={styles.segmentRow}>
                {KIND_OPTIONS.map((option) => {
                  const isSelected = draftFilters.kind === option.value;

                  return (
                    <Pressable
                      key={option.value}
                      accessibilityLabel={option.label}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                      onPress={() => updateFilter('kind', option.value)}
                      style={({ pressed }) => [
                        styles.segment,
                        isSelected && styles.segmentActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.segmentText, isSelected && styles.segmentTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.block}>
              <Text style={styles.label}>By Date</Text>
              <View style={styles.dualRow}>
                <Pressable
                  accessibilityLabel="Select start date"
                  accessibilityRole="button"
                  onPress={() => setActiveDateField('startDate')}
                  style={styles.pickerField}
                >
                  <Text style={[styles.fieldValue, !draftFilters.startDate && styles.placeholderValue]}>
                    {formatDateForDisplay(draftFilters.startDate, profile.dateFormat) || 'Start date'}
                  </Text>
                  <AppIcon name="chevron-down" size={18} color="#7a7a7a" />
                </Pressable>
                <Pressable
                  accessibilityLabel="Select end date"
                  accessibilityRole="button"
                  onPress={() => setActiveDateField('endDate')}
                  style={styles.pickerField}
                >
                  <Text style={[styles.fieldValue, !draftFilters.endDate && styles.placeholderValue]}>
                    {formatDateForDisplay(draftFilters.endDate, profile.dateFormat) || 'End date'}
                  </Text>
                  <AppIcon name="chevron-down" size={18} color="#7a7a7a" />
                </Pressable>
              </View>
            </View>

            <View style={styles.block}>
              <Text style={styles.label}>By Species</Text>
              <Pressable
                accessibilityLabel="Select species"
                accessibilityRole="button"
                onPress={() => setActiveMultiSelect('species')}
                style={styles.pickerField}
              >
                <Text style={[styles.fieldValue, draftFilters.species.length === 0 && styles.placeholderValue]}>
                  {formatSelectionSummary(draftFilters.species, 'Select species')}
                </Text>
                <AppIcon name="chevron-down" size={18} color="#7a7a7a" />
              </Pressable>
            </View>

            <View style={styles.block}>
              <Text style={styles.label}>By Record Type</Text>
              <Pressable
                accessibilityLabel="Select record types"
                accessibilityRole="button"
                onPress={() => setActiveMultiSelect('recordTypes')}
                style={styles.pickerField}
              >
                <Text style={[styles.fieldValue, draftFilters.recordTypes.length === 0 && styles.placeholderValue]}>
                  {formatSelectionSummary(draftFilters.recordTypes, 'Select record types')}
                </Text>
                <AppIcon name="chevron-down" size={18} color="#7a7a7a" />
              </Pressable>
            </View>

            <View style={styles.block}>
              <Text style={styles.label}>By Animal</Text>
              <View style={styles.dualRow}>
                <View
                  style={[styles.searchFieldHalf, focusedField === 'animalId' && styles.searchFieldFocused]}
                >
                  <AppIcon name="search" size={18} color="#6f6f6f" />
                  <TextInput
                    placeholder="Search ID"
                    placeholderTextColor="#7a7a7a"
                    style={styles.searchInput}
                    value={draftFilters.animalIdQuery}
                    onChangeText={(value) => updateFilter('animalIdQuery', value)}
                    onFocus={() => setFocusedField('animalId')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
                <View
                  style={[styles.searchFieldHalf, focusedField === 'animalName' && styles.searchFieldFocused]}
                >
                  <AppIcon name="search" size={18} color="#6f6f6f" />
                  <TextInput
                    placeholder="Search name"
                    placeholderTextColor="#7a7a7a"
                    style={styles.searchInput}
                    value={draftFilters.animalNameQuery}
                    onChangeText={(value) => updateFilter('animalNameQuery', value)}
                    onFocus={() => setFocusedField('animalName')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>
            </View>

            <View style={styles.block}>
              <Text style={styles.label}>By Farm</Text>
              <Pressable
                accessibilityLabel="Select farms"
                accessibilityRole="button"
                onPress={() => setActiveMultiSelect('farms')}
                style={styles.pickerField}
              >
                <Text style={[styles.fieldValue, draftFilters.farms.length === 0 && styles.placeholderValue]}>
                  {formatSelectionSummary(draftFilters.farms, 'Select farm')}
                </Text>
                <AppIcon name="chevron-down" size={18} color="#7a7a7a" />
              </Pressable>
            </View>

            <View style={styles.block}>
              <Text style={styles.label}>By Location</Text>
              <Pressable
                accessibilityLabel="Select locations"
                accessibilityRole="button"
                onPress={() => setActiveMultiSelect('locations')}
                style={styles.pickerField}
              >
                <Text style={[styles.fieldValue, draftFilters.locations.length === 0 && styles.placeholderValue]}>
                  {formatSelectionSummary(draftFilters.locations, 'Select locations')}
                </Text>
                <AppIcon name="chevron-down" size={18} color="#7a7a7a" />
              </Pressable>
            </View>

            <View style={styles.filterActionsRow}>
              <BouncyPressable
                accessibilityLabel="Clear filter"
                accessibilityRole="button"
                containerStyle={{ flex: 1 }}
                onPress={() => setDraftFilters(DEFAULT_RECORD_FILTERS)}
                style={styles.clearFilterButton}
              >
                <Text style={styles.clearFilterText}>Clear filter</Text>
              </BouncyPressable>
              <BouncyPressable
                accessibilityLabel="Apply filter"
                accessibilityRole="button"
                containerStyle={{ flex: 1 }}
                onPress={applyFilters}
                style={styles.applyButton}
              >
                <AppIcon name="check" size={20} color="#fff" />
                <Text style={styles.applyText}>Apply</Text>
              </BouncyPressable>
            </View>
          </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>

      {activeDateField && Platform.OS === 'android' ? (
        <DateTimePicker
          mode="date"
          display="default"
          value={activeDateValue}
          onChange={handleDateChange}
        />
      ) : null}

      <Modal
        animationType="none"
        transparent
        visible={activeDateField !== null && Platform.OS === 'ios'}
        onRequestClose={() => setActiveDateField(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setActiveDateField(null)}>
          <AnimatedPopupCard visible={activeDateField !== null && Platform.OS === 'ios'} style={styles.modalCard} onPress={() => undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeDateField === 'startDate' ? 'Select start date' : 'Select end date'}
              </Text>
              <Pressable
                accessibilityLabel="Done"
                accessibilityRole="button"
                onPress={() => {
                  // Commits whatever date the spinner is currently showing —
                  // onChange only fires once the user actually scrolls a
                  // wheel, so without this, tapping Done on an
                  // already-correct date silently saved nothing.
                  if (activeDateField) {
                    updateFilter(activeDateField, formatDateForStorage(activeDateValue));
                  }
                  setActiveDateField(null);
                }}
              >
                <Text style={styles.modalDone}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              mode="date"
              display="spinner"
              value={activeDateValue}
              onChange={handleDateChange}
            />
          </AnimatedPopupCard>
        </Pressable>
      </Modal>

      <Modal
        animationType="none"
        transparent
        visible={activeMultiSelect !== null}
        onRequestClose={() => setActiveMultiSelect(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setActiveMultiSelect(null)}>
          <AnimatedPopupCard visible={activeMultiSelect !== null} style={styles.selectionCard} onPress={() => undefined}>
            <View style={styles.selectionHeader}>
              <Text style={styles.selectionTitle}>
                {activeMultiSelect === 'species'
                  ? 'Select species'
                  : activeMultiSelect === 'recordTypes'
                    ? 'Select record types'
                    : activeMultiSelect === 'farms'
                      ? 'Select farms'
                      : 'Select locations'}
              </Text>
              <Pressable
                accessibilityLabel="Done"
                accessibilityRole="button"
                onPress={() => setActiveMultiSelect(null)}
              >
                <Text style={styles.modalDone}>Done</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {(
                activeMultiSelect === 'species'
                  ? speciesOptions
                  : activeMultiSelect === 'recordTypes'
                    ? recordTypeOptions
                    : activeMultiSelect === 'farms'
                      ? farmOptions
                      : locationOptions
              ).map((option) => {
                const isSelected = draftFilters[activeMultiSelect ?? 'species'].some((entry) => equalsIgnoreCase(entry, option));

                return (
                  <Pressable
                    key={option}
                    accessibilityLabel={option}
                    accessibilityRole="button"
                    onPress={() => activeMultiSelect && toggleMultiSelectValue(activeMultiSelect, option)}
                    style={({ pressed }) => [
                      styles.selectionRow,
                      isSelected && styles.selectionRowActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.selectionText, isSelected && styles.selectionTextActive]}>{option}</Text>
                    {isSelected ? <AppIcon name="check" size={16} color="#fff" /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </AnimatedPopupCard>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: FILTER_FIELD_SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentActive: { backgroundColor: tokens.colors.accent },
  segmentText: { color: '#544F49', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  segmentTextActive: { color: '#fff' },
  safeArea: { flex: 1, backgroundColor: 'transparent' },
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
    maxHeight: '94%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 10,
  },
  sheetHeaderSpacer: {
    width: 30,
  },
  sheetTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContent: {
    gap: 16,
    paddingBottom: 24,
  },
  block: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.text,
  },
  dualRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pickerField: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: FILTER_FIELD_SURFACE,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  fieldValue: {
    color: '#2b2b2b',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    paddingRight: 12,
  },
  placeholderValue: {
    color: '#7a7a7a',
  },
  searchFieldHalf: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: FILTER_FIELD_SURFACE,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  // Same focus ring DesignField gives every field on the add screens.
  searchFieldFocused: {
    borderColor: tokens.colors.accent,
  },
  searchInput: {
    color: '#2b2b2b',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    paddingVertical: 0,
  },
  helperText: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
  },
  filterActionsRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 12,
  },
  clearFilterButton: {
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: FILTER_FIELD_SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearFilterText: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  applyButton: {
    minHeight: 52,
    borderRadius: 26,
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
  applyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
    maxHeight: '70%',
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  selectionTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  selectionRow: {
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: '#F5F3F7',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
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
  pressed: {
    opacity: 0.92,
  },
});

function formatSelectionSummary(values: string[], placeholder: string) {
  if (values.length === 0) {
    return placeholder;
  }

  if (values.length <= 2) {
    return values.join(', ');
  }

  return `${values.slice(0, 2).join(', ')} +${values.length - 2}`;
}

function equalsIgnoreCase(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
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
