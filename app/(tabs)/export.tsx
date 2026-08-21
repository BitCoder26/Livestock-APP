import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../../src/components/AppIcon';
import { AppTopBar } from '../../src/components/AppTopBar';
import { FabSpeedDial } from '../../src/components/FabSpeedDial';
import { PlanLimitGate } from '../../src/components/PlanLimitGate';
import { AnimatedPopupCard } from '../../src/components/AnimatedPopupCard';
import { BouncyPressable } from '../../src/components/BouncyPressable';
import { TabSwipeView } from '../../src/components/TabSwipeView';
import { DesignField } from '../../src/components/DesignField';
import { SPECIES_OPTIONS } from '../../src/constants/records';
import { deriveRecordTypeOptions } from '../../src/utils/recordTypeOptions';
import { getSpeciesThemeByLabel } from '../../src/constants/speciesTheme';
import { FREE_EXPORT_LIMIT } from '../../src/constants/subscription';
import { useAccount } from '../../src/context/AccountContext';
import { useAnimals } from '../../src/context/AnimalsContext';
import { useCollectives } from '../../src/context/CollectivesContext';
import { useRecords } from '../../src/context/RecordsContext';
import { useSubscription } from '../../src/context/SubscriptionContext';
import {
  collectiveTermForSpecies,
  describeCollectiveCount,
  getCollectiveCount,
  type Collective,
  type CollectiveStatus,
} from '../../src/entities/collective';
import { type FarmEntity, type LabelEntity, type LocationEntity, useSetup } from '../../src/context/SetupContext';
import type { AccountProfile } from '../../src/entities/account';
import type { Animal, AnimalStatus } from '../../src/entities/animal';
import type { RecordEntry } from '../../src/entities/record';
import type { AppIconName } from '../../src/components/AppIcon';
import { tokens } from '../../src/theme/tokens';
import { formatDateForDisplay, formatDateForStorage, parseStoredDate } from '../../src/utils/dateFormat';
import { buildPdfDocument, createPdfFile, escapeHtml, resolveBusinessBranding, sharePdf } from '../../src/utils/pdfExport';
import { findRecordAnimals, resolveRecordDisplayNames, resolveRecordDisplayTags } from '../../src/utils/recordAnimals';
import {
  getRecordDisplayTitle,
  resolveAnimalFarmName,
  resolveAnimalLabelNames,
  resolveAnimalLocationName,
  resolveFarmName,
  resolveLocationName,
} from '../../src/utils/recordLocations';

type ExportTarget = 'animals' | 'records' | 'collectives';
type ExportFormat = 'pdf' | 'spreadsheet';
type DateFieldKey = 'startDate' | 'endDate';
type MultiSelectKey = 'statuses' | 'species' | 'recordTypes' | 'farms' | 'locations' | 'labels';

type AnimalExportFilters = {
  searchQuery: string;
  statuses: string[];
  species: string[];
  farms: string[];
  locations: string[];
  labels: string[];
};

type CollectiveExportFilters = {
  searchQuery: string;
  statuses: string[];
  species: string[];
  farms: string[];
  locations: string[];
  labels: string[];
};

type RecordExportFilters = {
  searchQuery: string;
  startDate: string | null;
  endDate: string | null;
  species: string[];
  recordTypes: string[];
  farms: string[];
  locations: string[];
};

const STATUS_OPTIONS: AnimalStatus[] = ['Active', 'Sold', 'Deceased'];
const COLLECTIVE_STATUS_OPTIONS: CollectiveStatus[] = ['Active', 'Inactive'];

const DEFAULT_ANIMAL_FILTERS: AnimalExportFilters = {
  searchQuery: '',
  statuses: [],
  species: [],
  farms: [],
  locations: [],
  labels: [],
};

const DEFAULT_COLLECTIVE_FILTERS: CollectiveExportFilters = {
  searchQuery: '',
  statuses: [],
  species: [],
  farms: [],
  locations: [],
  labels: [],
};

const DEFAULT_RECORD_FILTERS: RecordExportFilters = {
  searchQuery: '',
  startDate: null,
  endDate: null,
  species: [],
  recordTypes: [],
  farms: [],
  locations: [],
};

