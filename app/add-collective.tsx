import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { InfoModal } from '../src/components/InfoModal';
import { SPECIES_OPTIONS } from '../src/constants/records';
import { useCollectives } from '../src/context/CollectivesContext';
import { useSetup } from '../src/context/SetupContext';
import {
  COLLECTIVE_GENERIC_LABEL,
  collectiveTermForSpecies,
  getCollectiveCount,
} from '../src/entities/collective';
import { tokens } from '../src/theme/tokens';

const SPECIES_ICONS = new Map<string, AppIconName>(
  SPECIES_OPTIONS.map((item) => [item.label, item.icon]),
);

const COUNT_HELP =
  'The head count is built from dated entries rather than a single number you overwrite.\n\n' +
  'You set a starting count here, and later record what changed and when — animals bought, born, sold or lost. That way the app can always tell you how many you had on any given date, which is what an annual inventory needs.';

export default function AddCollectiveScreen() {
  const router = useRouter();
  const { collectiveUid } = useLocalSearchParams<{ collectiveUid?: string }>();
  const { collectives, addCollective, updateCollective } = useCollectives();
  const { farms } = useSetup();

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
  const [paddock, setPaddock] = useState(existing?.paddock ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? '');
  const [purpose, setPurpose] = useState(existing?.purpose ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [startingCount, setStartingCount] = useState(
    existing ? String(getCollectiveCount(existing)) : '',
  );
  const [showCountHelp, setShowCountHelp] = useState(false);
  const [saving, setSaving] = useState(false);

  // "flock" once poultry is picked, "herd" for cattle and pigs, "batch" for
  // anything without an everyday collective noun.
  const term = species ? collectiveTermForSpecies(species) : '';
  const heading = species
    ? `${species} ${term}`
    : COLLECTIVE_GENERIC_LABEL;

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
      paddock: paddock.trim(),
      startDate: startDate.trim(),
      endDate: existing?.endDate ?? '',
      purpose: purpose.trim(),
      notes: notes.trim(),
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
        actions={[
          {
            icon: 'help-circle',
            accessibilityLabel: 'How the head count works',
            onPress: () => setShowCountHelp(true),
          },
        ]}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Species</Text>
        <View style={styles.speciesGrid}>
          {SPECIES_OPTIONS.map((option) => {
            const selected = species === option.label;
            return (
              <BouncyPressable
                key={option.label}
                accessibilityLabel={option.label}
                accessibilityRole="button"
                onPress={() => setSpecies(option.label)}
                style={({ pressed }) => [
                  styles.speciesChip,
                  selected && styles.speciesChipSelected,
                  pressed && styles.pressed,
                ]}
              >
                <AppIcon
                  name={SPECIES_ICONS.get(option.label) ?? 'animals'}
                  size={18}
                  color={selected ? '#fff' : '#171717'}
                />
                <Text style={[styles.speciesChipText, selected && styles.speciesChipTextSelected]}>
                  {option.label}
                </Text>
              </BouncyPressable>
            );
          })}
        </View>

        {species ? (
          <Text style={styles.termHint}>
            {`Recorded as a ${species.toLowerCase()} ${term}.`}
          </Text>
        ) : null}

        <Field label="Name" value={name} onChangeText={setName} placeholder="Layer Flock A" />
        <Field
          label="Reference"
          value={reference}
          onChangeText={setReference}
          placeholder="Flock mark or batch number"
        />

        <Field
          label={isEditing ? 'Head count' : 'How many animals'}
          value={startingCount}
          onChangeText={setStartingCount}
          placeholder="0"
          keyboardType="number-pad"
          editable={!isEditing}
          hint={
            isEditing
              ? 'Change this from the herd or flock itself, by recording what changed and when.'
              : undefined
          }
        />

        <Field label="Breed or type" value={breed} onChangeText={setBreed} placeholder="Optional" />
        <Field
          label="Farm"
          value={farm}
          onChangeText={setFarm}
          placeholder={farms[0] ?? 'Optional'}
        />
        <Field label="Location" value={paddock} onChangeText={setPaddock} placeholder="Optional" />
        <Field
          label="Date established"
          value={startDate}
          onChangeText={setStartDate}
          placeholder="YYYY-MM-DD"
        />
        <Field
          label="Purpose"
          value={purpose}
          onChangeText={setPurpose}
          placeholder="Laying, fattening, breeding…"
        />
        <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />

        <BouncyPressable
          accessibilityLabel={isEditing ? 'Save changes' : 'Add herd or flock'}
          accessibilityRole="button"
          onPress={() => void handleSave()}
          style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
        >
          <Text style={styles.saveButtonText}>{isEditing ? 'Save changes' : 'Add'}</Text>
        </BouncyPressable>
      </ScrollView>

      <InfoModal
        visible={showCountHelp}
        onClose={() => setShowCountHelp(false)}
        title="How the head count works"
        description={COUNT_HELP}
      />
    </SafeAreaView>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad';
  multiline?: boolean;
  editable?: boolean;
  hint?: string;
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  editable = true,
  hint,
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        editable={editable}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#B4A9B1"
        style={[styles.input, multiline && styles.inputMultiline, !editable && styles.inputDisabled]}
        value={value}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: tokens.colors.background },
  content: { paddingHorizontal: 26, paddingTop: 16, paddingBottom: 48, gap: 14 },
  sectionLabel: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  speciesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  speciesChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: tokens.colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.border,
  },
  speciesChipSelected: {
    backgroundColor: tokens.colors.accent,
    borderColor: tokens.colors.accent,
  },
  speciesChipText: { color: '#171717', fontSize: 13, fontWeight: '600' },
  speciesChipTextSelected: { color: '#fff' },
  termHint: { color: tokens.colors.textSoft, fontSize: 12, fontStyle: 'italic' },
  field: { gap: 6 },
  fieldLabel: { color: tokens.colors.text, fontSize: 13, fontWeight: '700' },
  fieldHint: { color: tokens.colors.textSoft, fontSize: 11, lineHeight: 15 },
  input: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: tokens.colors.text,
    fontSize: 15,
  },
  inputMultiline: { minHeight: 84, textAlignVertical: 'top' },
  inputDisabled: { opacity: 0.6 },
  saveButton: {
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.85 },
});
