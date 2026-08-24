import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../src/theme/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '../../src/components/AppDateTimePicker';

import { AppIcon } from '../../src/components/AppIcon';
import { useAppDrawer } from '../../src/components/AppDrawer';
import { AppTopBar } from '../../src/components/AppTopBar';
import { FabSpeedDial } from '../../src/components/FabSpeedDial';
import { PlanLimitGate } from '../../src/components/PlanLimitGate';
import { AnimatedPopupCard } from '../../src/components/AnimatedPopupCard';
import { BouncyPressable } from '../../src/components/BouncyPressable';
import { TabSwipeView } from '../../src/components/TabSwipeView';
import { DesignField } from '../../src/components/DesignField';
import { InlineMultiDropdown } from '../../src/components/InlineDropdown';
import { SPECIES_OPTIONS } from '../../src/constants/records';
import { deriveRecordTypeOptions } from '../../src/utils/recordTypeOptions';
import { useDebouncedValue } from '../../src/utils/useDebouncedValue';
import {
  DATE_RANGE_PRESETS,
  matchDateRangePreset,
  resolveDateRangePreset,
  type DateRangePresetKey,
} from '../../src/utils/dateRangePresets';
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
import { SegmentedToggle } from '../../src/components/SegmentedToggle';
import { tokens } from '../../src/theme/tokens';
import { formatDateForDisplay, formatDateForStorage, parseStoredDate } from '../../src/utils/dateFormat';
import {
  buildPdfDocument,
  createPdfFile,
  escapeHtml,
  resolveBusinessBranding,
  sharePdf,
} from '../../src/utils/pdfExport';
import { findRecordAnimals, resolveRecordDisplayNames, resolveRecordDisplayTags } from '../../src/utils/recordAnimals';
import {
  getRecordDisplayTitle,
  resolveAnimalFarmName,
  resolveAnimalLabelNames,
  resolveAnimalLocationName,
  resolveFarmName,
  resolveLocationName,
} from '../../src/utils/recordLocations';

type ExportTarget = 'register' | 'records';
type ExportFormat = 'pdf' | 'spreadsheet';
type DateFieldKey = 'startDate' | 'endDate';

// One set of filters for the whole register. Individually identified animals
// and herds and flocks are different entities, but a keeper filtering their
// stock does not think in that split — "show me everything on the top farm" is
// one question, and answering it twice was the old behaviour, not the intent.
/**
 * Which half of the register to export. The default carries both in one
 * document, which is what most people want; the other two are for when a
 * keeper deliberately wants just the flocks, or just the tagged animals.
 */
type RegisterScope = 'all' | 'individual' | 'collective';

const REGISTER_SCOPES: Array<{ key: RegisterScope; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'individual', label: 'Individual' },
  { key: 'collective', label: 'Herds & flocks' },
];

type RegisterExportFilters = {
  scope: RegisterScope;
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
  labels: string[];
};

// The union of both vocabularies, because the register holds both kinds.
// They overlap only on Active: an individual animal is Sold or Deceased, while
// a group is only ever Active or Inactive — animals leave it one at a time.
// Picking a status that one kind cannot hold simply excludes that kind, which
// is the behaviour a keeper expects from a filter.
const REGISTER_STATUS_OPTIONS: Array<AnimalStatus | CollectiveStatus> = ['Active', 'Sold', 'Deceased', 'Inactive'];

const DEFAULT_REGISTER_FILTERS: RegisterExportFilters = {
  scope: 'all',
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
  labels: [],
};