export default function ExportScreen() {
  const router = useRouter();
  const { previewPdf, previewTarget } = useLocalSearchParams<{ previewPdf?: string; previewTarget?: string }>();
  const { profile, updateField } = useAccount();
  const { animals } = useAnimals();
  const { records } = useRecords();
  const { collectives } = useCollectives();
  const { farms, farmEntities, locations, locationEntities, labels, labelEntities } = useSetup();
  const { isPro } = useSubscription();
  const [target, setTarget] = useState<ExportTarget>('records');
  const [animalFilters, setAnimalFilters] = useState<AnimalExportFilters>(DEFAULT_ANIMAL_FILTERS);
  const [recordFilters, setRecordFilters] = useState<RecordExportFilters>(DEFAULT_RECORD_FILTERS);
  const [collectiveFilters, setCollectiveFilters] =
    useState<CollectiveExportFilters>(DEFAULT_COLLECTIVE_FILTERS);
  const [activeDateField, setActiveDateField] = useState<DateFieldKey | null>(null);
  const [activeMultiSelect, setActiveMultiSelect] = useState<MultiSelectKey | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [showMoreAnimalFilters, setShowMoreAnimalFilters] = useState(false);
  const [showMoreCollectiveFilters, setShowMoreCollectiveFilters] = useState(false);
  const [showMoreRecordFilters, setShowMoreRecordFilters] = useState(false);
  const hasAutoPreviewed = useRef(false);

  const availableSpecies = useMemo(
    () => getAvailableSpecies(animals, records),
    [animals, records],
  );
  const availableFarms = useMemo(() => uniqueValues([...farms, ...animals.map((animal) => animal.farm)]), [animals, farms]);
  const availableLocations = useMemo(
    () => uniqueValues([...locations, ...animals.map((animal) => animal.location)]),
    [animals, locations],
  );
  const availableLabels = useMemo(
    () => uniqueValues([...labels, ...animals.flatMap((animal) => animal.labels)]),
    [animals, labels],
  );
  const recordTypeOptions = useMemo(
    () => deriveRecordTypeOptions(records, recordFilters.recordTypes),
    [recordFilters.recordTypes, records],
  );

  const filteredAnimals = useMemo(
    () => animals.filter((animal) => animalMatchesFilters(animal, animalFilters)),
    [animalFilters, animals],
  );
  const filteredCollectives = useMemo(
    () => collectives.filter((collective) => collectiveMatchesFilters(collective, collectiveFilters)),
    [collectiveFilters, collectives],
  );
  const filteredRecords = useMemo(() => {
    const lookup = buildAnimalLookup(animals);
    return records.filter((record) => recordMatchesFilters(record, recordFilters, animals, lookup));
  }, [animals, recordFilters, records]);

  const selectedDate = useMemo(() => {
    const value = activeDateField === 'startDate' ? recordFilters.startDate : recordFilters.endDate;
    return parseStoredDate(value) ?? new Date();
  }, [activeDateField, recordFilters.endDate, recordFilters.startDate]);

  const multiSelectOptions = useMemo(() => {
    switch (activeMultiSelect) {
      case 'statuses':
        return target === 'collectives' ? [...COLLECTIVE_STATUS_OPTIONS] : [...STATUS_OPTIONS];
      case 'species':
        return availableSpecies;
      case 'recordTypes':
        return recordTypeOptions;
      case 'farms':
        return availableFarms;
      case 'locations':
        return availableLocations;
      case 'labels':
        return availableLabels;
      default:
        return [];
    }
  }, [activeMultiSelect, availableFarms, availableLabels, availableLocations, availableSpecies, target]);

  const currentCount =
    target === 'animals'
      ? filteredAnimals.length
      : target === 'collectives'
        ? filteredCollectives.length
        : filteredRecords.length;
  const currentNoun =
    target === 'animals' ? 'animals' : target === 'collectives' ? 'herds or flocks' : 'records';
  const exportsUsed = profile.exportsUsed ?? 0;
  const currentSummary =
    target === 'animals'
      ? getAnimalFilterSummary(animalFilters)
      : target === 'collectives'
        ? getCollectiveFilterSummary(collectiveFilters)
        : getRecordFilterSummary(recordFilters, profile.dateFormat);

  useEffect(() => {
    if (previewTarget === 'animals') {
      setTarget('animals');
    } else if (previewTarget === 'records') {
      setTarget('records');
    } else if (previewTarget === 'collectives') {
      setTarget('collectives');
    }
  }, [previewTarget]);

  useEffect(() => {
    if (previewPdf !== '1' || hasAutoPreviewed.current) {
      return;
    }

    hasAutoPreviewed.current = true;

    const runPreview = async () => {
      try {
        const uri =
          previewTarget === 'animals'
            ? await createAnimalsPdf(filteredAnimals, animalFilters, profile, farmEntities, locationEntities, labelEntities)
            : previewTarget === 'collectives'
              ? await createCollectivesPdf(filteredCollectives, collectiveFilters, profile)
              : await createRecordsPdf(filteredRecords, animals, recordFilters, profile, farmEntities, locationEntities);

        await Linking.openURL(uri);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Something went wrong while preparing the export.';
        Alert.alert('Export failed', message);
      }
    };

    void runPreview();
  }, [
    animalFilters,
    animals,
    farmEntities,
    filteredAnimals,
    filteredRecords,
    labelEntities,
    locationEntities,
    previewPdf,
    previewTarget,
    profile.dateFormat,
    recordFilters,
  ]);

  async function handleExport(format: ExportFormat) {
    if (exportingFormat) {
      return;
    }

    const sharingAvailable = await Sharing.isAvailableAsync();

    if (!sharingAvailable) {
      Alert.alert('Sharing unavailable', 'This device cannot open the share sheet right now.');
      return;
    }

    if (currentCount === 0) {
      Alert.alert('Nothing to export', `There are no ${currentNoun} matching these filters yet.`);
      return;
    }

    // Basic's second cap. Checked before any work is done so the paywall is
    // what the user meets, not a share sheet they are then charged for.
    if (!isPro && exportsUsed >= FREE_EXPORT_LIMIT) {
      router.push({
        pathname: '/upgrade-to-pro',
        params: { limitType: 'exports' },
      });
      return;
    }

    setExportingFormat(format);

    try {
      if (target === 'animals') {
        if (format === 'pdf') {
          const uri = await createAnimalsPdf(filteredAnimals, animalFilters, profile, farmEntities, locationEntities, labelEntities);
          await sharePdf(uri);
        } else {
          await exportAnimalsCsv(filteredAnimals, profile.dateFormat, farmEntities, locationEntities, labelEntities);
        }
      } else if (target === 'collectives') {
        if (format === 'pdf') {
          const uri = await createCollectivesPdf(filteredCollectives, collectiveFilters, profile);
          await sharePdf(uri);
        } else {
          // Two files: the register, and the dated count history the head
          // counts are derived from. One sheet cannot hold both without
          // repeating every group on every count change.
          await exportCollectivesCsv(filteredCollectives, profile.dateFormat);
          await exportCollectiveCountEventsCsv(filteredCollectives, profile.dateFormat);
        }
      } else if (format === 'pdf') {
        const uri = await createRecordsPdf(filteredRecords, animals, recordFilters, profile, farmEntities, locationEntities);
        await sharePdf(uri);
      } else {
        await exportRecordsCsv(filteredRecords, animals, profile.dateFormat, farmEntities, locationEntities);
      }

      // Drives the "back up your data" reminder on the Account screen —
      // only a completed export (shared or written to disk) counts, not a
      // cancelled or failed one. The Basic allowance is spent on the same
      // terms, and for the same reason.
      updateField('lastExportedAt', new Date().toISOString());
      updateField('exportsUsed', exportsUsed + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong while preparing the export.';
      Alert.alert('Export failed', message);
    } finally {
      setExportingFormat(null);
    }
  }

  function updateAnimalMultiSelect(key: keyof Pick<AnimalExportFilters, 'statuses' | 'species' | 'farms' | 'locations' | 'labels'>, value: string) {
    setAnimalFilters((current) => ({
      ...current,
      [key]: toggleSelection(current[key], value),
    }));
  }

  function updateCollectiveMultiSelect(
    key: keyof Pick<CollectiveExportFilters, 'statuses' | 'species' | 'farms' | 'locations' | 'labels'>,
    value: string,
  ) {
    setCollectiveFilters((current) => ({
      ...current,
      [key]: toggleSelection(current[key], value),
    }));
  }

  function updateRecordMultiSelect(key: keyof Pick<RecordExportFilters, 'species' | 'recordTypes' | 'farms' | 'locations'>, value: string) {
    setRecordFilters((current) => ({
      ...current,
      [key]: toggleSelection(current[key], value),
    }));
  }

  function toggleActiveSelection(selectionKey: MultiSelectKey, option: string) {
    if (target === 'animals') {
      if (selectionKey === 'statuses') updateAnimalMultiSelect('statuses', option);
      if (selectionKey === 'species') updateAnimalMultiSelect('species', option);
      if (selectionKey === 'farms') updateAnimalMultiSelect('farms', option);
      if (selectionKey === 'locations') updateAnimalMultiSelect('locations', option);
      if (selectionKey === 'labels') updateAnimalMultiSelect('labels', option);
      return;
    }

    if (target === 'collectives') {
      if (selectionKey === 'statuses') updateCollectiveMultiSelect('statuses', option);
      if (selectionKey === 'species') updateCollectiveMultiSelect('species', option);
      if (selectionKey === 'farms') updateCollectiveMultiSelect('farms', option);
      if (selectionKey === 'locations') updateCollectiveMultiSelect('locations', option);
      if (selectionKey === 'labels') updateCollectiveMultiSelect('labels', option);
      return;
    }

    if (selectionKey === 'species') updateRecordMultiSelect('species', option);
    if (selectionKey === 'recordTypes') updateRecordMultiSelect('recordTypes', option);
    if (selectionKey === 'farms') updateRecordMultiSelect('farms', option);
    if (selectionKey === 'locations') updateRecordMultiSelect('locations', option);
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
        setRecordFilters((current) => ({ ...current, [activeDateField]: formatDateForStorage(nextDate) }));
      }

      setActiveDateField(null);
      return;
    }

    if (nextDate) {
      setRecordFilters((current) => ({ ...current, [activeDateField]: formatDateForStorage(nextDate) }));
    }
  }

  function clearCurrentFilters() {
    if (target === 'animals') {
      setAnimalFilters(DEFAULT_ANIMAL_FILTERS);
      return;
    }

    if (target === 'collectives') {
      setCollectiveFilters(DEFAULT_COLLECTIVE_FILTERS);
      return;
    }

    setRecordFilters(DEFAULT_RECORD_FILTERS);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <TabSwipeView>
        <AppTopBar
        title="Export"
        actions={[
          {
            icon: 'profile',
            accessibilityLabel: 'Open account',
            onPress: () => router.push('/account'),
          },
        ]}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.segmentRow}>
          <SegmentButton
            active={target === 'records'}
            label="Records"
            onPress={() => setTarget('records')}
          />
          <SegmentButton
            active={target === 'animals'}
            label="Animal register"
            onPress={() => setTarget('animals')}
          />
          <SegmentButton
            active={target === 'collectives'}
            label="Herds & flocks"
            onPress={() => setTarget('collectives')}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Filters</Text>
            <Pressable accessibilityRole="button" onPress={clearCurrentFilters} style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}>
              <Text style={styles.clearButtonText}>Clear all</Text>
            </Pressable>
          </View>

          {target === 'animals' ? (
            <View style={styles.filterStack}>
              <DesignField
                value={animalFilters.searchQuery}
                label="Search ID or name"
                left={<SearchAffix />}
                onChangeText={(value) => setAnimalFilters((current) => ({ ...current, searchQuery: value }))}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowMoreAnimalFilters((current) => !current)}
                style={({ pressed }) => [styles.moreFiltersButton, pressed && styles.pressed]}
              >
                <Text style={styles.moreFiltersText}>{showMoreAnimalFilters ? 'Hide more filters' : 'Show more filters'}</Text>
                <AppIcon name="chevron-down" size={16} color={tokens.colors.accent} />
              </Pressable>
              {showMoreAnimalFilters ? (
                <>
                  <SelectionField
                    label="Status"
                    value={formatSelectionSummary(animalFilters.statuses, 'Select status')}
                    onPress={() => setActiveMultiSelect('statuses')}
                  />
                  <SelectionField
                    label="Species"
                    value={formatSelectionSummary(animalFilters.species, 'Select species')}
                    onPress={() => setActiveMultiSelect('species')}
                  />
                  <SelectionField
                    label="Farm"
                    value={formatSelectionSummary(animalFilters.farms, 'Select farm')}
                    onPress={() => setActiveMultiSelect('farms')}
                  />
                  <SelectionField
                    label="Location"
                    value={formatSelectionSummary(animalFilters.locations, 'Select location')}
                    onPress={() => setActiveMultiSelect('locations')}
                  />
                  <SelectionField
                    label="Labels"
                    value={formatSelectionSummary(animalFilters.labels, 'Select labels')}
                    onPress={() => setActiveMultiSelect('labels')}
                  />
                </>
              ) : null}
            </View>
          ) : target === 'collectives' ? (
            <View style={styles.filterStack}>
              <DesignField
                value={collectiveFilters.searchQuery}
                label="Search ID, name or breed"
                left={<SearchAffix />}
                onChangeText={(value) =>
                  setCollectiveFilters((current) => ({ ...current, searchQuery: value }))
                }
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowMoreCollectiveFilters((current) => !current)}
                style={({ pressed }) => [styles.moreFiltersButton, pressed && styles.pressed]}
              >
                <Text style={styles.moreFiltersText}>
                  {showMoreCollectiveFilters ? 'Hide more filters' : 'Show more filters'}
                </Text>
                <AppIcon name="chevron-down" size={16} color={tokens.colors.accent} />
              </Pressable>
              {showMoreCollectiveFilters ? (
                <>
                  <SelectionField
                    label="Status"
                    value={formatSelectionSummary(collectiveFilters.statuses, 'Select status')}
                    onPress={() => setActiveMultiSelect('statuses')}
                  />
                  <SelectionField
                    label="Species"
                    value={formatSelectionSummary(collectiveFilters.species, 'Select species')}
                    onPress={() => setActiveMultiSelect('species')}
                  />
                  <SelectionField
                    label="Farm"
                    value={formatSelectionSummary(collectiveFilters.farms, 'Select farm')}
                    onPress={() => setActiveMultiSelect('farms')}
                  />
                  <SelectionField
                    label="Location"
                    value={formatSelectionSummary(collectiveFilters.locations, 'Select location')}
                    onPress={() => setActiveMultiSelect('locations')}
                  />
                  <SelectionField
                    label="Labels"
                    value={formatSelectionSummary(collectiveFilters.labels, 'Select labels')}
                    onPress={() => setActiveMultiSelect('labels')}
                  />
                </>
              ) : null}
            </View>
          ) : (
            <View style={styles.filterStack}>
              <DesignField
                value={recordFilters.searchQuery}
                label="Search ID or name"
                left={<SearchAffix />}
                onChangeText={(value) => setRecordFilters((current) => ({ ...current, searchQuery: value }))}
              />
              <View style={styles.block}>
                <Text style={styles.label}>Date range</Text>
                <View style={styles.dateGrid}>
                  <SelectionField
                    label=""
                    value={formatDateForDisplay(recordFilters.startDate, profile.dateFormat) || 'Start date'}
                    onPress={() => setActiveDateField('startDate')}
                    containerStyle={styles.dateFieldItem}
                    hideLabel
                    isPlaceholder={!recordFilters.startDate}
                  />
                  <SelectionField
                    label=""
                    value={formatDateForDisplay(recordFilters.endDate, profile.dateFormat) || 'End date'}
                    onPress={() => setActiveDateField('endDate')}
                    containerStyle={styles.dateFieldItem}
                    hideLabel
                    isPlaceholder={!recordFilters.endDate}
                  />
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowMoreRecordFilters((current) => !current)}
                style={({ pressed }) => [styles.moreFiltersButton, pressed && styles.pressed]}
              >
                <Text style={styles.moreFiltersText}>{showMoreRecordFilters ? 'Hide more filters' : 'Show more filters'}</Text>
                <AppIcon name="chevron-down" size={16} color={tokens.colors.accent} />
              </Pressable>
              {showMoreRecordFilters ? (
                <>
                  <SelectionField
                    label="Record type"
                    value={formatSelectionSummary(recordFilters.recordTypes, 'Select record types')}
                    onPress={() => setActiveMultiSelect('recordTypes')}
                  />
                  <SelectionField
                    label="Species"
                    value={formatSelectionSummary(recordFilters.species, 'Select species')}
                    onPress={() => setActiveMultiSelect('species')}
                  />
                  <SelectionField
                    label="Farm"
                    value={formatSelectionSummary(recordFilters.farms, 'Select farm')}
                    onPress={() => setActiveMultiSelect('farms')}
                  />
                  <SelectionField
                    label="Location"
                    value={formatSelectionSummary(recordFilters.locations, 'Select location')}
                    onPress={() => setActiveMultiSelect('locations')}
                  />
                </>
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.countTitle}>
            {target === 'collectives'
              ? describeCollectiveCount(filteredCollectives)
              : `${currentCount} ${
                  target === 'animals'
                    ? currentCount === 1
                      ? 'animal'
                      : 'animals'
                    : currentCount === 1
                      ? 'record'
                      : 'records'
                }`}
          </Text>
          <Text style={styles.countText}>{target === 'animals' ? 'Ready to export' : 'Ready to export'}</Text>

          <View style={styles.summaryWrap}>
            {currentSummary.length > 0 ? (
              currentSummary.map((item) => (
                <View key={item} style={styles.summaryChip}>
                  <Text style={styles.summaryChipText}>{item}</Text>
                </View>
              ))
            ) : (
              <View style={styles.summaryChip}>
                <Text style={styles.summaryChipText}>
                  {target === 'animals' ? 'All animals included' : 'All records included'}
                </Text>
              </View>
            )}
          </View>
        </View>

      </ScrollView>

      {activeDateField && Platform.OS === 'android' ? (
        <DateTimePicker
          mode="date"
          display="default"
          value={selectedDate}
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
              <Text style={styles.selectionTitle}>
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
                    setRecordFilters((current) => ({ ...current, [activeDateField]: formatDateForStorage(selectedDate) }));
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
              value={selectedDate}
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
          <AnimatedPopupCard
            visible={activeMultiSelect !== null}
            style={activeMultiSelect === 'species' ? styles.modalCard : styles.selectionCard}
            onPress={() => undefined}
          >
            {activeMultiSelect === 'species' ? (
              <>
                <View style={styles.speciesModalHeader}>
                  <Text style={styles.speciesModalTitle}>Select Species</Text>
                  <Pressable
                    accessibilityLabel="Close species selector"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setActiveMultiSelect(null)}
                    style={styles.speciesModalClose}
                  >
                    <AppIcon name="close" size={16} color={tokens.colors.text} />
                  </Pressable>
                </View>

                <ScrollView contentContainerStyle={styles.speciesModalGrid} showsVerticalScrollIndicator={false}>
                  {multiSelectOptions.length > 0 ? (
                    multiSelectOptions.map((option) => {
                      const selected =
                        target === 'animals'
                          ? isSelectedAnimalOption(animalFilters, 'species', option)
                          : target === 'collectives'
                            ? isSelectedCollectiveOption(collectiveFilters, 'species', option)
                            : isSelectedRecordOption(recordFilters, 'species', option);
                      const theme = getSpeciesThemeByLabel(option);
                      const iconName = getSpeciesIconName(option);
                      const iconColor = option === 'Sheep' ? '#171717' : theme.icon;

                      return (
                        <Pressable
                          key={option}
                          accessibilityLabel={option}
                          accessibilityRole="button"
                          onPress={() => toggleActiveSelection('species', option)}
                          style={({ pressed }) => [
                            styles.speciesModalCard,
                            { backgroundColor: theme.tintBackground },
                            selected && styles.speciesModalCardActive,
                            pressed && styles.speciesModalCardPressed,
                          ]}
                        >
                          <View style={styles.speciesModalCardContent}>
                            <AppIcon name={iconName} size={26} color={iconColor} />
                            <Text style={[styles.speciesModalCardLabel, { color: theme.text }]}>{option}</Text>
                          </View>
                          {selected ? <AppIcon name="check" size={16} color="#fff" /> : null}
                        </Pressable>
                      );
                    })
                  ) : (
                    <View style={styles.emptyPickerState}>
                      <Text style={styles.emptyPickerText}>No options yet</Text>
                    </View>
                  )}
                </ScrollView>
              </>
            ) : (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.selectionTitle}>{getSelectionTitle(activeMultiSelect)}</Text>
                  <Pressable accessibilityLabel="Done" accessibilityRole="button" onPress={() => setActiveMultiSelect(null)}>
                    <Text style={styles.modalDone}>Done</Text>
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={[styles.modalList, needsExtraDropdownGap(activeMultiSelect) && styles.modalListSpaced]}>
                    {multiSelectOptions.length > 0 ? (
                      multiSelectOptions.map((option) => {
                        const selectionKey = activeMultiSelect;

                        if (!selectionKey) {
                          return null;
                        }

                        const selected =
                          target === 'animals'
                            ? isSelectedAnimalOption(animalFilters, selectionKey, option)
                            : target === 'collectives'
                              ? isSelectedCollectiveOption(collectiveFilters, selectionKey, option)
                              : isSelectedRecordOption(recordFilters, selectionKey, option);

                        return (
                          <Pressable
                            key={option}
                            accessibilityLabel={option}
                            accessibilityRole="button"
                            onPress={() => toggleActiveSelection(selectionKey, option)}
                            style={({ pressed }) => [
                              styles.selectionRow,
                              selected && styles.selectionRowActive,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={[styles.selectionText, selected && styles.selectionTextActive]}>{option}</Text>
                            {selected ? <AppIcon name="check" size={16} color="#fff" /> : null}
                          </Pressable>
                        );
                      })
                    ) : (
                      <View style={styles.emptyPickerState}>
                        <Text style={styles.emptyPickerText}>No options yet</Text>
                      </View>
                    )}
                  </View>
                </ScrollView>
              </>
            )}
          </AnimatedPopupCard>
        </Pressable>
      </Modal>
      <FabSpeedDial
        accessibilityLabel="Export"
        image={require('../../assets/export.png')}
        actions={[
          {
            image: require('../../assets/pdf_export.png'),
            label: 'Export PDF',
            onPress: () => void handleExport('pdf'),
          },
          {
            image: require('../../assets/csv_export.png'),
            label: 'Export Spreadsheet',
            onPress: () => void handleExport('spreadsheet'),
          },
        ]}
      />
      <PlanLimitGate />
      </TabSwipeView>

    </SafeAreaView>
  );
}

function SegmentButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.segmentButton, active ? styles.segmentButtonActive : styles.segmentButtonIdle, pressed && styles.pressed]}
    >
      <Text style={[styles.segmentText, active ? styles.segmentTextActive : styles.segmentTextIdle]}>{label}</Text>
    </Pressable>
  );
}

