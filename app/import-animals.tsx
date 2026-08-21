import { useRouter } from 'expo-router';
import { Fragment, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { InfoModal } from '../src/components/InfoModal';
import { SPECIES_OPTIONS } from '../src/constants/records';
import { useAccount } from '../src/context/AccountContext';
import { useAnimals } from '../src/context/AnimalsContext';
import { useSetup } from '../src/context/SetupContext';
import type { AnimalSex, AnimalStatus } from '../src/entities/animal';
import { tokens } from '../src/theme/tokens';
import {
  analyzeImport,
  autoMapColumns,
  buildImportTable,
  buildTagTable,
  DEFAULT_IMPORT_DEFAULTS,
  readyAnimals,
  splitTagList,
  type BuildTableFailure,
  type ImportColumnMapping,
  type ImportDefaults,
  type ImportRowResult,
  type ImportTable,
  type ImportValueOverrides,
} from '../src/utils/animalImport';
import { pickCsvFile, readCsvFileText, shareTemplateCsv } from '../src/utils/animalImportFile';
import {
  ANIMAL_IMPORT_FIELDS,
  ANIMAL_IMPORT_FIELD_LABELS,
  normalizeLookupKey,
  optionsForMappedField,
  type AnimalImportField,
  type MappedValueField,
} from '../src/utils/importAliases';

/**
 * Bringing an existing flock or herd into the app, which is the moment a new
 * user either stays or gives up. Three ways in — typed tags, a pasted table,
 * or a CSV file — converging on one preview that must be confirmed before a
 * single animal is written.
 *
 * The whole flow lives in one screen as a step machine rather than a set of
 * routes: every step operates on the same parsed table, mapping and answers,
 * and threading that through navigation params would mean serialising a whole
 * spreadsheet between screens.
 */

type Step = 'choose' | 'tags' | 'paste' | 'columns' | 'values' | 'preview';

const STEP_TITLES: Record<Step, string> = {
  choose: 'Import animals',
  tags: 'Type tag numbers',
  paste: 'Paste your table',
  columns: 'Check the columns',
  values: 'A few words to check',
  preview: 'Review before importing',
};

/**
 * The named stages shown above every step. Three for a table — the data, its
 * columns, the review — and two for typed tags, which have no columns to map
 * and so never visit that stage.
 *
 * Naming them up front is what turns a run of questions into one short task
 * with a visible end: without it the second screen could be the last or the
 * fifth, and there is no way to tell from inside it.
 */
// Kept to a word or two each: three labels, three numbers and two connectors
// have to sit on one line of a phone, and a stage that ellipsises is worse
// than a shorter word — the screen's own title says the longer version.
const TABLE_STAGES = ['Your data', 'Columns', 'Review'] as const;
const TAG_STAGES = ['Tag numbers', 'Review'] as const;

function stageIndexForStep(step: Step, stageCount: number) {
  switch (step) {
    case 'columns':
    case 'values':
      return 1;
    case 'preview':
      // Last whichever route got here — the tag list has one stage fewer.
      return stageCount - 1;
    default:
      return 0;
  }
}

const HELP_DESCRIPTION =
  'Typing tag numbers is the quickest way in when your animals share the same details — enter one tag per line, choose the details they have in common, and each one becomes its own animal.\n\n' +
  'A CSV file lets every animal carry its own details: one animal per row, one detail per column. Any spreadsheet can save a CSV — in Excel or Numbers choose File, then Export or Save As, then CSV.\n\n' +
  'Pasting works the same way as a file, for when your list is in a note or an email rather than a file you can pick.\n\n' +
  'Nothing is added until you have seen the preview and pressed Import.';

const FAILURE_MESSAGES: Record<BuildTableFailure, { title: string; message: string }> = {
  xlsx: {
    title: 'That is an Excel workbook',
    message:
      'LivestockBook reads CSV files. Open the workbook, choose File, then Save As or Export, and pick CSV — then try again.',
  },
  'legacy-excel': {
    title: 'That is an Excel workbook',
    message:
      'LivestockBook reads CSV files. Open the workbook, choose File, then Save As or Export, and pick CSV — then try again.',
  },
  utf16: {
    title: 'This file could not be read',
    message:
      'It is saved in a text encoding LivestockBook cannot read. Open it in your spreadsheet app and save it again as CSV UTF-8.',
  },
  mojibake: {
    title: 'Some characters came through broken',
    message:
      'This file is not saved as UTF-8, so accented letters would be imported incorrectly. Open it in your spreadsheet app and save it again as CSV UTF-8.',
  },
  empty: {
    title: 'Nothing to import',
    message: 'That file has no rows in it.',
  },
};

export default function ImportAnimalsScreen() {
  const router = useRouter();
  const { animals, addAnimalsBatch } = useAnimals();
  const {
    farms,
    farmEntities,
    locationEntities,
    labelEntities,
    addFarm,
    addLocation,
    addLabel,
  } = useSetup();
  const { profile } = useAccount();

  const [step, setStep] = useState<Step>('choose');
  const [showHelp, setShowHelp] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  // Which way in the user chose. The preview is reached from typed tags and
  // from a mapped table alike, and only this says which — by then the two are
  // the same parsed table and cannot be told apart by looking at it.
  const [route, setRoute] = useState<'tags' | 'table'>('table');

  const [tagText, setTagText] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [table, setTable] = useState<ImportTable | null>(null);
  const [mapping, setMapping] = useState<ImportColumnMapping>([]);
  const [valueOverrides, setValueOverrides] = useState<ImportValueOverrides>({});
  const [defaults, setDefaults] = useState<ImportDefaults>(DEFAULT_IMPORT_DEFAULTS);
  const [createMissingSetup, setCreateMissingSetup] = useState(true);

  const [columnPickerIndex, setColumnPickerIndex] = useState<number | null>(null);
  const [valuePickerKey, setValuePickerKey] = useState<{ field: MappedValueField; value: string } | null>(null);
  const [defaultsPicker, setDefaultsPicker] = useState<'species' | 'status' | 'farm' | 'location' | 'label' | null>(null);

  const analysis = useMemo(() => {
    if (!table) {
      return null;
    }

    return analyzeImport({
      table,
      mapping,
      defaults,
      valueOverrides,
      dateFormat: profile.dateFormat,
      existingAnimals: animals,
      farms: farmEntities,
      locations: locationEntities,
      labels: labelEntities,
    });
  }, [animals, defaults, farmEntities, labelEntities, mapping, locationEntities, profile.dateFormat, table, valueOverrides]);

  const goBack = () => {
    switch (step) {
      case 'choose':
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)/animals');
        }
        return;
      case 'tags':
      case 'paste':
        setStep('choose');
        return;
      case 'columns':
        setStep(sourceName ? 'choose' : 'paste');
        return;
      case 'values':
        setStep('columns');
        return;
      case 'preview':
        // Typed tags never pass through the column step, so back from the
        // preview returns to wherever the rows actually came from.
        setStep(route === 'tags' ? 'tags' : 'columns');
        return;
    }
  };

  const reportFailure = (reason: BuildTableFailure) => {
    const { title, message } = FAILURE_MESSAGES[reason];
    Alert.alert(title, message);
  };

  const loadText = (text: string, name: string) => {
    const result = buildImportTable(text);

    if (!result.ok) {
      reportFailure(result.reason);
      return;
    }

    setSourceName(name);
    setTable(result.table);
    setMapping(autoMapColumns(result.table.headers));
    setValueOverrides({});
    setStep('columns');
  };

  const handlePickFile = async () => {
    setIsBusy(true);

    try {
      const picked = await pickCsvFile();

      if (picked.canceled) {
        return;
      }

      const text = await readCsvFileText(picked.uri);
      loadText(text, picked.name);
    } catch {
      Alert.alert('That file could not be read', 'Please try again, or paste the rows instead.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleShareTemplate = async () => {
    try {
      const shared = await shareTemplateCsv();

      if (!shared) {
        Alert.alert('Template unavailable', 'The template could not be created on this device.');
      }
    } catch {
      Alert.alert('Template unavailable', 'The template could not be created on this device.');
    }
  };

  const handleTagsContinue = () => {
    setSourceName('');
    setPasteText('');
    setTable(buildTagTable(tagText));
    setMapping(['tag']);
    setValueOverrides({});
    setStep('preview');
  };

  const handlePasteContinue = () => {
    setSourceName('');
    loadText(pasteText, '');
  };

  const handleColumnsContinue = () => {
    setStep(analysis && analysis.unmappedValues.length > 0 ? 'values' : 'preview');
  };

  const setOverride = (field: MappedValueField, rawValue: string, choice: string) => {
    setValueOverrides((current) => ({
      ...current,
      [field]: { ...(current[field] ?? {}), [normalizeLookupKey(rawValue)]: choice },
    }));
  };

  const handleImport = async () => {
    if (!analysis) {
      return;
    }

    const inputs = readyAnimals(analysis);

    if (inputs.length === 0) {
      Alert.alert('Nothing to import', 'No rows are ready. Check the notes against each row above.');
      return;
    }

    setIsBusy(true);

    try {
      if (createMissingSetup) {
        // Created before the animals so the names exist in Setup straight
        // away. The animals carry the names; their uid links are resolved by
        // name, the same way stored animals are reconnected on launch.
        for (const name of analysis.newFarms) {
          await addFarm({ name, holdingId: '', notes: '' });
        }

        for (const name of analysis.newLocations) {
          const farmName = inputs.find((animal) => animal.location === name)?.farm ?? '';
          await addLocation({ name, farm: farmName, notes: '' });
        }

        for (const name of analysis.newLabels) {
          await addLabel({ name, animals: '', notes: '' });
        }
      }

      const result = await addAnimalsBatch(inputs);

      if (!result.ok) {
        Alert.alert(
          'Nothing was imported',
          'Your animals could not be saved, so none of them were added. Please try again.',
        );
        return;
      }

      const addedCount = result.added.length;
      Alert.alert(
        'Import complete',
        `${addedCount} ${addedCount === 1 ? 'animal was' : 'animals were'} added.`,
      );
      router.replace('/(tabs)/animals');
    } finally {
      setIsBusy(false);
    }
  };

  /**
   * What is stopping the primary button, in the words the user needs to hear.
   * Null when the step is ready to move on.
   *
   * Said under a dimmed button rather than in an alert: an alert has to be
   * dismissed before the very thing it complains about can be reached, and it
   * only appears after a press that was never going to work.
   */
  const continueBlock = useMemo<string | null>(() => {
    switch (step) {
      case 'tags':
        if (splitTagList(tagText).length === 0) {
          return 'Enter at least one tag number, one per line, to continue.';
        }

        if (!defaults.species.trim()) {
          return 'Choose the species these animals share to continue.';
        }

        return null;
      case 'paste':
        return pasteText.trim() ? null : 'Paste your rows above to continue.';
      case 'columns':
        if (!mapping.includes('tag')) {
          return 'Tap the column holding the tag or ID and choose Tag / ID.';
        }

        if (!mapping.includes('species') && !defaults.species.trim()) {
          return 'Choose the species these animals share to continue.';
        }

        return null;
      case 'preview':
        return analysis && analysis.readyCount > 0
          ? null
          : 'No rows are ready — check the notes against each row above.';
      default:
        return null;
    }
  }, [analysis, defaults.species, mapping, pasteText, step, tagText]);

  const stages = route === 'tags' ? TAG_STAGES : TABLE_STAGES;

  const availableLocations = useMemo(
    () =>
      locationEntities
        .filter((entry) => !defaults.farm || entry.farm.trim().toLowerCase() === defaults.farm.trim().toLowerCase())
        .map((entry) => entry.name),
    [defaults.farm, locationEntities],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title={STEP_TITLES[step]}
        leftAction={{ icon: 'back', accessibilityLabel: 'Back', onPress: goBack }}
        actions={[
          {
            icon: 'help-circle',
            accessibilityLabel: 'How importing works',
            onPress: () => setShowHelp(true),
          },
        ]}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hidden on the opening menu: nothing has been provided yet, so no
            stage is under way and the route the stages describe is unchosen. */}
        {step === 'choose' ? null : (
          <StepIndicator stages={stages} activeIndex={stageIndexForStep(step, stages.length)} />
        )}

        {step === 'choose' ? (
          <ChooseStep
            onTyped={() => {
              setRoute('tags');
              setStep('tags');
            }}
            onFile={() => {
              setRoute('table');
              void handlePickFile();
            }}
            onPaste={() => {
              setRoute('table');
              setStep('paste');
            }}
            onTemplate={handleShareTemplate}
          />
        ) : null}

        {step === 'tags' ? (
          <TagsStep
            tagText={tagText}
            onChangeTagText={setTagText}
            defaults={defaults}
            onChangeDefaults={setDefaults}
            farms={farms}
            locations={availableLocations}
            labels={labelEntities.map((entry) => entry.name)}
            onOpenPicker={setDefaultsPicker}
          />
        ) : null}

        {step === 'paste' ? (
          <PasteStep pasteText={pasteText} onChangePasteText={setPasteText} />
        ) : null}

        {step === 'columns' && table ? (
          <ColumnsStep
            table={table}
            mapping={mapping}
            sourceName={sourceName}
            speciesDefault={defaults.species}
            onEditColumn={setColumnPickerIndex}
            onEditSpecies={() => setDefaultsPicker('species')}
          />
        ) : null}

        {step === 'values' && analysis ? (
          <ValuesStep
            unmapped={analysis.unmappedValues}
            overrides={valueOverrides}
            onEditValue={(field, value) => setValuePickerKey({ field, value })}
          />
        ) : null}

        {step === 'preview' && analysis ? (
          <PreviewStep
            analysis={analysis}
            createMissingSetup={createMissingSetup}
            onToggleCreateMissing={() => setCreateMissingSetup((current) => !current)}
          />
        ) : null}
      </ScrollView>

      {step !== 'choose' ? (
        <View style={styles.footer}>
          <BouncyPressable
            accessibilityLabel={step === 'preview' ? 'Import animals' : 'Continue'}
            accessibilityRole="button"
            accessibilityState={{ disabled: isBusy || continueBlock !== null }}
            disabled={isBusy || continueBlock !== null}
            onPress={() => {
              if (step === 'tags') {
                handleTagsContinue();
                return;
              }

              if (step === 'paste') {
                handlePasteContinue();
                return;
              }

              if (step === 'columns') {
                handleColumnsContinue();
                return;
              }

              if (step === 'values') {
                setStep('preview');
                return;
              }

              void handleImport();
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              (isBusy || continueBlock !== null) && styles.primaryButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            {isBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {step === 'preview'
                  ? `Import ${analysis?.readyCount ?? 0} ${analysis?.readyCount === 1 ? 'animal' : 'animals'}`
                  : 'Continue'}
              </Text>
            )}
          </BouncyPressable>
          {continueBlock ? <Text style={styles.footerHint}>{continueBlock}</Text> : null}
        </View>
      ) : null}

      {isBusy && step === 'choose' ? (
        <View style={styles.busyOverlay} pointerEvents="none">
          <ActivityIndicator color={tokens.colors.accent} size="large" />
        </View>
      ) : null}

      <PickerModal
        title="This column holds"
        visible={columnPickerIndex !== null}
        options={['Ignore this column', ...ANIMAL_IMPORT_FIELDS.map((field) => field.label)]}
        selected={
          columnPickerIndex === null || !mapping[columnPickerIndex]
            ? 'Ignore this column'
            : ANIMAL_IMPORT_FIELD_LABELS[mapping[columnPickerIndex] as AnimalImportField]
        }
        onSelect={(option) => {
          if (columnPickerIndex === null) {
            return;
          }

          const field =
            ANIMAL_IMPORT_FIELDS.find((entry) => entry.label === option)?.id ?? null;

          setMapping((current) =>
            current.map((existing, index) => {
              if (index === columnPickerIndex) {
                return field;
              }

              // A field can only come from one column, so choosing it here
              // releases whichever column held it before.
              return field && existing === field ? null : existing;
            }),
          );
          setColumnPickerIndex(null);
        }}
        onClose={() => setColumnPickerIndex(null)}
      />

      <PickerModal
        title={valuePickerKey ? `"${valuePickerKey.value}" means` : ''}
        visible={valuePickerKey !== null}
        options={valuePickerKey ? [...optionsForMappedField(valuePickerKey.field), 'Leave blank'] : []}
        selected={
          valuePickerKey
            ? valueOverrides[valuePickerKey.field]?.[normalizeLookupKey(valuePickerKey.value)] || ''
            : ''
        }
        onSelect={(option) => {
          if (!valuePickerKey) {
            return;
          }

          setOverride(valuePickerKey.field, valuePickerKey.value, option === 'Leave blank' ? '' : option);
          setValuePickerKey(null);
        }}
        onClose={() => setValuePickerKey(null)}
      />

      <PickerModal
        title={defaultsPicker ? `Select ${defaultsPicker}` : ''}
        visible={defaultsPicker !== null}
        options={
          defaultsPicker === 'species'
            ? SPECIES_OPTIONS.map((option) => option.label)
            : defaultsPicker === 'status'
              ? ['Active', 'Sold', 'Deceased']
              : defaultsPicker === 'farm'
                ? farms
                : defaultsPicker === 'location'
                  ? availableLocations
                  : defaultsPicker === 'label'
                    ? labelEntities.map((entry) => entry.name)
                    : []
        }
        selected={defaultsPicker ? String(defaults[defaultsPicker] ?? '') : ''}
        onSelect={(option) => {
          if (!defaultsPicker) {
            return;
          }

          setDefaults((current) => ({ ...current, [defaultsPicker]: option }));
          setDefaultsPicker(null);
        }}
        onClose={() => setDefaultsPicker(null)}
      />

      <InfoModal
        visible={showHelp}
        onClose={() => setShowHelp(false)}
        title="Importing animals"
        description={HELP_DESCRIPTION}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function ChooseStep({
  onTyped,
  onFile,
  onPaste,
  onTemplate,
}: {
  onTyped: () => void;
  onFile: () => void;
  onPaste: () => void;
  onTemplate: () => void;
}) {
  return (
    <>
      <Text style={styles.lead}>How is your list written down?</Text>

      <OptionCard
        icon="tag"
        title="Type tag numbers"
        text="One tag per line. Every animal gets the same details, which you choose next."
        onPress={onTyped}
      />
      <OptionCard
        icon="enter-arrow"
        title="Import a CSV file"
        text="One animal per row, with its own details. Saved from Excel, Numbers or Sheets."
        onPress={onFile}
      />
      <OptionCard
        icon="edit"
        title="Paste a table"
        text="Copied from a note, an email or a message rather than a file."
        onPress={onPaste}
      />

      <BouncyPressable
        accessibilityLabel="Get the CSV template"
        accessibilityRole="button"
        onPress={onTemplate}
        style={({ pressed }) => [styles.templateRow, pressed && styles.pressed]}
      >
        <AppIcon name="export-download-outline" size={18} color={tokens.colors.accent} />
        <Text style={styles.templateText}>Get the template to fill in</Text>
      </BouncyPressable>

      <Text style={styles.footnote}>
        Nothing is added until you have seen the preview and pressed Import.
      </Text>
    </>
  );
}

function TagsStep({
  tagText,
  onChangeTagText,
  defaults,
  onChangeDefaults,
  farms,
  locations,
  labels,
  onOpenPicker,
}: {
  tagText: string;
  onChangeTagText: (value: string) => void;
  defaults: ImportDefaults;
  onChangeDefaults: (updater: (current: ImportDefaults) => ImportDefaults) => void;
  farms: string[];
  locations: string[];
  labels: string[];
  onOpenPicker: (picker: 'species' | 'status' | 'farm' | 'location' | 'label') => void;
}) {
  const count = splitTagList(tagText).length;

  return (
    <>
      <Text style={styles.lead}>One tag per line</Text>
      <View style={styles.card}>
        <TextInput
          accessibilityLabel="Tag numbers"
          multiline
          placeholder={'UK123456700001\nUK123456700002\nUK123456700003'}
          placeholderTextColor="#9a9a9a"
          style={styles.tagInput}
          textAlignVertical="top"
          value={tagText}
          onChangeText={onChangeTagText}
        />
      </View>
      <Text style={styles.countLine}>
        {count === 0 ? 'No tags yet' : `${count} ${count === 1 ? 'tag' : 'tags'}`}
      </Text>

      <Text style={styles.sectionLabel}>Details they all share</Text>
      <View style={styles.card}>
        <SelectionRow label="Species" value={defaults.species} empty="Select species" onPress={() => onOpenPicker('species')} />
        <ChoiceRow
          label="Sex"
          options={['female', 'male']}
          labels={['Female', 'Male']}
          value={defaults.sex}
          onSelect={(value) => onChangeDefaults((current) => ({ ...current, sex: value as AnimalSex }))}
        />
        <SelectionRow label="Status" value={defaults.status} empty="Active" onPress={() => onOpenPicker('status')} />
        <View style={styles.inlineField}>
          <Text style={styles.fieldLabel}>Breed</Text>
          <TextInput
            accessibilityLabel="Breed"
            placeholder="Optional"
            placeholderTextColor="#9a9a9a"
            style={styles.inlineInput}
            value={defaults.breed}
            onChangeText={(value) => onChangeDefaults((current) => ({ ...current, breed: value }))}
          />
        </View>
        <SelectionRow
          label="Farm"
          value={defaults.farm}
          empty={farms.length === 0 ? 'No farms set up' : 'Optional'}
          onPress={() => farms.length > 0 && onOpenPicker('farm')}
        />
        <SelectionRow
          label="Location"
          value={defaults.location}
          empty={locations.length === 0 ? 'No locations set up' : 'Optional'}
          onPress={() => locations.length > 0 && onOpenPicker('location')}
        />
        <SelectionRow
          label="Label"
          value={defaults.label}
          empty={labels.length === 0 ? 'No labels set up' : 'Optional'}
          onPress={() => labels.length > 0 && onOpenPicker('label')}
        />
      </View>
      <Text style={styles.footnote}>
        You can edit any animal afterwards — this just saves typing the same thing {count || 'many'} times.
      </Text>
    </>
  );
}

function PasteStep({
  pasteText,
  onChangePasteText,
}: {
  pasteText: string;
  onChangePasteText: (value: string) => void;
}) {
  return (
    <>
      <Text style={styles.lead}>Paste the rows, including the heading row if it has one</Text>
      <View style={styles.card}>
        <TextInput
          accessibilityLabel="Pasted rows"
          multiline
          placeholder={'Tag,Name,Species,Sex\nUK1001,Bess,Cattle,Female\nUK1002,Daisy,Cattle,Female'}
          placeholderTextColor="#9a9a9a"
          style={styles.pasteInput}
          textAlignVertical="top"
          value={pasteText}
          onChangeText={onChangePasteText}
        />
      </View>
      <Text style={styles.footnote}>
        Commas, semicolons and tabs all work as separators — whichever your list already uses.
      </Text>
    </>
  );
}

function ColumnsStep({
  table,
  mapping,
  sourceName,
  speciesDefault,
  onEditColumn,
  onEditSpecies,
}: {
  table: ImportTable;
  mapping: ImportColumnMapping;
  sourceName: string;
  speciesDefault: string;
  onEditColumn: (index: number) => void;
  onEditSpecies: () => void;
}) {
  return (
    <>
      <Text style={styles.lead}>
        {sourceName ? `${sourceName} · ` : ''}
        {table.rows.length} {table.rows.length === 1 ? 'row' : 'rows'}
      </Text>
      <Text style={styles.helperText}>
        {table.hasHeaderRow
          ? 'Tap any column to change what it holds. Columns set to Ignore are left out.'
          : 'This list has no heading row, so tap each column to say what it holds.'}
      </Text>

      <View style={styles.card}>
        {table.headers.map((header, index) => {
          const field = mapping[index];
          const sample = table.rows.find((row) => (row[index] ?? '').trim())?.[index]?.trim() ?? '';

          return (
            <BouncyPressable
              key={`${header}-${index}`}
              accessibilityLabel={`Column ${header}`}
              accessibilityRole="button"
              onPress={() => onEditColumn(index)}
              style={({ pressed }) => [styles.columnRow, pressed && styles.pressed]}
            >
              <View style={styles.columnCopy}>
                <Text style={styles.columnHeader} numberOfLines={1}>
                  {header || `Column ${index + 1}`}
                </Text>
                {sample ? (
                  <Text style={styles.columnSample} numberOfLines={1}>
                    e.g. {sample}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.columnField, !field && styles.columnFieldIgnored]}>
                {field ? ANIMAL_IMPORT_FIELD_LABELS[field] : 'Ignore'}
              </Text>
              <AppIcon name="chevron-down" size={16} color={tokens.colors.text} />
            </BouncyPressable>
          );
        })}
      </View>

      {mapping.includes('species') ? null : (
        <>
          <Text style={styles.sectionLabel}>Species</Text>
          <Text style={styles.helperText}>
            This list has no species column, so every animal in it needs the same one.
          </Text>
          <View style={styles.card}>
            <SelectionRow
              label="Species for every row"
              value={speciesDefault}
              empty="Select species"
              onPress={onEditSpecies}
            />
          </View>
        </>
      )}
    </>
  );
}

function ValuesStep({
  unmapped,
  overrides,
  onEditValue,
}: {
  unmapped: Array<{ field: MappedValueField; value: string; count: number }>;
  overrides: ImportValueOverrides;
  onEditValue: (field: MappedValueField, value: string) => void;
}) {
  return (
    <>
      <Text style={styles.lead}>These words were not recognised</Text>
      <Text style={styles.helperText}>
        Each one is asked about once, however many rows use it. Nothing is guessed — a word left
        unanswered keeps its rows out of the import.
      </Text>

      <View style={styles.card}>
        {unmapped.map((entry) => {
          const answer = overrides[entry.field]?.[normalizeLookupKey(entry.value)];

          return (
            <BouncyPressable
              key={`${entry.field}-${entry.value}`}
              accessibilityLabel={`Map ${entry.value}`}
              accessibilityRole="button"
              onPress={() => onEditValue(entry.field, entry.value)}
              style={({ pressed }) => [styles.columnRow, pressed && styles.pressed]}
            >
              <View style={styles.columnCopy}>
                <Text style={styles.columnHeader} numberOfLines={1}>
                  {entry.value}
                </Text>
                <Text style={styles.columnSample}>
                  {ANIMAL_IMPORT_FIELD_LABELS[entry.field]} · {entry.count}{' '}
                  {entry.count === 1 ? 'row' : 'rows'}
                </Text>
              </View>
              <Text style={[styles.columnField, answer === undefined && styles.columnFieldIgnored]}>
                {answer === undefined ? 'Choose' : answer === '' ? 'Leave blank' : answer}
              </Text>
              <AppIcon name="chevron-down" size={16} color={tokens.colors.text} />
            </BouncyPressable>
          );
        })}
      </View>
    </>
  );
}

/** How many rows the preview lists before summarising the rest. */
const PREVIEW_ROW_LIMIT = 40;

function PreviewStep({
  analysis,
  createMissingSetup,
  onToggleCreateMissing,
}: {
  analysis: NonNullable<ReturnType<typeof analyzeImport>>;
  createMissingSetup: boolean;
  onToggleCreateMissing: () => void;
}) {
  // Rows needing attention come first: a problem 300 rows down would otherwise
  // never be seen.
  const ordered = useMemo(() => {
    const weight: Record<ImportRowResult['status'], number> = { blocked: 0, skipped: 1, ready: 2 };
    return [...analysis.rows].sort((left, right) => weight[left.status] - weight[right.status]);
  }, [analysis.rows]);

  const shown = ordered.slice(0, PREVIEW_ROW_LIMIT);
  const newSetupNames = [...analysis.newFarms, ...analysis.newLocations, ...analysis.newLabels];

  return (
    <>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryHeadline}>
          {analysis.readyCount} ready to import
        </Text>
        <Text style={styles.summaryDetail}>
          {analysis.skippedCount > 0
            ? `${analysis.skippedCount} skipped as already recorded · `
            : ''}
          {analysis.blockedCount > 0 ? `${analysis.blockedCount} need attention · ` : ''}
          {analysis.rows.length} {analysis.rows.length === 1 ? 'row' : 'rows'} read
        </Text>
      </View>


      {newSetupNames.length > 0 ? (
        <BouncyPressable
          accessibilityLabel="Create missing farms, locations and labels"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: createMissingSetup }}
          onPress={onToggleCreateMissing}
          style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}
        >
          <View style={[styles.checkbox, createMissingSetup && styles.checkboxChecked]}>
            {createMissingSetup ? <AppIcon name="check" size={14} color="#fff" /> : null}
          </View>
          <View style={styles.columnCopy}>
            <Text style={styles.toggleTitle}>Also create {newSetupNames.length} new names in Setup</Text>
            <Text style={styles.columnSample} numberOfLines={2}>
              {newSetupNames.join(', ')}
            </Text>
          </View>
        </BouncyPressable>
      ) : null}

      <View style={styles.card}>
        {shown.map((row) => (
          <View key={`${row.rowNumber}-${row.tag}`} style={styles.previewRow}>
            <View
              style={[
                styles.statusDot,
                row.status === 'ready'
                  ? styles.statusReady
                  : row.status === 'skipped'
                    ? styles.statusSkipped
                    : styles.statusBlocked,
              ]}
            />
            <View style={styles.columnCopy}>
              <Text style={styles.previewTag} numberOfLines={1}>
                {row.tag || `Row ${row.rowNumber}`}
              </Text>
              <Text style={styles.columnSample} numberOfLines={2}>
                {describeRow(row)}
              </Text>
            </View>
          </View>
        ))}
        {ordered.length > shown.length ? (
          <Text style={styles.moreRows}>
            and {ordered.length - shown.length} more {ordered.length - shown.length === 1 ? 'row' : 'rows'}
          </Text>
        ) : null}
      </View>
    </>
  );
}

