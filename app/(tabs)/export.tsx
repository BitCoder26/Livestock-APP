import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../../src/components/AppIcon';
import { AppTopBar } from '../../src/components/AppTopBar';
import { AnimatedPopupCard } from '../../src/components/AnimatedPopupCard';
import { BouncyPressable } from '../../src/components/BouncyPressable';
import { TabSwipeView } from '../../src/components/TabSwipeView';
import { DesignField } from '../../src/components/DesignField';
import { RECORD_TYPES, SPECIES_OPTIONS } from '../../src/constants/records';
import { useAnimals } from '../../src/context/AnimalsContext';
import { useRecords } from '../../src/context/RecordsContext';
import { useSetup } from '../../src/context/SetupContext';
import type { Animal, AnimalStatus } from '../../src/entities/animal';
import type { RecordEntry } from '../../src/entities/record';
import { tokens } from '../../src/theme/tokens';

type ExportTarget = 'animals' | 'records';
type ExportFormat = 'pdf' | 'spreadsheet';
type DateFieldKey = 'startDate' | 'endDate';
type MultiSelectKey = 'statuses' | 'species' | 'recordTypes' | 'farms' | 'paddocks' | 'groups';

type AnimalExportFilters = {
  searchQuery: string;
  statuses: string[];
  species: string[];
  farms: string[];
  paddocks: string[];
  groups: string[];
};

type RecordExportFilters = {
  searchQuery: string;
  startDate: string | null;
  endDate: string | null;
  species: string[];
  recordTypes: string[];
  farms: string[];
  paddocks: string[];
};

const STATUS_OPTIONS: AnimalStatus[] = ['Active', 'Sold', 'Deceased'];

const DEFAULT_ANIMAL_FILTERS: AnimalExportFilters = {
  searchQuery: '',
  statuses: [],
  species: [],
  farms: [],
  paddocks: [],
  groups: [],
};

const DEFAULT_RECORD_FILTERS: RecordExportFilters = {
  searchQuery: '',
  startDate: null,
  endDate: null,
  species: [],
  recordTypes: [],
  farms: [],
  paddocks: [],
};