function SelectionField({
  label,
  value,
  onPress,
  containerStyle,
  hideLabel,
  isPlaceholder: isPlaceholderProp,
}: {
  label: string;
  value: string;
  onPress: () => void;
  containerStyle?: object;
  hideLabel?: boolean;
  isPlaceholder?: boolean;
}) {
  const isPlaceholder = isPlaceholderProp ?? value.toLowerCase().startsWith('select ');

  return (
    <View style={[styles.block, containerStyle]}>
      {hideLabel ? null : <Text style={styles.label}>{label}</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.fieldButton}>
        <Text style={[styles.fieldValue, isPlaceholder && styles.placeholderValue]}>{value}</Text>
        <AppIcon name="chevron-down" size={18} color="#7a7a7a" />
      </Pressable>
    </View>
  );
}

function SearchAffix() {
  return (
    <View style={styles.searchAffix}>
      <AppIcon name="search" size={16} color="#7a7a7a" />
      <Text style={styles.searchAffixText}>Search</Text>
    </View>
  );
}

function animalMatchesFilters(animal: Animal, filters: AnimalExportFilters) {
  const searchQuery = filters.searchQuery.trim().toLowerCase();

  if (
    searchQuery &&
    ![animal.id, animal.name]
      .some((value) => value.toLowerCase().includes(searchQuery))
  ) {
    return false;
  }

  if (filters.statuses.length > 0 && !filters.statuses.some((value) => equalsIgnoreCase(value, animal.status))) {
    return false;
  }

  if (filters.species.length > 0 && !filters.species.some((value) => equalsIgnoreCase(value, animal.species))) {
    return false;
  }

  if (filters.farms.length > 0 && !filters.farms.some((value) => equalsIgnoreCase(value, animal.farm))) {
    return false;
  }

  if (filters.locations.length > 0 && !filters.locations.some((value) => equalsIgnoreCase(value, animal.location))) {
    return false;
  }

  if (
    filters.labels.length > 0 &&
    !filters.labels.some((value) => animal.labels.some((entry) => equalsIgnoreCase(value, entry)))
  ) {
    return false;
  }

  return true;
}

