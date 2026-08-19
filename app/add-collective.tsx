import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { AppIcon, type AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { FloatingActionButton } from '../src/components/FloatingActionButton';
import { InfoModal } from '../src/components/InfoModal';
import { SPECIES_OPTIONS } from '../src/constants/records';
import { getSpeciesThemeByLabel } from '../src/constants/speciesTheme';
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
  const [birthDate, setBirthDate] = useState(existing?.birthDate ?? '');
  const [supplier, setSupplier] = useState(existing?.supplier ?? '');
  const [cost, setCost] = useState(existing?.cost ?? '');
  const [averageWeight, setAverageWeight] = useState(existing?.averageWeight ?? '');
  const [showSpeciesPicker, setShowSpeciesPicker] = useState(false);
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
      birthDate: birthDate.trim(),
      supplier: supplier.trim(),
      cost: cost.trim(),
      averageWeight: averageWeight.trim(),
      weightUnit: existing?.weightUnit ?? 'kg',
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
        <View style={styles.block}>
          <Text style={styles.sectionLabel}>Species *</Text>
          <Pressable
            accessibilityLabel="Choose species"
            accessibilityRole="button"
            onPress={() => setShowSpeciesPicker(true)}
            style={({ pressed }) => [styles.pickerField, pressed && styles.pressed]}
          >
            <View style={styles.fieldWithIcon}>
              {species ? (
                <AppIcon
                  name={SPECIES_ICONS.get(species) ?? 'animals'}
                  size={20}
                  color={tokens.colors.text}
                />
              ) : null}
              <Text style={[styles.pickerValue, !species && styles.pickerPlaceholder]}>
                {species || 'Select species'}
              </Text>
            </View>
            <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
          </Pressable>
        </View>

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
          label="Average weight"
          value={averageWeight}
          onChangeText={setAverageWeight}
          placeholder="Typical weight per animal"
          keyboardType="number-pad"
        />
        <Field
          label="Cost per animal"
          value={cost}
          onChangeText={setCost}
          placeholder="What each one cost"
          keyboardType="number-pad"
        />
        <Field
          label="Supplier"
          value={supplier}
          onChangeText={setSupplier}
          placeholder="Hatchery, market, or keeper"
        />
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
          hint="When this group arrived or was formed on your farm."
        />
        <Field
          label="Born or hatched"
          value={birthDate}
          onChangeText={setBirthDate}
          placeholder="YYYY-MM-DD"
          hint="Only if it differs from the date above."
        />
        <Field
          label="Purpose"
          value={purpose}
          onChangeText={setPurpose}
          placeholder="Laying, fattening, breeding…"
        />
        <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />

      </ScrollView>

      <FloatingActionButton
        accessibilityLabel={isEditing ? 'Save changes' : 'Add herd or flock'}
        icon="check"
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
              <Text style={styles.speciesModalTitle}>Species</Text>
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
  content: { paddingHorizontal: 26, paddingTop: 16, paddingBottom: 120, gap: 14 },
  sectionLabel: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
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
  pressed: { opacity: 0.85 },
  block: { gap: 6 },
  pickerField: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.border,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldWithIcon: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pickerValue: { color: tokens.colors.text, fontSize: 15, fontWeight: '500' },
  pickerPlaceholder: { color: '#B4A9B1', fontWeight: '400' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxHeight: '76%',
    borderRadius: 24,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },
  speciesModalHeader: { alignItems: 'center', justifyContent: 'center' },
  speciesModalTitle: { color: tokens.colors.text, fontSize: 17, fontWeight: '700' },
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
    gap: 10,
    paddingLeft: 20,
    paddingRight: 14,
  },
  speciesModalCardLabel: { fontSize: 15, fontWeight: '500' },
});