export default function ExportScreen() {
  const router = useRouter();
  const { animals } = useAnimals();
  const { records } = useRecords();
  const { farms, paddocks, groups } = useSetup();
  const [target, setTarget] = useState<ExportTarget>('records');
  const [animalFilters, setAnimalFilters] = useState<AnimalExportFilters>(DEFAULT_ANIMAL_FILTERS);
  const [recordFilters, setRecordFilters] = useState<RecordExportFilters>(DEFAULT_RECORD_FILTERS);
  const [activeDateField, setActiveDateField] = useState<DateFieldKey | null>(null);
  const [activeMultiSelect, setActiveMultiSelect] = useState<MultiSelectKey | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [showMoreAnimalFilters, setShowMoreAnimalFilters] = useState(false);
  const [showMoreRecordFilters, setShowMoreRecordFilters] = useState(false);

  const availableSpecies = useMemo(
    () => getAvailableSpecies(animals, records),
    [animals, records],
  );
  const availableFarms = useMemo(() => uniqueValues([...farms, ...animals.map((animal) => animal.farm)]), [animals, farms]);
  const availablePaddocks = useMemo(
    () => uniqueValues([...paddocks, ...animals.map((animal) => animal.paddock)]),
    [animals, paddocks],
  );
  const availableGroups = useMemo(() => uniqueValues([...groups, ...animals.map((animal) => animal.group)]), [animals, groups]);

  const filteredAnimals = useMemo(
    () => animals.filter((animal) => animalMatchesFilters(animal, animalFilters)),
    [animalFilters, animals],
  );
  const filteredRecords = useMemo(
    () => records.filter((record) => recordMatchesFilters(record, recordFilters, animals)),
    [animals, recordFilters, records],
  );

  const selectedDate = useMemo(() => {
    const value = activeDateField === 'startDate' ? recordFilters.startDate : recordFilters.endDate;
    return parseDateValue(value) ?? new Date();
  }, [activeDateField, recordFilters.endDate, recordFilters.startDate]);

  const multiSelectOptions = useMemo(() => {
    switch (activeMultiSelect) {
      case 'statuses':
        return [...STATUS_OPTIONS];
      case 'species':
        return availableSpecies;
      case 'recordTypes':
        return [...RECORD_TYPES];
      case 'farms':
        return availableFarms;
      case 'paddocks':
        return availablePaddocks;
      case 'groups':
        return availableGroups;
      default:
        return [];
    }
  }, [activeMultiSelect, availableFarms, availableGroups, availablePaddocks, availableSpecies]);

  const currentCount = target === 'animals' ? filteredAnimals.length : filteredRecords.length;
  const currentSummary =
    target === 'animals'
      ? getAnimalFilterSummary(animalFilters)
      : getRecordFilterSummary(recordFilters);

  async function handleExport(format: ExportFormat) {
    const sharingAvailable = await Sharing.isAvailableAsync();

    if (!sharingAvailable) {
      Alert.alert('Sharing unavailable', 'This device cannot open the share sheet right now.');
      return;
    }

    if (currentCount === 0) {
      Alert.alert('Nothing to export', `There are no ${target === 'animals' ? 'animals' : 'records'} matching these filters yet.`);
      return;
    }

    setExportingFormat(format);

    try {
      if (target === 'animals') {
        if (format === 'pdf') {
          await exportAnimalsPdf(filteredAnimals, animalFilters);
        } else {
          await exportAnimalsCsv(filteredAnimals);
        }
      } else if (format === 'pdf') {
        await exportRecordsPdf(filteredRecords, animals, recordFilters);
      } else {
        await exportRecordsCsv(filteredRecords, animals);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong while preparing the export.';
      Alert.alert('Export failed', message);
    } finally {
      setExportingFormat(null);
    }
  }

  function updateAnimalMultiSelect(key: keyof Pick<AnimalExportFilters, 'statuses' | 'species' | 'farms' | 'paddocks' | 'groups'>, value: string) {
    setAnimalFilters((current) => ({
      ...current,
      [key]: toggleSelection(current[key], value),
    }));
  }

  function updateRecordMultiSelect(key: keyof Pick<RecordExportFilters, 'species' | 'recordTypes' | 'farms' | 'paddocks'>, value: string) {
    setRecordFilters((current) => ({
      ...current,
      [key]: toggleSelection(current[key], value),
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
        setRecordFilters((current) => ({ ...current, [activeDateField]: formatDate(nextDate) }));
      }

      setActiveDateField(null);
      return;
    }

    if (nextDate) {
      setRecordFilters((current) => ({ ...current, [activeDateField]: formatDate(nextDate) }));
    }
  }

  function clearCurrentFilters() {
    if (target === 'animals') {
      setAnimalFilters(DEFAULT_ANIMAL_FILTERS);
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
            icon: 'settings',
            accessibilityLabel: 'Open settings',
            onPress: () => router.push('/settings'),
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
                    label="Paddock"
                    value={formatSelectionSummary(animalFilters.paddocks, 'Select paddock')}
                    onPress={() => setActiveMultiSelect('paddocks')}
                  />
                  <SelectionField
                    label="Group"
                    value={formatSelectionSummary(animalFilters.groups, 'Select group')}
                    onPress={() => setActiveMultiSelect('groups')}
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
                    value={recordFilters.startDate ?? 'Select start date'}
                    onPress={() => setActiveDateField('startDate')}
                    containerStyle={styles.dateFieldItem}
                    hideLabel
                  />
                  <SelectionField
                    label=""
                    value={recordFilters.endDate ?? 'Select end date'}
                    onPress={() => setActiveDateField('endDate')}
                    containerStyle={styles.dateFieldItem}
                    hideLabel
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
                    label="Paddock"
                    value={formatSelectionSummary(recordFilters.paddocks, 'Select paddock')}
                    onPress={() => setActiveMultiSelect('paddocks')}
                  />
                </>
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.countTitle}>
            {currentCount} {target === 'animals' ? (currentCount === 1 ? 'animal' : 'animals') : currentCount === 1 ? 'record' : 'records'}
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

        <View style={styles.actionStack}>
          <ExportActionButton
            busy={exportingFormat === 'pdf'}
            label="Export PDF"
            onPress={() => handleExport('pdf')}
          />
          <ExportActionButton
            busy={exportingFormat === 'spreadsheet'}
            label="Export Spreadsheet"
            onPress={() => handleExport('spreadsheet')}
          />
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
        animationType="fade"
        transparent
        visible={activeDateField !== null && Platform.OS === 'ios'}
        onRequestClose={() => setActiveDateField(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setActiveDateField(null)}>
          <AnimatedPopupCard visible={activeDateField !== null && Platform.OS === 'ios'} style={styles.selectionCard} onPress={() => undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.selectionTitle}>
                {activeDateField === 'startDate' ? 'Select start date' : 'Select end date'}
              </Text>
              <Pressable accessibilityLabel="Done" accessibilityRole="button" onPress={() => setActiveDateField(null)}>
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
        animationType="fade"
        transparent
        visible={activeMultiSelect !== null}
        onRequestClose={() => setActiveMultiSelect(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setActiveMultiSelect(null)}>
          <AnimatedPopupCard visible={activeMultiSelect !== null} style={styles.selectionCard} onPress={() => undefined}>
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
                        : isSelectedRecordOption(recordFilters, selectionKey, option);

                    return (
                      <Pressable
                        key={option}
                        accessibilityLabel={option}
                        accessibilityRole="button"
                        onPress={() => {
                          if (target === 'animals') {
                            if (selectionKey === 'statuses') updateAnimalMultiSelect('statuses', option);
                            if (selectionKey === 'species') updateAnimalMultiSelect('species', option);
                            if (selectionKey === 'farms') updateAnimalMultiSelect('farms', option);
                            if (selectionKey === 'paddocks') updateAnimalMultiSelect('paddocks', option);
                            if (selectionKey === 'groups') updateAnimalMultiSelect('groups', option);
                          } else {
                            if (selectionKey === 'species') updateRecordMultiSelect('species', option);
                            if (selectionKey === 'recordTypes') updateRecordMultiSelect('recordTypes', option);
                            if (selectionKey === 'farms') updateRecordMultiSelect('farms', option);
                            if (selectionKey === 'paddocks') updateRecordMultiSelect('paddocks', option);
                          }
                        }}
                        style={({ pressed }) => [
                          styles.selectionRow,
                          selected && styles.selectionRowActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[styles.selectionText, selected && styles.selectionTextActive]}>{option}</Text>
                        {selected ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
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
          </AnimatedPopupCard>
        </Pressable>
      </Modal>
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
}: {
  label: string;
  value: string;
  onPress: () => void;
  containerStyle?: object;
  hideLabel?: boolean;
}) {
  const isPlaceholder = value.toLowerCase().startsWith('select ');

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

function ExportActionButton({
  busy,
  label,
  onPress,
}: {
  busy: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <BouncyPressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.exportButton, pressed && styles.pressed]}
    >
      <AppIcon name="export_" size={18} color="#fff" />
      <Text style={styles.exportLabel}>{busy ? 'Preparing export...' : label}</Text>
    </BouncyPressable>
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

  if (filters.paddocks.length > 0 && !filters.paddocks.some((value) => equalsIgnoreCase(value, animal.paddock))) {
    return false;
  }

  if (filters.groups.length > 0 && !filters.groups.some((value) => equalsIgnoreCase(value, animal.group))) {
    return false;
  }

  return true;
}

function recordMatchesFilters(record: RecordEntry, filters: RecordExportFilters, animals: Animal[]) {
  const relatedAnimals = findRelatedAnimals(record, animals);
  const searchQuery = filters.searchQuery.trim().toLowerCase();
  const recordDate = parseDateValue(record.date);
  const startDate = parseDateValue(filters.startDate);
  const endDate = parseDateValue(filters.endDate);

  if (
    searchQuery &&
    ![record.animalTag, record.animal, ...relatedAnimals.map((animal) => animal.id), ...relatedAnimals.map((animal) => animal.name)]
      .some((value) => value.toLowerCase().includes(searchQuery))
  ) {
    return false;
  }

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

  if (
    filters.farms.length > 0 &&
    !relatedAnimals.some((animal) => filters.farms.some((value) => equalsIgnoreCase(value, animal.farm)))
  ) {
    return false;
  }

  if (
    filters.paddocks.length > 0 &&
    !relatedAnimals.some((animal) => filters.paddocks.some((value) => equalsIgnoreCase(value, animal.paddock)))
  ) {
    return false;
  }

  return true;
}

function findRelatedAnimals(record: RecordEntry, animals: Animal[]) {
  const idParts = new Set(splitValues(record.animalTag));
  const nameParts = new Set(splitValues(record.animal));

  if (record.animalIds?.length) {
    for (const id of record.animalIds) {
      idParts.add(id.toLowerCase());
    }
  }

  return animals.filter((animal) => idParts.has(animal.id.toLowerCase()) || nameParts.has(animal.name.toLowerCase()));
}

async function exportAnimalsCsv(animals: Animal[]) {
  const rows = [
    ['Animal ID', 'Name', 'Species', 'Sex', 'Date of Birth', 'Status', 'Farm', 'Paddock', 'Group', 'Weight', 'Notes'],
    ...animals.map((animal) => [
      animal.id,
      animal.name,
      animal.species,
      animal.sex,
      animal.dateOfBirth,
      animal.status,
      animal.farm,
      animal.paddock,
      animal.group,
      formatWeight(animal.weight, animal.weightUnit),
      animal.notes,
    ]),
  ];

  await writeAndShareCsv(`animal-register-${createTimestamp()}.csv`, rows);
}

async function exportRecordsCsv(records: RecordEntry[], animals: Animal[]) {
  const rows = [
    ['Date', 'Record Type', 'Title', 'Animal ID', 'Animal Name', 'Species', 'Farm', 'Paddock', 'Details'],
    ...records.map((record) => {
      const relatedAnimals = findRelatedAnimals(record, animals);

      return [
        record.date,
        record.type,
        record.title,
        record.animalTag,
        record.animal,
        record.species,
        joinUnique(relatedAnimals.map((animal) => animal.farm)),
        joinUnique(relatedAnimals.map((animal) => animal.paddock)),
        record.details,
      ];
    }),
  ];

  await writeAndShareCsv(`records-${createTimestamp()}.csv`, rows);
}

async function exportAnimalsPdf(animals: Animal[], filters: AnimalExportFilters) {
  const rows = animals.map((animal) => [
    animal.id,
    animal.name || '—',
    animal.species || '—',
    animal.status,
    animal.farm || '—',
    animal.paddock || '—',
    animal.group || '—',
  ]);

  const html = buildPdfHtml({
    title: 'Animal Register',
    subtitle: 'Livestock export',
    countLabel: `${animals.length} ${animals.length === 1 ? 'animal' : 'animals'}`,
    filterSummary: getAnimalFilterSummary(filters),
    headers: ['Animal ID', 'Name', 'Species', 'Status', 'Farm', 'Paddock', 'Group'],
    rows,
  });

  await printAndSharePdf(html);
}

async function exportRecordsPdf(records: RecordEntry[], animals: Animal[], filters: RecordExportFilters) {
  const rows = records.map((record) => {
    const relatedAnimals = findRelatedAnimals(record, animals);

    return [
      record.date,
      record.type,
      record.title,
      record.animalTag || '—',
      record.animal || '—',
      joinUnique(relatedAnimals.map((animal) => animal.farm)) || '—',
      joinUnique(relatedAnimals.map((animal) => animal.paddock)) || '—',
    ];
  });

  const html = buildPdfHtml({
    title: 'Records Export',
    subtitle: 'Livestock export',
    countLabel: `${records.length} ${records.length === 1 ? 'record' : 'records'}`,
    filterSummary: getRecordFilterSummary(filters),
    headers: ['Date', 'Type', 'Title', 'Animal ID', 'Animal Name', 'Farm', 'Paddock'],
    rows,
  });

  await printAndSharePdf(html);
}

async function printAndSharePdf(html: string) {
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
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
  subtitle,
  countLabel,
  filterSummary,
  headers,
  rows,
}: {
  title: string;
  subtitle: string;
  countLabel: string;
  filterSummary: string[];
  headers: string[];
  rows: string[][];
}) {
  const generatedOn = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  const filterTags = filterSummary.length > 0 ? filterSummary : ['No filters applied'];

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #171717;
          padding: 28px;
        }
        .header {
          background: #f5f3f7;
          border-radius: 24px;
          padding: 24px;
          margin-bottom: 20px;
        }
        .eyebrow {
          color: #dd6560;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin: 0 0 8px;
        }
        h1 {
          margin: 0;
          font-size: 28px;
          line-height: 1.2;
        }
        .meta {
          margin-top: 10px;
          color: #5f5f5f;
          font-size: 14px;
        }
        .filters {
          margin-top: 16px;
        }
        .filter-tag {
          display: inline-block;
          background: #f7e3e1;
          color: #74423f;
          border-radius: 999px;
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 700;
          margin: 0 8px 8px 0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          overflow: hidden;
          border-radius: 18px;
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
        tbody tr:nth-child(even) td {
          background: #faf8fb;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <p class="eyebrow">${escapeHtml(subtitle)}</p>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">${escapeHtml(countLabel)} • Generated ${escapeHtml(generatedOn)}</div>
        <div class="filters">
          ${filterTags.map((tag) => `<span class="filter-tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
      </div>

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
    </body>
  </html>`;
}

function isSelectedAnimalOption(filters: AnimalExportFilters, key: MultiSelectKey, value: string) {
  if (key === 'statuses') return filters.statuses.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'species') return filters.species.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'farms') return filters.farms.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'paddocks') return filters.paddocks.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'groups') return filters.groups.some((entry) => equalsIgnoreCase(entry, value));
  return false;
}

function isSelectedRecordOption(filters: RecordExportFilters, key: MultiSelectKey, value: string) {
  if (key === 'species') return filters.species.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'recordTypes') return filters.recordTypes.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'farms') return filters.farms.some((entry) => equalsIgnoreCase(entry, value));
  if (key === 'paddocks') return filters.paddocks.some((entry) => equalsIgnoreCase(entry, value));
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
    case 'paddocks':
      return 'Select paddocks';
    case 'groups':
      return 'Select groups';
    default:
      return 'Select options';
  }
}

function needsExtraDropdownGap(key: MultiSelectKey | null) {
  return key === 'recordTypes' || key === 'farms' || key === 'paddocks';
}

function getAnimalFilterSummary(filters: AnimalExportFilters) {
  const summary: string[] = [];

  if (filters.searchQuery.trim()) summary.push(`Search: ${filters.searchQuery.trim()}`);
  if (filters.statuses.length > 0) summary.push(`Status: ${filters.statuses.join(', ')}`);
  if (filters.species.length > 0) summary.push(`Species: ${filters.species.join(', ')}`);
  if (filters.farms.length > 0) summary.push(`Farm: ${filters.farms.join(', ')}`);
  if (filters.paddocks.length > 0) summary.push(`Paddock: ${filters.paddocks.join(', ')}`);
  if (filters.groups.length > 0) summary.push(`Group: ${filters.groups.join(', ')}`);

  return summary;
}

function getRecordFilterSummary(filters: RecordExportFilters) {
  const summary: string[] = [];

  if (filters.searchQuery.trim()) summary.push(`Search: ${filters.searchQuery.trim()}`);
  if (filters.startDate) summary.push(`From: ${filters.startDate}`);
  if (filters.endDate) summary.push(`To: ${filters.endDate}`);
  if (filters.recordTypes.length > 0) summary.push(`Type: ${filters.recordTypes.join(', ')}`);
  if (filters.species.length > 0) summary.push(`Species: ${filters.species.join(', ')}`);
  if (filters.farms.length > 0) summary.push(`Farm: ${filters.farms.join(', ')}`);
  if (filters.paddocks.length > 0) summary.push(`Paddock: ${filters.paddocks.join(', ')}`);

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

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function parseDateValue(value: string | null) {
  if (!value) {
    return null;
  }

  const [dayPart, monthPart, yearPart] = value.trim().split(/\s+/);

  if (!dayPart || !monthPart || !yearPart) {
    return null;
  }

  const day = Number(dayPart);
  const year = Number(yearPart);
  const month = MONTH_INDEX[monthPart.toLowerCase()];

  if (!Number.isFinite(day) || !Number.isFinite(year) || month === undefined) {
    return null;
  }

  return new Date(year, month, day);
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

function escapeHtml(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
    gap: 10,
  },
  segmentButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  segmentButtonActive: {
    backgroundColor: tokens.colors.accentSoft,
  },
  segmentButtonIdle: {
    backgroundColor: '#F5F3F7',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: tokens.colors.text,
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
  actionStack: {
    gap: 10,
  },
  exportButton: {
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: tokens.colors.accent,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  exportLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    justifyContent: 'flex-end',
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
    backgroundColor: '#FCE5E4',
  },
  selectionText: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    paddingRight: 10,
  },
  selectionTextActive: {
    color: '#74423F',
    fontWeight: '700',
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