// Precomputed once per export/filter pass and threaded through instead of
// rebuilding a Set/scanning the full animals array inside findRelatedAnimals
// for every single record — with hundreds of animals and thousands of
// records that per-record rebuild is the difference between an export that
// feels instant and one that visibly stalls.
type AnimalLookup = { animalUidSet: Set<string>; animalsByUid: Map<string, Animal> };

function buildAnimalLookup(animals: Animal[]): AnimalLookup {
  return {
    animalUidSet: new Set(animals.map((animal) => animal.uid)),
    animalsByUid: new Map(animals.map((animal) => [animal.uid, animal])),
  };
}

function recordMatchesFilters(
  record: RecordEntry,
  filters: RecordExportFilters,
  animals: Animal[],
  lookup: AnimalLookup,
) {
  const searchQuery = filters.searchQuery.trim().toLowerCase();
  const recordDate = parseStoredDate(record.date);
  const startDate = parseStoredDate(filters.startDate);
  const endDate = parseStoredDate(filters.endDate);

  if (startDate && recordDate && recordDate < startDate) {
    return false;
  }

  if (endDate && recordDate && recordDate > endDate) {
    return false;
  }

  if (filters.species.length > 0 && !filters.species.some((value) => equalsIgnoreCase(value, record.species))) {
    return false;
  }

  if (filters.recordTypes.length > 0 && !filters.recordTypes.some((value) => equalsIgnoreCase(value, record.type))) {
    return false;
  }

  // Only resolve the record's related animals when a filter that actually
  // needs them is active — cheap checks above already reject most records
  // in a typical filtered/searched pass.
  const needsRelatedAnimals = Boolean(searchQuery) || filters.farms.length > 0 || filters.locations.length > 0;
  const relatedAnimals = needsRelatedAnimals ? findRelatedAnimals(record, animals, lookup) : [];

  if (
    searchQuery &&
    ![record.animalTag, record.animal, ...relatedAnimals.map((animal) => animal.id), ...relatedAnimals.map((animal) => animal.name)]
      .some((value) => value.toLowerCase().includes(searchQuery))
  ) {
    return false;
  }

  if (
    filters.farms.length > 0 &&
    !relatedAnimals.some((animal) => filters.farms.some((value) => equalsIgnoreCase(value, animal.farm)))
  ) {
    return false;
  }

  if (
    filters.locations.length > 0 &&
    !relatedAnimals.some((animal) => filters.locations.some((value) => equalsIgnoreCase(value, animal.location)))
  ) {
    return false;
  }

  return true;
}