export default function ExportScreen() {
  const router = useRouter();
  const { openDrawer } = useAppDrawer();
  const { previewPdf, previewTarget } = useLocalSearchParams<{
    previewPdf?: string;
    previewTarget?: string;
  }>();
  const { profile, updateField } = useAccount();
  const { animals } = useAnimals();
  const { records } = useRecords();
  const { collectives } = useCollectives();
  const { farms, farmEntities, locations, locationEntities, labels, labelEntities } = useSetup();
  const { isPro } = useSubscription();
  const [target, setTarget] = useState<ExportTarget>('records');
  const [registerFilters, setRegisterFilters] = useState<RegisterExportFilters>(DEFAULT_REGISTER_FILTERS);
  const [recordFilters, setRecordFilters] = useState<RecordExportFilters>(DEFAULT_RECORD_FILTERS);
  const [activeDateField, setActiveDateField] = useState<DateFieldKey | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [showMoreRegisterFilters, setShowMoreRegisterFilters] = useState(false);
  const [showMoreRecordFilters, setShowMoreRecordFilters] = useState(false);
  const hasAutoPreviewed = useRef(false);

  const availableSpecies = useMemo(() => getAvailableSpecies(animals, records), [animals, records]);
  // Groups are counted alongside animals here: a farm or location that holds
  // only a flock still has to be offered, or its records cannot be filtered to.
  const availableFarms = useMemo(
    () =>
      uniqueValues([
        ...farms,
        ...animals.map((animal) => animal.farm),
        ...collectives.map((collective) => collective.farm),
      ]),
    [animals, collectives, farms],
  );
  const availableLocations = useMemo(
    () =>
      uniqueValues([
        ...locations,
        ...animals.map((animal) => animal.location),
        ...collectives.map((collective) => collective.location),
      ]),
    [animals, collectives, locations],
  );
  const availableLabels = useMemo(
    () =>
      uniqueValues([
        ...labels,
        ...animals.flatMap((animal) => animal.labels),
        ...collectives.flatMap((collective) => collective.labels),
      ]),
    [animals, collectives, labels],
  );
  const recordTypeOptions = useMemo(
    () => deriveRecordTypeOptions(records, recordFilters.recordTypes),
    [recordFilters.recordTypes, records],
  );

  // The search text is debounced before it reaches the filtering, so a long
  // register does not re-scan on every keystroke. Every other filter is a tap
  // and applies at once.
  const debouncedRegisterQuery = useDebouncedValue(registerFilters.searchQuery);
  const debouncedRecordQuery = useDebouncedValue(recordFilters.searchQuery);
  const appliedRegisterFilters = useMemo(
    () => ({ ...registerFilters, searchQuery: debouncedRegisterQuery }),
    [debouncedRegisterQuery, registerFilters],
  );
  const appliedRecordFilters = useMemo(
    () => ({ ...recordFilters, searchQuery: debouncedRecordQuery }),
    [debouncedRecordQuery, recordFilters],
  );

  const filteredAnimals = useMemo(
    () =>
      appliedRegisterFilters.scope === 'collective'
        ? []
        : animals.filter((animal) => animalMatchesFilters(animal, appliedRegisterFilters)),
    [appliedRegisterFilters, animals],
  );
  const filteredCollectives = useMemo(
    () =>
      appliedRegisterFilters.scope === 'individual'
        ? []
        : collectives.filter((collective) => collectiveMatchesFilters(collective, appliedRegisterFilters)),
    [appliedRegisterFilters, collectives],
  );
  const filteredRecords = useMemo(() => {
    const lookup = buildAnimalLookup(animals);
    const collectivesByUid = new Map(collectives.map((collective) => [collective.uid, collective]));
    return records.filter((record) =>
      recordMatchesFilters(record, appliedRecordFilters, animals, lookup, collectivesByUid),
    );
  }, [animals, appliedRecordFilters, collectives, records]);

  const selectedDate = useMemo(() => {
    const value = activeDateField === 'startDate' ? recordFilters.startDate : recordFilters.endDate;
    return parseStoredDate(value) ?? new Date();
  }, [activeDateField, recordFilters.endDate, recordFilters.startDate]);

  // The register exports both kinds in one document, so "is there anything to
  // export" has to count both.
  const currentCount =
    target === 'register' ? filteredAnimals.length + filteredCollectives.length : filteredRecords.length;
  const currentNoun = target === 'register' ? 'animals, herds or flocks' : 'records';
  const exportsUsed = profile.exportsUsed ?? 0;
  const currentSummary =
    target === 'register'
      ? getRegisterFilterSummary(appliedRegisterFilters)
      : getRecordFilterSummary(appliedRecordFilters, profile.dateFormat);

  useEffect(() => {
    // `animals` and `collectives` both land on the register now, so links made
    // before the two were merged still open the right thing.
    if (previewTarget === 'animals' || previewTarget === 'collectives') {
      setTarget('register');
    } else if (previewTarget === 'records') {
      setTarget('records');
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
          previewTarget === 'animals' || previewTarget === 'collectives'
            ? await createRegisterPdf(
                filteredAnimals,
                filteredCollectives,
                appliedRegisterFilters,
                profile,
                farmEntities,
                locationEntities,
                labelEntities,
              )
            : await createRecordsPdf(
                filteredRecords,
                animals,
                appliedRecordFilters,
                profile,
                farmEntities,
                locationEntities,
              );

        await Linking.openURL(uri);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Something went wrong while preparing the export.';
        Alert.alert('Export failed', message);
      }
    };

    void runPreview();
  }, [
    registerFilters,
    animals,
    farmEntities,
    filteredAnimals,
    filteredCollectives,
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
      if (target === 'register') {
        if (format === 'pdf') {
          const uri = await createRegisterPdf(
            filteredAnimals,
            filteredCollectives,
            appliedRegisterFilters,
            profile,
            farmEntities,
            locationEntities,
            labelEntities,
          );
          await sharePdf(uri);
        } else {
          // The PDF is one document, but a spreadsheet is not: individuals and
          // groups have different columns, and the dated count changes a head
          // count is derived from are a third shape again. Forcing them into
          // one sheet would mean either blank columns down half of it or every
          // group repeated on every count change, so each goes to its own file
          // and only the files that have rows are written.
          if (filteredAnimals.length > 0) {
            await exportAnimalsCsv(filteredAnimals, profile.dateFormat, farmEntities, locationEntities, labelEntities);
          }

          if (filteredCollectives.length > 0) {
            await exportCollectivesCsv(filteredCollectives, profile.dateFormat);
            await exportCollectiveCountEventsCsv(filteredCollectives, profile.dateFormat);
          }
        }
      } else if (format === 'pdf') {
        const uri = await createRecordsPdf(
          filteredRecords,
          animals,
          appliedRecordFilters,
          profile,
          farmEntities,
          locationEntities,
        );
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

  function updateRegisterMultiSelect(
    key: keyof Pick<RegisterExportFilters, 'statuses' | 'species' | 'farms' | 'locations' | 'labels'>,
    value: string,
  ) {
    setRegisterFilters((current) => ({
      ...current,
      [key]: toggleSelection(current[key], value),
    }));
  }

  function updateRecordMultiSelect(
    key: keyof Pick<RecordExportFilters, 'species' | 'recordTypes' | 'farms' | 'locations' | 'labels'>,
    value: string,
  ) {
    setRecordFilters((current) => ({
      ...current,
      [key]: toggleSelection(current[key], value),
    }));
  }

  const activeDatePreset = useMemo(
    () =>
      matchDateRangePreset({
        startDate: recordFilters.startDate,
        endDate: recordFilters.endDate,
      }),
    [recordFilters.endDate, recordFilters.startDate],
  );

  function applyDatePreset(key: DateRangePresetKey) {
    const range = resolveDateRangePreset(key);
    setRecordFilters((current) => ({
      ...current,
      startDate: range.startDate,
      endDate: range.endDate,
    }));
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
        setRecordFilters((current) => ({
          ...current,
          [activeDateField]: formatDateForStorage(nextDate),
        }));
      }

      setActiveDateField(null);
      return;
    }

    if (nextDate) {
      setRecordFilters((current) => ({
        ...current,
        [activeDateField]: formatDateForStorage(nextDate),
      }));
    }
  }

  function clearCurrentFilters() {
    if (target === 'register') {
      setRegisterFilters(DEFAULT_REGISTER_FILTERS);
      return;
    }

    setRecordFilters(DEFAULT_RECORD_FILTERS);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <TabSwipeView>
        <AppTopBar
          title="Export"
          leftAction={{
            icon: 'menu',
            accessibilityLabel: 'Open menu',
            onPress: openDrawer,
          }}
          actions={[]}
        />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <SegmentedToggle<ExportTarget>
            options={[
              { key: 'records', label: 'Records' },
              { key: 'register', label: 'Animal register' },
            ]}
            value={target}
            onChange={setTarget}
          />

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Filters</Text>
              <Pressable
                accessibilityRole="button"
                onPress={clearCurrentFilters}
                style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
              >
                <Text style={styles.clearButtonText}>Clear all</Text>
              </Pressable>
            </View>

            {target === 'register' ? (
              <View style={styles.filterStack}>
                <View style={styles.block}>
                  <Text style={styles.label}>Include</Text>
                  <View style={styles.chipRow}>
                    {REGISTER_SCOPES.map((scope) => (
                      <Pressable
                        key={scope.key}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: registerFilters.scope === scope.key,
                        }}
                        onPress={() =>
                          setRegisterFilters((current) => ({
                            ...current,
                            scope: scope.key,
                          }))
                        }
                        style={({ pressed }) => [
                          styles.filterChip,
                          registerFilters.scope === scope.key && styles.filterChipActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            registerFilters.scope === scope.key && styles.filterChipTextActive,
                          ]}
                        >
                          {scope.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <DesignField
                  value={registerFilters.searchQuery}
                  label="Search ID, name or breed"
                  placeholder="e.g. UK1234 or Bess"
                  left={<SearchAffix />}
                  search
                  onChangeText={(value) =>
                    setRegisterFilters((current) => ({
                      ...current,
                      searchQuery: value,
                    }))
                  }
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowMoreRegisterFilters((current) => !current)}
                  style={({ pressed }) => [styles.moreFiltersButton, pressed && styles.pressed]}
                >
                  <Text style={styles.moreFiltersText}>
                    {showMoreRegisterFilters ? 'Hide more filters' : 'Show more filters'}
                  </Text>
                  <AppIcon name="chevron-down" size={16} color={tokens.colors.accent} />
                </Pressable>
                {showMoreRegisterFilters ? (
                  <>
                    <View style={styles.block}>
                      <Text style={styles.label}>Status</Text>
                      <InlineMultiDropdown
                        accessibilityLabel="Status"
                        options={REGISTER_STATUS_OPTIONS}
                        selected={registerFilters.statuses}
                        onToggle={(option) => updateRegisterMultiSelect('statuses', option)}
                        placeholder="Select status"
                      />
                    </View>
                    <View style={styles.block}>
                      <Text style={styles.label}>Species</Text>
                      <InlineMultiDropdown
                        accessibilityLabel="Species"
                        options={availableSpecies}
                        selected={registerFilters.species}
                        onToggle={(option) => updateRegisterMultiSelect('species', option)}
                        placeholder="Select species"
                        renderLabel={(option) => <SpeciesRowLabel label={option} />}
                      />
                    </View>
                    <View style={styles.block}>
                      <Text style={styles.label}>Farm</Text>
                      <InlineMultiDropdown
                        accessibilityLabel="Farm"
                        options={availableFarms}
                        selected={registerFilters.farms}
                        onToggle={(option) => updateRegisterMultiSelect('farms', option)}
                        placeholder="Select farm"
                      />
                    </View>
                    <View style={styles.block}>
                      <Text style={styles.label}>Location</Text>
                      <InlineMultiDropdown
                        accessibilityLabel="Location"
                        options={availableLocations}
                        selected={registerFilters.locations}
                        onToggle={(option) => updateRegisterMultiSelect('locations', option)}
                        placeholder="Select location"
                      />
                    </View>
                    <View style={styles.block}>
                      <Text style={styles.label}>Labels</Text>
                      <InlineMultiDropdown
                        accessibilityLabel="Labels"
                        options={availableLabels}
                        selected={registerFilters.labels}
                        onToggle={(option) => updateRegisterMultiSelect('labels', option)}
                        placeholder="Select labels"
                      />
                    </View>
                  </>
                ) : null}
              </View>
            ) : (
              <View style={styles.filterStack}>
                <DesignField
                  value={recordFilters.searchQuery}
                  label="Search ID or name"
                  placeholder="e.g. UK1234 or Bess"
                  left={<SearchAffix />}
                  search
                  onChangeText={(value) =>
                    setRecordFilters((current) => ({
                      ...current,
                      searchQuery: value,
                    }))
                  }
                />
                <View style={styles.block}>
                  <Text style={styles.label}>Date range</Text>
                  <View style={styles.chipRow}>
                    {DATE_RANGE_PRESETS.map((preset) => (
                      <Pressable
                        key={preset.key}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: activeDatePreset === preset.key,
                        }}
                        onPress={() => applyDatePreset(preset.key)}
                        style={({ pressed }) => [
                          styles.filterChip,
                          activeDatePreset === preset.key && styles.filterChipActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            activeDatePreset === preset.key && styles.filterChipTextActive,
                          ]}
                        >
                          {preset.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
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
                  <Text style={styles.moreFiltersText}>
                    {showMoreRecordFilters ? 'Hide more filters' : 'Show more filters'}
                  </Text>
                  <AppIcon name="chevron-down" size={16} color={tokens.colors.accent} />
                </Pressable>
                {showMoreRecordFilters ? (
                  <>
                    <View style={styles.block}>
                      <Text style={styles.label}>Record type</Text>
                      <InlineMultiDropdown
                        accessibilityLabel="Record type"
                        options={recordTypeOptions}
                        selected={recordFilters.recordTypes}
                        onToggle={(option) => updateRecordMultiSelect('recordTypes', option)}
                        placeholder="Select record types"
                      />
                    </View>
                    <View style={styles.block}>
                      <Text style={styles.label}>Species</Text>
                      <InlineMultiDropdown
                        accessibilityLabel="Species"
                        options={availableSpecies}
                        selected={recordFilters.species}
                        onToggle={(option) => updateRecordMultiSelect('species', option)}
                        placeholder="Select species"
                        renderLabel={(option) => <SpeciesRowLabel label={option} />}
                      />
                    </View>
                    <View style={styles.block}>
                      <Text style={styles.label}>Farm</Text>
                      <InlineMultiDropdown
                        accessibilityLabel="Farm"
                        options={availableFarms}
                        selected={recordFilters.farms}
                        onToggle={(option) => updateRecordMultiSelect('farms', option)}
                        placeholder="Select farm"
                      />
                    </View>
                    <View style={styles.block}>
                      <Text style={styles.label}>Location</Text>
                      <InlineMultiDropdown
                        accessibilityLabel="Location"
                        options={availableLocations}
                        selected={recordFilters.locations}
                        onToggle={(option) => updateRecordMultiSelect('locations', option)}
                        placeholder="Select location"
                      />
                    </View>
                    <View style={styles.block}>
                      <Text style={styles.label}>Labels</Text>
                      <InlineMultiDropdown
                        accessibilityLabel="Labels"
                        options={availableLabels}
                        selected={recordFilters.labels}
                        onToggle={(option) => updateRecordMultiSelect('labels', option)}
                        placeholder="Select labels"
                      />
                    </View>
                  </>
                ) : null}
              </View>
            )}
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.countTitle}>
              {target === 'register'
                ? describeRegisterCount(filteredAnimals, filteredCollectives)
                : `${currentCount} ${currentCount === 1 ? 'record' : 'records'}`}
            </Text>
            <Text style={styles.countText}>Ready to export</Text>

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
                    {target === 'register' ? 'Everything included' : 'All records included'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>

        {activeDateField && Platform.OS === 'android' ? (
          <DateTimePicker mode="date" display="default" value={selectedDate} onChange={handleDateChange} />
        ) : null}

        <Modal
          animationType="none"
          transparent
          visible={activeDateField !== null && Platform.OS === 'ios'}
          onRequestClose={() => setActiveDateField(null)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setActiveDateField(null)}>
            <AnimatedPopupCard
              visible={activeDateField !== null && Platform.OS === 'ios'}
              style={styles.modalCard}
              onPress={() => undefined}
            >
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
                      setRecordFilters((current) => ({
                        ...current,
                        [activeDateField]: formatDateForStorage(selectedDate),
                      }));
                    }
                    setActiveDateField(null);
                  }}
                >
                  <Text style={styles.modalDone}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker mode="date" display="spinner" value={selectedDate} onChange={handleDateChange} />
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

// Icon only. The word "Search" used to sit here permanently, which said the
// same thing as the icon beside it and the label above it, and — because it
// never went away — pushed what the user typed to the right, truncating long
// tags like UK123456700001 on a phone.
function SearchAffix() {
  return (
    <View style={styles.searchAffix}>
      <AppIcon name="search" size={16} color="#7a7a7a" />
    </View>
  );
}

function animalMatchesFilters(animal: Animal, filters: RegisterExportFilters) {
  const searchQuery = filters.searchQuery.trim().toLowerCase();

  if (searchQuery && ![animal.id, animal.name].some((value) => value.toLowerCase().includes(searchQuery))) {
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
type AnimalLookup = {
  animalUidSet: Set<string>;
  animalsByUid: Map<string, Animal>;
};

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
  collectivesByUid: Map<string, Collective>,
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
  const needsRelatedAnimals =
    Boolean(searchQuery) || filters.farms.length > 0 || filters.locations.length > 0 || filters.labels.length > 0;
  const relatedAnimals = needsRelatedAnimals ? findRelatedAnimals(record, animals, lookup) : [];

  // A record belonging to a herd or flock has no related animals at all — its
  // subject is the group, named by collectiveUid. Every check below has to
  // look there as well, or a filtered export silently drops every group
  // record: filtering by the farm a flock stands on used to return only the
  // individually identified animals kept there, with nothing to say the
  // flock's own records had been left out.
  const relatedCollective = record.collectiveUid ? collectivesByUid.get(record.collectiveUid) : undefined;

  if (searchQuery) {
    const haystack = [
      record.animalTag,
      record.animal,
      ...relatedAnimals.map((animal) => animal.id),
      ...relatedAnimals.map((animal) => animal.name),
      // The snapshots taken when the record was written, so a record whose
      // group has since been renamed still answers to what it says on the
      // record, and the group's current identity too.
      record.collectiveId ?? '',
      record.collectiveName ?? '',
      relatedCollective?.id ?? '',
      relatedCollective?.name ?? '',
    ];

    if (!haystack.some((value) => value.toLowerCase().includes(searchQuery))) {
      return false;
    }
  }

  if (
    filters.farms.length > 0 &&
    !relatedAnimals.some((animal) => filters.farms.some((value) => equalsIgnoreCase(value, animal.farm))) &&
    !(relatedCollective && filters.farms.some((value) => equalsIgnoreCase(value, relatedCollective.farm)))
  ) {
    return false;
  }

  if (
    filters.locations.length > 0 &&
    !relatedAnimals.some((animal) => filters.locations.some((value) => equalsIgnoreCase(value, animal.location))) &&
    !(relatedCollective && filters.locations.some((value) => equalsIgnoreCase(value, relatedCollective.location)))
  ) {
    return false;
  }

  // Labels sit on the animal or the group, never on the record, so a record
  // qualifies when any subject it belongs to carries one of the chosen labels.
  if (
    filters.labels.length > 0 &&
    !relatedAnimals.some((animal) =>
      filters.labels.some((value) => animal.labels.some((entry) => equalsIgnoreCase(value, entry))),
    ) &&
    !(
      relatedCollective &&
      filters.labels.some((value) => relatedCollective.labels.some((entry) => equalsIgnoreCase(value, entry)))
    )
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

async function exportCollectivesCsv(collectives: Collective[], dateFormat: Parameters<typeof formatDateForDisplay>[1]) {
  const rows = [
    ['LivestockBook'],
    [],
    [
      'Herd/Flock ID',
      'Name',
      'Type',
      'Species',
      'Breed',
      'Head Count',
      'Status',
      'Farm',
      'Location',
      'Labels',
      'Supplier',
      'Cost Per Animal',
      'Average Weight',
      'Date Established',
      'Closed',
      'Purpose',
      'Notes',
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

function collectiveMatchesFilters(collective: Collective, filters: RegisterExportFilters) {
  const searchQuery = filters.searchQuery.trim().toLowerCase();

  if (
    searchQuery &&
    ![collective.id, collective.name, collective.breed, collective.supplier].some((value) =>
      value.toLowerCase().includes(searchQuery),
    )
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

  if (
    filters.locations.length > 0 &&
    !filters.locations.some((value) => equalsIgnoreCase(value, collective.location))
  ) {
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
      'Date',
      'Record Type',
      'Title',
      'Animal ID',
      'Animal Name',
      'Herd/Flock ID',
      'Herd/Flock Name',
      'Species',
      'Farm',
      'Location',
      'Moved From Farm',
      'Moved From Location',
      'Affected Count',
      'New Count',
      'Weight',
      'Sample Size',
      'Medicine',
      'Dose',
      'Route',
      'Meat Withdrawal',
      'Milk Withdrawal',
      'Batch No.',
      'Expiry',
      'Health Status',
      'Condition',
      'Vet Seen',
      'Cause of Death',
      'Disposal Method',
      'Buyer',
      'Sale Price',
      'Destination',
      'Seller',
      'Purchase Price',
      'Source Farm',
      'Currency',
      'Feed Type',
      'Feed Quantity',
      'Cost',
      'Eggs Collected',
      'Eggs Damaged',
      'Mother',
      'Offspring Tag',
      'Offspring Species',
      'Offspring Breed',
      'Offspring Sex',
      'Offspring Weight',
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
        record.type === 'Movement' ? resolveLocationName(record.fromLocationUid, record.fromLocation, locations) : '',
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

/**
 * The whole register as one document: herds and flocks first, then the
 * individually identified animals.
 *
 * Groups lead because there are rarely more than a handful of them — a farm
 * with twenty is unusual — so they fit on the opening page and give the reader
 * the shape of the holding before several pages of individual animals. They
 * are also the part an inspector is most likely to want first, since a single
 * row can stand for six hundred birds.
 *
 * The two tables carry different columns (a group has a head count and no sex
 * or date of birth), so they stay separate tables under their own headings
 * rather than being forced into shared columns half of which would be blank.
 */
async function createRegisterPdf(
  animals: Animal[],
  collectives: Collective[],
  filters: RegisterExportFilters,
  profile: AccountProfile,
  farms: FarmEntity[],
  locations: LocationEntity[],
  labels: LabelEntity[],
) {
  const sections: PdfSection[] = [];

  if (collectives.length > 0) {
    sections.push({
      heading: 'Herds and flocks',
      subheading: describeCollectiveCount(collectives),
      headers: [
        'ID',
        'Name',
        'Species',
        'Breed',
        'Head Count',
        'Status',
        'Farm',
        'Location',
        'Labels',
        'Supplier',
        'Established',
        'Purpose',
      ],
      rows: collectives.map((collective) => [
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
      ]),
    });
  }

  if (animals.length > 0) {
    sections.push({
      heading: 'Individual animals',
      subheading: `${animals.length} ${animals.length === 1 ? 'animal' : 'animals'}`,
      headers: [
        'Animal ID',
        'EID',
        'Name',
        'Species',
        'Breed',
        'Sex',
        'Age',
        'Date of Birth',
        'Weight',
        'Status',
        'Farm',
        'Location',
        'Labels',
        'Source',
      ],
      rows: animals.map((animal) => [
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
      ]),
    });
  }

  const html = buildPdfHtml({
    title: 'Animal Register',
    branding: await resolveBusinessBranding(profile),
    countLabel: describeRegisterCount(animals, collectives),
    filterSummary: getRegisterFilterSummary(filters),
    sections,
  });

  return createPdfFile(html);
}

/** "12 animals · 3 herds & flocks (626 head)", dropping whichever half is empty. */
function describeRegisterCount(animals: Animal[], collectives: Collective[]) {
  const parts: string[] = [];

  if (animals.length > 0) {
    parts.push(`${animals.length} ${animals.length === 1 ? 'animal' : 'animals'}`);
  }

  if (collectives.length > 0) {
    parts.push(describeCollectiveCount(collectives));
  }

  return parts.length > 0 ? parts.join(' · ') : 'Nothing to export';
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

  await FileSystem.writeAsStringAsync(uri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Sharing.shareAsync(uri, {
    UTI: 'public.comma-separated-values-text',
    mimeType: 'text/csv',
  });
}

/**
 * One table in the document. A register carries two — groups then individuals
 * — because their columns genuinely differ; everything else carries one.
 */
type PdfSection = {
  heading?: string;
  subheading?: string;
  headers: string[];
  rows: string[][];
};

function buildPdfHtml({
  title,
  branding,
  countLabel,
  filterSummary,
  headers,
  rows,
  sections,
}: {
  title: string;
  branding: {
    businessName: string;
    businessAddress: string;
    logoDataUri: string;
  };
  countLabel: string;
  filterSummary: string[];
  headers?: string[];
  rows?: string[][];
  sections?: PdfSection[];
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
        .section + .section {
          margin-top: 26px;
        }
        .section-heading {
          font-size: 15px;
          font-weight: 700;
          color: #171717;
          margin: 0 0 2px;
        }
        .section-subheading {
          font-size: 12px;
          color: #666666;
          margin: 0 0 10px;
        }
  `;

  // A single headers/rows pair is just a one-section document, so both call
  // shapes go through the same renderer.
  const renderedSections: PdfSection[] = sections ?? [{ headers: headers ?? [], rows: rows ?? [] }];

  const tableHtml = renderedSections
    .map(
      (section) => `
      <div class="section">
        ${section.heading ? `<p class="section-heading">${escapeHtml(section.heading)}</p>` : ''}
        ${section.subheading ? `<p class="section-subheading">${escapeHtml(section.subheading)}</p>` : ''}
        <table>
          <thead>
            <tr>
              ${section.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${section.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell || '—')}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    `,
    )
    .join('');

  return buildPdfDocument({
    title,
    branding,
    countLabel,
    filterSummary,
    extraStyles: tableStyles,
    bodyHtml: tableHtml,
  });
}

function getRegisterFilterSummary(filters: RegisterExportFilters) {
  const summary: string[] = [];

  if (filters.scope === 'individual') summary.push('Individual animals only');
  if (filters.scope === 'collective') summary.push('Herds and flocks only');
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
  if (filters.labels.length > 0) summary.push(`Labels: ${filters.labels.join(', ')}`);

  return summary;
}

function toggleSelection(values: string[], nextValue: string) {
  return values.some((value) => equalsIgnoreCase(value, nextValue))
    ? values.filter((value) => !equalsIgnoreCase(value, nextValue))
    : [...values, nextValue];
}

// The species filter keeps the mark next to the name — a keeper picks their
// stock out of a list by the silhouette faster than by reading it.
function SpeciesRowLabel({ label }: { label: string }) {
  const theme = getSpeciesThemeByLabel(label);
  const iconColor = label === 'Sheep' ? '#171717' : theme.icon;

  return (
    <View style={styles.speciesRowLabel}>
      <AppIcon name={getSpeciesIconName(label)} size={20} color={iconColor} />
      <Text style={styles.speciesRowLabelText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
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

  if (
    normalized.includes('cow') ||
    normalized.includes('cattle') ||
    normalized.includes('buffalo') ||
    normalized.includes('bison')
  ) {
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
  const normalized = String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .trim();
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
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 120,
    gap: 10,
  },
  card: {
    borderRadius: 22,
    backgroundColor: '#EFECF0',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  summaryCard: {
    borderRadius: 22,
    backgroundColor: 'rgba(214, 61, 61, 0.16)',
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
    fontSize: 16,
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
    fontSize: 16,
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
  speciesRowLabel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  speciesRowLabelText: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '500',
    flexShrink: 1,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  filterChip: {
    borderRadius: tokens.radius.pill,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: tokens.colors.accent,
    borderColor: tokens.colors.accent,
  },
  filterChipText: {
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  searchAffix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  pressed: {
    opacity: 0.92,
  },
});