function describeRow(row: ImportRowResult) {
  if (row.status === 'ready') {
    const animal = row.animal;
    return [animal?.species, animal?.name, animal?.status].filter(Boolean).join(' · ') || 'Ready';
  }

  return row.issues.map(describeIssue).join(' · ');
}

function describeIssue(issue: ImportRowResult['issues'][number]) {
  switch (issue.kind) {
    case 'missing-tag':
      return 'No tag number in this row';
    case 'duplicate-in-file':
      return `Same tag as row ${issue.firstRowNumber}`;
    case 'duplicate-existing':
      return 'Already in your animals';
    case 'unmapped-value':
      return `"${issue.value}" not understood as ${ANIMAL_IMPORT_FIELD_LABELS[issue.field]}`;
    case 'invalid-date':
      return `"${issue.value}" is not a date`;
    case 'invalid-weight':
      return `"${issue.value}" is not a weight`;
  }
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function StepIndicator({
  stages,
  activeIndex,
}: {
  stages: readonly string[];
  activeIndex: number;
}) {
  return (
    <View
      accessibilityLabel={`Step ${activeIndex + 1} of ${stages.length}: ${stages[activeIndex]}`}
      accessibilityRole="header"
      style={styles.stageRow}
    >
      {stages.map((label, index) => {
        const isDone = index < activeIndex;
        const isActive = index === activeIndex;

        return (
          <Fragment key={label}>
            {index > 0 ? <View style={styles.stageConnector} /> : null}
            <View style={styles.stage}>
              <View style={[styles.stageDot, (isDone || isActive) && styles.stageDotFilled]}>
                {isDone ? (
                  <AppIcon name="check" size={11} color="#fff" />
                ) : (
                  <Text style={[styles.stageNumber, isActive && styles.stageNumberActive]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.stageLabel,
                  isDone && styles.stageLabelDone,
                  isActive && styles.stageLabelActive,
                ]}
              >
                {label}
              </Text>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

function OptionCard({
  icon,
  title,
  text,
  onPress,
}: {
  icon: Parameters<typeof AppIcon>[0]['name'];
  title: string;
  text: string;
  onPress: () => void;
}) {
  return (
    <BouncyPressable
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.optionCard, pressed && styles.pressed]}
    >
      <View style={styles.optionIcon}>
        <AppIcon name={icon} size={24} color={tokens.colors.text} />
      </View>
      <View style={styles.columnCopy}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionText}>{text}</Text>
      </View>
      <AppIcon name="chevron-right-minimal" size={18} color="#171717" />
    </BouncyPressable>
  );
}

function SelectionRow({
  label,
  value,
  empty,
  onPress,
}: {
  label: string;
  value: string;
  empty: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.inlineField}
    >
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inlineValueRow}>
        <Text style={[styles.inlineValue, !value && styles.inlinePlaceholder]}>{value || empty}</Text>
        <AppIcon name="chevron-down" size={16} color={tokens.colors.text} />
      </View>
    </Pressable>
  );
}

function ChoiceRow({
  label,
  options,
  labels,
  value,
  onSelect,
}: {
  label: string;
  options: string[];
  labels: string[];
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.inlineField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choiceRow}>
        {options.map((option, index) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected: option === value }}
            onPress={() => onSelect(option)}
            style={[styles.choiceChip, option === value && styles.choiceChipActive]}
          >
            <Text style={[styles.choiceText, option === value && styles.choiceTextActive]}>
              {labels[index]}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function PickerModal({
  title,
  visible,
  options,
  selected,
  onSelect,
  onClose,
}: {
  title: string;
  visible: boolean;
  options: string[];
  selected: string;
  onSelect: (option: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal animationType="none" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <AnimatedPopupCard visible={visible} style={styles.selectionCard} onPress={() => undefined}>
          <Text style={styles.selectionTitle}>{title}</Text>
          <ScrollView style={styles.selectionScroll}>
            {options.map((option) => (
              <Pressable
                key={option}
                accessibilityLabel={option}
                accessibilityRole="button"
                onPress={() => onSelect(option)}
                style={({ pressed }) => [
                  styles.selectionRow,
                  option === selected && styles.selectionRowActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.selectionText, option === selected && styles.selectionTextActive]}>
                  {option}
                </Text>
                {option === selected ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        </AnimatedPopupCard>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 140,
    gap: 12,
  },
  lead: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
  },
  stage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // Shrinks before the row overflows, so the longest label truncates on the
    // narrowest phones rather than pushing the last stage off the screen.
    flexShrink: 1,
  },
  stageDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: tokens.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageDotFilled: {
    backgroundColor: tokens.colors.accent,
  },
  stageNumber: {
    color: tokens.colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  stageNumberActive: {
    color: '#fff',
  },
  stageLabel: {
    color: tokens.colors.muted,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  stageLabelDone: {
    color: tokens.colors.textSoft,
  },
  stageLabelActive: {
    color: tokens.colors.text,
    fontWeight: '700',
  },
  stageConnector: {
    flex: 1,
    minWidth: 10,
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.colors.border,
    marginHorizontal: 6,
  },
  helperText: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionLabel: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  footnote: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  card: {
    borderRadius: 20,
    backgroundColor: tokens.colors.surfaceMuted,
    padding: 14,
    gap: 10,
  },
  optionCard: {
    minHeight: 88,
    borderRadius: 20,
    backgroundColor: tokens.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  optionIcon: {
    width: 32,
    alignItems: 'center',
  },
  optionTitle: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  optionText: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  templateText: {
    color: tokens.colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  tagInput: {
    minHeight: 190,
    color: tokens.colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  pasteInput: {
    minHeight: 240,
    color: tokens.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  countLine: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  inlineField: {
    gap: 6,
  },
  fieldLabel: {
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  inlineInput: {
    borderRadius: 12,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: tokens.colors.text,
    fontSize: 15,
  },
  inlineValueRow: {
    borderRadius: 12,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inlineValue: {
    color: tokens.colors.text,
    fontSize: 15,
  },
  inlinePlaceholder: {
    color: '#9a9a9a',
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  choiceChip: {
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  choiceChipActive: {
    backgroundColor: tokens.colors.accent,
  },
  choiceText: {
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  choiceTextActive: {
    color: '#fff',
  },
  columnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  columnCopy: {
    flex: 1,
    gap: 2,
  },
  columnHeader: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  columnSample: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  columnField: {
    color: tokens.colors.accent,
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 130,
    textAlign: 'right',
  },
  columnFieldIgnored: {
    color: tokens.colors.muted,
  },
  summaryCard: {
    borderRadius: 20,
    backgroundColor: tokens.colors.accentSoft,
    padding: 16,
    gap: 4,
  },
  summaryHeadline: {
    color: tokens.colors.accentDeep,
    fontSize: 19,
    fontWeight: '800',
  },
  summaryDetail: {
    color: tokens.colors.accentDeep,
    fontSize: 13,
    lineHeight: 19,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    backgroundColor: tokens.colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: tokens.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: tokens.colors.accent,
    borderColor: tokens.colors.accent,
  },
  toggleTitle: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  statusReady: {
    backgroundColor: '#4CAF50',
  },
  statusSkipped: {
    backgroundColor: tokens.colors.muted,
  },
  statusBlocked: {
    backgroundColor: tokens.colors.danger,
  },
  previewTag: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  moreRows: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 6,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 30,
    backgroundColor: tokens.colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.colors.border,
  },
  primaryButton: {
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  footerHint: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 8,
  },
  busyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  selectionCard: {
    width: '100%',
    maxHeight: '70%',
    borderRadius: 22,
    backgroundColor: tokens.colors.surface,
    padding: 16,
    gap: 8,
  },
  selectionScroll: {
    flexGrow: 0,
  },
  selectionTitle: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 13,
    borderRadius: 12,
  },
  selectionRowActive: {
    backgroundColor: tokens.colors.accentSoft,
  },
  selectionText: {
    color: tokens.colors.text,
    fontSize: 15,
  },
  selectionTextActive: {
    color: tokens.colors.accentDeep,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