function findRelatedAnimals(record: RecordEntry, animals: Animal[], lookup?: AnimalLookup) {
  if (record.animalUids) {
    const { animalUidSet, animalsByUid } = lookup ?? buildAnimalLookup(animals);
    const uids = new Set(record.animalUids.filter((uid) => animalUidSet.has(uid)));
    return Array.from(uids)
      .map((uid) => animalsByUid.get(uid))
      .filter((animal): animal is Animal => Boolean(animal));
  }

  // Rare legacy path — a record without animalUids that couldn't be
  // backfilled on restore. Falls back to the general, slower name/tag
  // matching resolver.
  return findRecordAnimals(record, animals);
}

async function exportAnimalsCsv(
  animals: Animal[],
  dateFormat: Parameters<typeof formatDateForDisplay>[1],
  farms: FarmEntity[],
  locations: LocationEntity[],
  labels: LabelEntity[],
) {
  const rows = [
    ['LivestockBook'],
    [],
    [
      'Animal ID',
      'EID',
      'Name',
      'Species',
      'Breed',
      'Sex',
      'Age',
      'Date of Birth',
      'Status',
      'Farm',
      'Location',
      'Labels',
      'Weight',
      'Source',
      'Farm Entry Date',
      'Notes',
    ],
    ...animals.map((animal) => [
      animal.id,
      animal.eid,
      animal.name,
      animal.species,
      animal.breed,
      animal.sex,
      animal.ageLabel,
      formatDateForDisplay(animal.dateOfBirth, dateFormat),
      animal.status,
      resolveAnimalFarmName(animal, farms),
      resolveAnimalLocationName(animal, locations),
      resolveAnimalLabelNames(animal, labels).join(', '),
      formatWeight(animal.weight, animal.weightUnit),
      animal.source,
      formatDateForDisplay(animal.farmEntryDate, dateFormat),
      animal.notes,
    ]),
  ];

  await writeAndShareCsv(`animal-register-${createTimestamp()}.csv`, rows);
}

async function createCollectivesPdf(
  collectives: Collective[],
  filters: CollectiveExportFilters,
  profile: AccountProfile,
) {
  const rows = collectives.map((collective) => [
    collective.id || '—',
    collective.name || '—',
    collective.species || '—',
    collective.breed || '—',
    String(getCollectiveCount(collective)),
    collective.status,
    collective.farm || '—',
    collective.location || '—',
    collective.labels.join(', ') || '—',
    collective.supplier || '—',
    formatDateForDisplay(collective.startDate, profile.dateFormat) || '—',
    collective.purpose || '—',
  ]);

  const html = buildPdfHtml({
    title: 'Herd and Flock Register',
    branding: await resolveBusinessBranding(profile),
    countLabel: describeCollectiveCount(collectives),
    filterSummary: getCollectiveFilterSummary(filters),
    headers: [
      'ID', 'Name', 'Species', 'Breed', 'Head Count', 'Status',
      'Farm', 'Location', 'Labels', 'Supplier', 'Established', 'Purpose',
    ],
    rows,
  });

  return createPdfFile(html);
}

