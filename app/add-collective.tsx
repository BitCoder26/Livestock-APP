import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { AppIcon, type AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { DesignField } from '../src/components/DesignField';
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
  const insets = useSafeAreaInsets();
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

    if (!reference.trim()) {
      Alert.alert(
        'Reference needed',
        'Give this group a flock mark, batch number or other reference so you can identify it.',
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
                  <AppIcon
                    name={SPECIES_ICONS.get(species) ?? 'animals'}
                    size={20}
                    color={tokens.colors.text}
                  />
                ) : null}
                <Text style={[styles.dateValue, !species && styles.placeholderValue]}>
                  {species || 'Select species'}
                </Text>
              </View>
              <AppIcon name="chevron-down" size={18} color={tokens.colors.text} />
            </Pressable>
          </View>

          <DesignField
            value={name}
            label="Name"
            placeholder="Layer Flock A"
            onChangeText={setName}
          />

          <DesignField
            value={reference}
            label="Reference *"
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

          <DesignField
            value={breed}
            label="Breed or type"
            placeholder="Lohmann Brown"
            onChangeText={setBreed}
          />

          <DesignField
            value={averageWeight}
            label="Average weight"
            placeholder="Typical weight per animal"
            keyboardType="number-pad"
            onChangeText={setAverageWeight}
          />

          <DesignField
            value={cost}
            label="Cost per animal"
            placeholder="Price paid for each one"
            keyboardType="number-pad"
            onChangeText={setCost}
          />

          <DesignField
            value={supplier}
            label="Supplier"
            placeholder="Hatchery, market, or keeper"
            onChangeText={setSupplier}
          />

          <DesignField
            value={farm}
            label="Farm"
            placeholder={farms[0] ?? 'Which farm they are on'}
            onChangeText={setFarm}
          />

          <DesignField
            value={paddock}
            label="Location"
            placeholder="Shed, field or paddock"
            onChangeText={setPaddock}
          />

          <DesignField
            value={startDate}
            label="Date established"
            placeholder="YYYY-MM-DD"
            onChangeText={setStartDate}
          />
          <Text style={styles.helperText}>When this group arrived or was formed on your farm.</Text>

          <DesignField
            value={birthDate}
            label="Born or hatched"
            placeholder="YYYY-MM-DD"
            onChangeText={setBirthDate}
          />
          <Text style={styles.helperText}>Only if it differs from the date above.</Text>

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
        </View>

      </ScrollView>

      <FloatingActionButton
        accessibilityLabel={isEditing ? 'Save changes' : 'Add herd or flock'}
        icon="check"
        bottomOffset={insets.bottom + 78}
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
              <Text style={styles.speciesModalTitle}>Select Species</Text>
              <Pressable
                accessibilityLabel="Close species selector"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setShowSpeciesPicker(false)}
                style={styles.speciesModalClose}
              >
                <AppIcon name="close" size={16} color={tokens.colors.text} />
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: tokens.colors.background },
  content: { paddingHorizontal: 26, paddingTop: 16, paddingBottom: 120, gap: 14 },
  pressed: { opacity: 0.85 },
  // Mirrors add-animal: fields are white pills inside a grey form card, rather
  // than grey inputs sitting directly on the page.
  formCard: {
    borderRadius: 24,
    backgroundColor: '#F5F3F7',
    padding: 16,
    gap: 14,
  },
  block: { gap: 8 },
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
  fieldWithIcon: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