async function exportCollectivesCsv(
  collectives: Collective[],
  dateFormat: Parameters<typeof formatDateForDisplay>[1],
) {
  const rows = [
    ['LivestockBook'],
    [],
    [
      'Herd/Flock ID', 'Name', 'Type', 'Species', 'Breed', 'Head Count', 'Status',
      'Farm', 'Location', 'Labels', 'Supplier', 'Cost Per Animal', 'Average Weight',
      'Date Established', 'Born or Hatched', 'Closed', 'Purpose', 'Notes',
      'Count Changes',
    ],
    ...collectives.map((collective) => [
      collective.id,
      collective.name,
      collectiveTermForSpecies(collective.species),
      collective.species,
      collective.breed,
      String(getCollectiveCount(collective)),
      collective.status,
      collective.farm,
      collective.location,
      collective.labels.join(', '),
      collective.supplier,
      collective.cost,
      formatWeight(collective.averageWeight, collective.weightUnit),
      formatDateForDisplay(collective.startDate, dateFormat),
      formatDateForDisplay(collective.birthDate, dateFormat),
      formatDateForDisplay(collective.endDate, dateFormat),
      collective.purpose,
      collective.notes,
      String(collective.countEvents.length),
    ]),
  ];

  await writeAndShareCsv(`herds-and-flocks-${createTimestamp()}.csv`, rows);
}

// Every dated change to every group, one row each — the head count is derived
// from these, so a register that only reported the total would be unauditable.
async function exportCollectiveCountEventsCsv(
  collectives: Collective[],
  dateFormat: Parameters<typeof formatDateForDisplay>[1],
) {
  const rows = [
    ['LivestockBook'],
    [],
    ['Herd/Flock ID', 'Name', 'Species', 'Date', 'Change', 'Reason', 'Notes'],
    ...collectives.flatMap((collective) =>
      [...collective.countEvents]
        .sort((left, right) => left.date.localeCompare(right.date))
        .map((event) => [
          collective.id,
          collective.name,
          collective.species,
          formatDateForDisplay(event.date, dateFormat),
          event.delta > 0 ? `+${event.delta}` : String(event.delta),
          event.reason,
          event.notes,
        ]),
    ),
  ];

  await writeAndShareCsv(`herd-count-history-${createTimestamp()}.csv`, rows);
}

function collectiveMatchesFilters(collective: Collective, filters: CollectiveExportFilters) {
  const searchQuery = filters.searchQuery.trim().toLowerCase();

  if (
    searchQuery &&
    ![collective.id, collective.name, collective.breed, collective.supplier]
      .some((value) => value.toLowerCase().includes(searchQuery))
  ) {
    return false;
  }

  if (filters.statuses.length > 0 && !filters.statuses.some((value) => equalsIgnoreCase(value, collective.status))) {
    return false;
  }

  if (filters.species.length > 0 && !filters.species.some((value) => equalsIgnoreCase(value, collective.species))) {
    return false;
  }

  if (filters.farms.length > 0 && !filters.farms.some((value) => equalsIgnoreCase(value, collective.farm))) {
    return false;
  }

  if (filters.locations.length > 0 && !filters.locations.some((value) => equalsIgnoreCase(value, collective.location))) {
    return false;
  }

  if (
    filters.labels.length > 0 &&
    !filters.labels.some((value) => collective.labels.some((entry) => equalsIgnoreCase(value, entry)))
  ) {
    return false;
  }

  return true;
}

async function exportRecordsCsv(
  records: RecordEntry[],
  animals: Animal[],
  dateFormat: Parameters<typeof formatDateForDisplay>[1],
  farms: FarmEntity[],
  locations: LocationEntity[],
) {
  const lookup = buildAnimalLookup(animals);
  const rows = [
    ['LivestockBook'],
    [],
    // Every field a record can carry. A spreadsheet is read by filtering and
    // pivoting, so a column that is blank for most types still earns its place —
    // unlike the PDF, which is read as a page.
    [
      'Date', 'Record Type', 'Title',
      'Animal ID', 'Animal Name', 'Herd/Flock ID', 'Herd/Flock Name',
      'Species', 'Farm', 'Location', 'Moved From Farm', 'Moved From Location',
      'Affected Count', 'New Count',
      'Weight', 'Sample Size',
      'Medicine', 'Dose', 'Route', 'Meat Withdrawal', 'Milk Withdrawal', 'Batch No.', 'Expiry',
      'Health Status', 'Condition', 'Vet Seen',
      'Cause of Death', 'Disposal Method',
      'Buyer', 'Sale Price', 'Destination',
      'Seller', 'Purchase Price', 'Source Farm', 'Currency',
      'Feed Type', 'Feed Quantity', 'Cost',
      'Eggs Collected', 'Eggs Damaged',
      'Mother', 'Offspring Tag', 'Offspring Species', 'Offspring Breed', 'Offspring Sex', 'Offspring Weight',
      'Details',
    ],
    ...records.map((record) => {
      const relatedAnimals = findRelatedAnimals(record, animals, lookup);

      return [
        formatDateForDisplay(record.date, dateFormat),
        record.type,
        getRecordDisplayTitle(record, farms, locations),
        resolveRecordDisplayTags(record, animals).filter(Boolean).join(', ') || record.animalTag,
        resolveRecordDisplayNames(record, animals).filter(Boolean).join(', ') || record.animal,
        record.collectiveId ?? '',
        record.collectiveName ?? '',
        record.species,
        record.type === 'Movement'
          ? resolveFarmName(record.toFarmUid, record.toFarm, farms)
          : joinUnique(relatedAnimals.map((animal) => resolveAnimalFarmName(animal, farms))),
        record.type === 'Movement'
          ? resolveLocationName(record.toLocationUid, record.toLocation, locations)
          : joinUnique(relatedAnimals.map((animal) => resolveAnimalLocationName(animal, locations))),
        record.type === 'Movement' ? resolveFarmName(record.fromFarmUid, record.fromFarm, farms) : '',
        record.type === 'Movement'
          ? resolveLocationName(record.fromLocationUid, record.fromLocation, locations)
          : '',
        record.affectedCount ?? '',
        record.newCount ?? '',
        [record.weight, record.weightUnit].filter(Boolean).join(' '),
        record.sampleSize ?? '',
        record.medicine ?? '',
        [record.dose, record.doseUnit].filter(Boolean).join(' '),
        record.route ?? '',
        record.withdrawal ?? '',
        record.milkWithdrawal ?? '',
        record.batchNumber ?? '',
        record.expiryDate ?? '',
        record.healthStatus ?? '',
        record.conditionDiagnosis ?? '',
        record.vetSeen ?? '',
        record.causeOfDeath ?? '',
        record.disposalMethod ?? '',
        record.buyer ?? '',
        record.salePrice ?? '',
        record.destination ?? '',
        record.seller ?? '',
        record.purchasePrice ?? '',
        record.sourceFarm ?? '',
        record.currencyCode ?? '',
        record.feedType ?? '',
        [record.feedQuantity, record.feedUnit].filter(Boolean).join(' '),
        record.cost ?? '',
        record.eggsCollected ?? '',
        record.eggsDamaged ?? '',
        record.motherName ?? '',
        record.birthTagId ?? '',
        record.birthSpecies ?? '',
        record.birthBreed ?? '',
        record.birthSex ?? '',
        [record.birthWeight, record.birthWeightUnit].filter(Boolean).join(' '),
        record.details,
      ];
    }),
  ];

  await writeAndShareCsv(`records-${createTimestamp()}.csv`, rows);
}

async function createAnimalsPdf(
  animals: Animal[],
  filters: AnimalExportFilters,
  profile: AccountProfile,
  farms: FarmEntity[],
  locations: LocationEntity[],
  labels: LabelEntity[],
) {
  const rows = animals.map((animal) => [
    animal.id,
    animal.eid || '—',
    animal.name || '—',
    animal.species || '—',
    animal.breed || '—',
    animal.sex || '—',
    animal.ageLabel || '—',
    formatDateForDisplay(animal.dateOfBirth, profile.dateFormat) || '—',
    formatWeight(animal.weight, animal.weightUnit) || '—',
    animal.status,
    resolveAnimalFarmName(animal, farms) || '—',
    resolveAnimalLocationName(animal, locations) || '—',
    resolveAnimalLabelNames(animal, labels).join(', ') || '—',
    animal.source || '—',
  ]);

  const html = buildPdfHtml({
    title: 'Animal Register',
    branding: await resolveBusinessBranding(profile),
    countLabel: `${animals.length} ${animals.length === 1 ? 'animal' : 'animals'}`,
    filterSummary: getAnimalFilterSummary(filters),
    headers: [
      'Animal ID', 'EID', 'Name', 'Species', 'Breed', 'Sex', 'Age',
      'Date of Birth', 'Weight', 'Status', 'Farm', 'Location', 'Labels', 'Source',
    ],
    rows,
  });

  return createPdfFile(html);
}

async function createRecordsPdf(
  records: RecordEntry[],
  animals: Animal[],
  filters: RecordExportFilters,
  profile: AccountProfile,
  farms: FarmEntity[],
  locations: LocationEntity[],
) {
  const dateFormat = profile.dateFormat;
  const lookup = buildAnimalLookup(animals);
  const rows = records.map((record) => {
    const relatedAnimals = findRelatedAnimals(record, animals, lookup);

    return [
      formatDateForDisplay(record.date, dateFormat),
      record.type,
      getRecordDisplayTitle(record, farms, locations),
      resolveRecordDisplayTags(record, animals).filter(Boolean).join(', ') || record.animalTag || '—',
      resolveRecordDisplayNames(record, animals).filter(Boolean).join(', ') || record.animal || '—',
      (record.type === 'Movement'
        ? resolveFarmName(record.toFarmUid, record.toFarm, farms)
        : joinUnique(relatedAnimals.map((animal) => resolveAnimalFarmName(animal, farms)))) || '—',
      (record.type === 'Movement'
        ? resolveLocationName(record.toLocationUid, record.toLocation, locations)
        : joinUnique(relatedAnimals.map((animal) => resolveAnimalLocationName(animal, locations)))) || '—',
    ];
  });

  const html = buildPdfHtml({
    title: 'Records Export',
    branding: await resolveBusinessBranding(profile),
    countLabel: `${records.length} ${records.length === 1 ? 'record' : 'records'}`,
    filterSummary: getRecordFilterSummary(filters, dateFormat),
    headers: ['Date', 'Type', 'Title', 'Animal ID', 'Animal Name', 'Farm', 'Location'],
    rows,
  });

  return createPdfFile(html);
}

async function writeAndShareCsv(fileName: string, rows: string[][]) {
  const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

  if (!directory) {
    throw new Error('No writable export directory is available on this device.');
  }

  const uri = `${directory}${fileName}`;
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');

  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { UTI: 'public.comma-separated-values-text', mimeType: 'text/csv' });
}

function buildPdfHtml({
  title,
  branding,
  countLabel,
  filterSummary,
  headers,
  rows,
}: {
  title: string;
  branding: { businessName: string; businessAddress: string; logoDataUri: string };
  countLabel: string;
  filterSummary: string[];
  headers: string[];
  rows: string[][];
}) {
  // NOTE: expo-print renders through WKWebView's print pipeline, which —
  // unlike a full desktop browser — does not repeat <thead> at the top of
  // each page a table overflows onto (confirmed by hand: a >1-page export
  // leaves continuation pages with no column headers at all). Manually
  // paginating the rows into per-page <table> chunks and forcing a break
  // between them was also tried and had no effect — this engine ignores both
  // page-break-before and the modern break-before property outright, so
  // there is currently no reliable way to repeat the header row on later
  // pages. Left as a single continuous table; see AGENTS.md for the writeup.
  const tableStyles = `
        table {
          width: 100%;
          border-collapse: collapse;
          overflow: hidden;
          border-radius: 18px;
        }
        tr {
          page-break-inside: avoid;
        }
        thead th {
          background: #dd6560;
          color: white;
          text-align: left;
          padding: 12px 14px;
          font-size: 12px;
          letter-spacing: 0.03em;
        }
        tbody td {
          padding: 12px 14px;
          font-size: 13px;
          border-bottom: 1px solid #eee8ec;
          vertical-align: top;
        }
        tbody tr:last-child td {
          border-bottom: none;
        }
        tbody tr:nth-child(even) td {
          background: #faf8fb;
        }
  `;

  const tableHtml = `
      <table>
        <thead>
          <tr>
            ${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) =>
                `<tr>${row.map((cell) => `<td>${escapeHtml(cell || '—')}</td>`).join('')}</tr>`,
            )
            .join('')}
        </tbody>
      </table>
  `;

  return buildPdfDocument({ title, branding, countLabel, filterSummary, extraStyles: tableStyles, bodyHtml: tableHtml });
}

function isSelectedAnimalOption(filters: AnimalExportFilters, key: MultiSelectKey, value: string) {
  if (key === 'statuses') return filters.statuses.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'species') return filters.species.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'farms') return filters.farms.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'locations') return filters.locations.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'labels') return filters.labels.some((entry) => equalsIgnoreCase(entry, value));
  return false;
}

function isSelectedCollectiveOption(filters: CollectiveExportFilters, key: MultiSelectKey, value: string) {
  if (key === 'statuses') return filters.statuses.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'species') return filters.species.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'farms') return filters.farms.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'locations') return filters.locations.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'labels') return filters.labels.some((entry) => equalsIgnoreCase(entry, value));
  return false;
}

function isSelectedRecordOption(filters: RecordExportFilters, key: MultiSelectKey, value: string) {
  if (key === 'species') return filters.species.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'recordTypes') return filters.recordTypes.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'farms') return filters.farms.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'locations') return filters.locations.some((entry) => equalsIgnoreCase(entry, value));
  return false;
}

function getSelectionTitle(key: MultiSelectKey | null) {
  switch (key) {
    case 'statuses':
      return 'Select status';
    case 'species':
      return 'Select species';
    case 'recordTypes':
      return 'Select record types';
    case 'farms':
      return 'Select farms';
    case 'locations':
      return 'Select locations';
    case 'labels':
      return 'Select labels';
    default:
      return 'Select options';
  }
}

function needsExtraDropdownGap(key: MultiSelectKey | null) {
  return key === 'recordTypes' || key === 'farms' || key === 'locations';
}

function getAnimalFilterSummary(filters: AnimalExportFilters) {
  const summary: string[] = [];

  if (filters.searchQuery.trim()) summary.push(`Search: ${filters.searchQuery.trim()}`);
  if (filters.statuses.length > 0) summary.push(`Status: ${filters.statuses.join(', ')}`);
  if (filters.species.length > 0) summary.push(`Species: ${filters.species.join(', ')}`);
  if (filters.farms.length > 0) summary.push(`Farm: ${filters.farms.join(', ')}`);
  if (filters.locations.length > 0) summary.push(`Location: ${filters.locations.join(', ')}`);
  if (filters.labels.length > 0) summary.push(`Labels: ${filters.labels.join(', ')}`);

  return summary;
}

function getCollectiveFilterSummary(filters: CollectiveExportFilters) {
  const summary: string[] = [];

  if (filters.searchQuery.trim()) summary.push(`Search: ${filters.searchQuery.trim()}`);
  if (filters.statuses.length > 0) summary.push(`Status: ${filters.statuses.join(', ')}`);
  if (filters.species.length > 0) summary.push(`Species: ${filters.species.join(', ')}`);
  if (filters.farms.length > 0) summary.push(`Farm: ${filters.farms.join(', ')}`);
  if (filters.locations.length > 0) summary.push(`Location: ${filters.locations.join(', ')}`);
  if (filters.labels.length > 0) summary.push(`Labels: ${filters.labels.join(', ')}`);

  return summary;
}

function getRecordFilterSummary(filters: RecordExportFilters, dateFormat: Parameters<typeof formatDateForDisplay>[1]) {
  const summary: string[] = [];

  if (filters.searchQuery.trim()) summary.push(`Search: ${filters.searchQuery.trim()}`);
  if (filters.startDate) summary.push(`From: ${formatDateForDisplay(filters.startDate, dateFormat)}`);
  if (filters.endDate) summary.push(`To: ${formatDateForDisplay(filters.endDate, dateFormat)}`);
  if (filters.recordTypes.length > 0) summary.push(`Type: ${filters.recordTypes.join(', ')}`);
  if (filters.species.length > 0) summary.push(`Species: ${filters.species.join(', ')}`);
  if (filters.farms.length > 0) summary.push(`Farm: ${filters.farms.join(', ')}`);
  if (filters.locations.length > 0) summary.push(`Location: ${filters.locations.join(', ')}`);

  return summary;
}

function toggleSelection(values: string[], nextValue: string) {
  return values.some((value) => equalsIgnoreCase(value, nextValue))
    ? values.filter((value) => !equalsIgnoreCase(value, nextValue))
    : [...values, nextValue];
}

function formatSelectionSummary(values: string[], placeholder: string) {
  if (values.length === 0) {
    return placeholder;
  }

  if (values.length <= 2) {
    return values.join(', ');
  }

  return `${values.slice(0, 2).join(', ')} +${values.length - 2}`;
}

function splitValues(value: string) {
  return value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getAvailableSpecies(animals: Animal[], records: RecordEntry[]) {
  const preferredOrder = SPECIES_OPTIONS.map((option) => option.label);
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const label of preferredOrder) {
    const key = label.trim().toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    ordered.push(label);
  }

  const extras = uniqueValues([...animals.map((animal) => animal.species), ...records.map((record) => record.species)])
    .filter((label) => !seen.has(label.trim().toLowerCase()))
    .sort((left, right) => left.localeCompare(right));

  return [...ordered, ...extras];
}

function getSpeciesIconName(label: string): AppIconName {
  const normalized = label.trim().toLowerCase();
  const known = SPECIES_OPTIONS.find((option) => option.label.trim().toLowerCase() === normalized);

  if (known) {
    return known.label === 'Sheep' ? 'sheep-black' : known.icon;
  }

  if (normalized.includes('cow') || normalized.includes('cattle') || normalized.includes('buffalo') || normalized.includes('bison')) {
    return 'cow-copy';
  }

  if (normalized.includes('sheep')) {
    return 'sheep-black';
  }

  if (normalized.includes('pig')) {
    return 'pig';
  }

  if (normalized.includes('goat')) {
    return 'goat';
  }

  if (normalized.includes('chicken')) {
    return 'chicken';
  }

  if (normalized.includes('duck')) {
    return 'duck';
  }

  if (normalized.includes('turkey')) {
    return 'turkey';
  }

  if (normalized.includes('goose')) {
    return 'goose';
  }

  if (normalized.includes('donkey')) {
    return 'donkey';
  }

  if (normalized.includes('horse')) {
    return 'horse';
  }

  if (normalized.includes('rabbit')) {
    return 'rabbit';
  }

  if (normalized.includes('alpaca')) {
    return 'alpaca';
  }

  if (normalized.includes('llama')) {
    return 'llama';
  }

  if (normalized.includes('camel')) {
    return 'camel';
  }

  if (normalized.includes('ostrich')) {
    return 'ostrich';
  }

  return 'tag';
}

function joinUnique(values: string[]) {
  const unique = uniqueValues(values);
  return unique.join(', ');
}

function formatWeight(weight: string, unit: string) {
  return weight.trim() ? `${weight.trim()} ${unit.trim()}`.trim() : '';
}

function equalsIgnoreCase(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function escapeCsv(value: string) {
  const normalized = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  return `"${normalized.replace(/"/g, '""')}"`;
}

function createTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  const hours = `${now.getHours()}`.padStart(2, '0');
  const minutes = `${now.getMinutes()}`.padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}`;
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 120,
    gap: 10,
  },
  segmentRow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
    gap: 10,
  },
  // No flex: each button is only as wide as its own label, so the pair sits at
  // the start of the row instead of splitting the screen in half.
  segmentButton: {
    minHeight: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  segmentButtonActive: {
    backgroundColor: tokens.colors.accent,
  },
  segmentButtonIdle: {
    backgroundColor: '#F5F3F7',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#fff',
  },
  segmentTextIdle: {
    color: '#8A7F87',
  },
  card: {
    borderRadius: 22,
    backgroundColor: '#F5F3F7',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  summaryCard: {
    borderRadius: 22,
    backgroundColor: '#F5F3F7',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTitle: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  clearButton: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    color: tokens.colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  moreFiltersButton: {
    minHeight: 46,
    borderRadius: 23,
    alignSelf: 'center',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  moreFiltersText: {
    color: tokens.colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  filterStack: {
    gap: 12,
  },
  dateGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  dateFieldItem: {
    flex: 1,
  },
  block: {
    gap: 8,
  },
  label: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  fieldButton: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldValue: {
    color: '#2b2b2b',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    paddingRight: 10,
  },
  placeholderValue: {
    color: '#7a7a7a',
  },
  searchAffix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchAffixText: {
    color: '#7a7a7a',
    fontSize: 12,
    fontWeight: '600',
  },
  countTitle: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  countText: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '500',
  },
  summaryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryChip: {
    borderRadius: 999,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  summaryChipText: {
    color: tokens.colors.text,
    fontSize: 12,
    fontWeight: '700',
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
    maxHeight: '80%',
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalDone: {
    color: tokens.colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  selectionTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalList: {
    gap: 8,
  },
  modalListSpaced: {
    paddingTop: 12,
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
    flex: 1,
    paddingRight: 10,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingLeft: 20,
    paddingRight: 14,
  },
  speciesModalCardActive: {
    borderWidth: 1.5,
    borderColor: tokens.colors.accent,
  },
  speciesModalCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  speciesModalCardLabel: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '500',
    flexShrink: 1,
  },
  speciesModalCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  emptyPickerState: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPickerText: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.92,
  },
});
