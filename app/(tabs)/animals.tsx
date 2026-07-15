import { useRouter } from 'expo-router';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../../src/components/AppIcon';
import { AppTopBar } from '../../src/components/AppTopBar';
import { getSpeciesThemeByTone } from '../../src/constants/speciesTheme';
import { FloatingActionButton } from '../../src/components/FloatingActionButton';
import { useAnimals } from '../../src/context/AnimalsContext';
import type { AnimalTone } from '../../src/entities/animal';
import { tokens } from '../../src/theme/tokens';

const SPECIES_FILTER_OPTIONS = [
  { icon: 'cow-copy', label: 'Cattle' },
  { icon: 'sheep', label: 'Sheep' },
  { icon: 'pig', label: 'Pig' },
  { icon: 'goat', label: 'Goat' },
  { icon: 'chicken', label: 'Chicken' },
  { icon: 'duck', label: 'Duck' },
  { icon: 'turkey', label: 'Turkey' },
  { icon: 'goose', label: 'Goose' },
  { icon: 'donkey', label: 'Donkey' },
  { icon: 'horse', label: 'Horse' },
  { icon: 'bison', label: 'Buffalo' },
  { icon: 'rabbit', label: 'Rabbit' },
  { icon: 'alpaca', label: 'Alpaca' },
  { icon: 'llama', label: 'Llama' },
  { icon: 'camel', label: 'Camel' },
  { icon: 'ostrich', label: 'Ostrich' },
] as const;

const STATUS_FILTER_OPTIONS = ['All', 'Active', 'Sold', 'Dead'] as const;
const ALL_SPECIES_FILTER = 'All';
const SPECIES_FILTER_LABELS = [ALL_SPECIES_FILTER, ...SPECIES_FILTER_OPTIONS.map((item) => item.label)] as const;

export default function AnimalsScreen() {
  const router = useRouter();
  const { animals } = useAnimals();
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<(typeof STATUS_FILTER_OPTIONS)[number]>('All');
  const [selectedSpecies, setSelectedSpecies] = useState<(typeof SPECIES_FILTER_LABELS)[number]>('All');
  const sheetEntrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!showFilterSheet) {
      sheetEntrance.setValue(0);
      return;
    }

    Animated.timing(sheetEntrance, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [sheetEntrance, showFilterSheet]);

  const hasActiveFilters = searchQuery.trim().length > 0 || selectedStatus !== 'All' || selectedSpecies !== ALL_SPECIES_FILTER;

  const filteredAnimals = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return animals.filter((animal) => {
      const matchesSearch =
        normalizedQuery.length === 0 ||
        animal.id.toLowerCase().includes(normalizedQuery) ||
        animal.name.toLowerCase().includes(normalizedQuery);

      const matchesStatus =
        selectedStatus === 'All' ||
        (selectedStatus === 'Dead' ? animal.status === 'Deceased' : animal.status === selectedStatus);

      const matchesSpecies =
        selectedSpecies === ALL_SPECIES_FILTER || animal.species.trim().toLowerCase() === selectedSpecies.toLowerCase();

      return matchesSearch && matchesStatus && matchesSpecies;
    });
  }, [animals, searchQuery, selectedSpecies, selectedStatus]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Animals"
        actions={[
          {
            icon: 'filter',
            accessibilityLabel: 'Filter animals',
            onPress: () => setShowFilterSheet(true),
          },
          {
            icon: 'settings',
            accessibilityLabel: 'Open settings',
            onPress: () => router.push('/settings'),
          },
        ]}
      />
      <ScrollView
        contentContainerStyle={[styles.content, filteredAnimals.length === 0 && styles.emptyContent]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.countText}>{hasActiveFilters ? `${filteredAnimals.length} of ${animals.length} animals` : `${animals.length} animals`}</Text>
        {filteredAnimals.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="animal_" size={86} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>Empty</Text>
            <Text style={styles.emptyText}>{animals.length === 0 ? 'Add below' : 'No animals match your filters'}</Text>
          </View>
        ) : (
          filteredAnimals.map((animal) => {
            const theme = getSpeciesThemeByTone(animal.tone);

            return (
            <Pressable
              key={animal.id}
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/add-animal',
                  params: { animalId: animal.id },
                })
              }
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
            >
              <View
                style={[
                  styles.speciesIconBadge,
                  { backgroundColor: theme.chipBackground },
                ]}
              >
                <AppIcon
                  name={getSpeciesIconName(animal.species, animal.tone)}
                  size={26}
                  color={theme.icon}
                />
              </View>
              <View style={styles.cardCopy}>
                <View style={styles.headerRow}>
                  <Text style={styles.cardTitle}>{animal.id}</Text>
                </View>
                <View style={styles.infoRow}>
                  <View
                    style={[
                      styles.speciesChip,
                      { backgroundColor: theme.chipBackground },
                    ]}
                  >
                    <Text
                      style={[
                        styles.speciesChipText,
                        { color: theme.text },
                      ]}
                    >
                      {animal.species}
                    </Text>
                  </View>
                  <AppIcon name={animal.sex} size={14} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {buildPrimaryMeta(animal.name, animal.ageLabel)}
                  </Text>
                </View>
                <View style={styles.footerRow}>
                  <View style={styles.statusRow}>
                    <View
                      style={[
                        styles.statusDot,
                        animal.status === 'Sold'
                          ? styles.statusSold
                          : animal.status === 'Deceased'
                            ? styles.statusDeceased
                            : styles.statusActive,
                      ]}
                    />
                    <Text style={styles.statusText}>{animal.status}</Text>
                  </View>
                </View>
              </View>
              <AppIcon name="arrow-right-circle" size={24} color={tokens.colors.accent} />
            </Pressable>
          )})
        )}
      </ScrollView>
      <FloatingActionButton
        accessibilityLabel="Add animal"
        onPress={() => router.push('/add-animal')}
      />
      <Modal transparent animationType="fade" visible={showFilterSheet} onRequestClose={() => setShowFilterSheet(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowFilterSheet(false)}>
          <Animated.View
            style={[
              styles.sheet,
              {
                opacity: sheetEntrance,
                transform: [
                  {
                    translateY: sheetEntrance.interpolate({
                      inputRange: [0, 1],
                      outputRange: [72, 0],
                    }),
                  },
                ],
              },
            ]}
          >
          <Pressable onPress={() => undefined}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderSpacer} />
              <Text style={styles.sheetTitle}>Filter animals</Text>
              <Pressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                onPress={() => setShowFilterSheet(false)}
                style={styles.closeButton}
              >
                <AppIcon name="close" size={22} color="#000" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.filterContent} showsVerticalScrollIndicator={false}>
              <View style={styles.filterBlock}>
                <Text style={styles.filterLabel}>Search</Text>
                <View style={styles.searchField}>
                  <AppIcon name="search" size={18} color="#6f6f6f" />
                  <TextInput
                    accessibilityLabel="Search by ID or name"
                    placeholder="Search by ID or name"
                    placeholderTextColor="#7a7a7a"
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                </View>
              </View>

              <View style={styles.filterBlock}>
                <Text style={styles.filterLabel}>Status</Text>
                <View style={styles.optionRow}>
                  {STATUS_FILTER_OPTIONS.map((status) => {
                    const active = selectedStatus === status;

                    return (
                      <Pressable
                        key={status}
                        accessibilityRole="button"
                        onPress={() => setSelectedStatus(status)}
                        style={[styles.filterChip, active && styles.filterChipActive]}
                      >
                        <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{status}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.filterBlock}>
                <Text style={styles.filterLabel}>Species</Text>
                <View style={styles.optionRow}>
                  {SPECIES_FILTER_LABELS.map((species) => {
                    const active = selectedSpecies === species;

                    return (
                      <Pressable
                        key={species}
                        accessibilityRole="button"
                        onPress={() => setSelectedSpecies(species)}
                        style={[styles.filterChip, active && styles.filterChipActive]}
                      >
                        <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{species}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 120,
    gap: 8,
  },
  countText: {
    color: '#8A7F87',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingTop: 72,
    paddingBottom: 0,
  },
  emptyTitle: {
    marginTop: 18,
    color: '#E5E0E7',
    fontSize: 29,
    fontWeight: '700',
  },
  emptyText: {
    marginTop: 7,
    color: '#E5E0E7',
    fontSize: 18,
    fontWeight: '600',
  },
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 18,
    minHeight: 84,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardPressed: {
    opacity: 0.92,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 26,
    maxHeight: '86%',
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
    color: '#111',
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterContent: {
    gap: 18,
    paddingHorizontal: 10,
    paddingBottom: 24,
  },
  filterBlock: {
    gap: 10,
  },
  filterLabel: {
    color: '#171717',
    fontSize: 14,
    fontWeight: '500',
  },
  searchField: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#F5F3F7',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: '#2b2b2b',
    fontSize: 13,
    fontWeight: '500',
    paddingVertical: 0,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    backgroundColor: '#F5F3F7',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterChipActive: {
    backgroundColor: '#FCE5E4',
  },
  filterChipText: {
    color: '#555',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#74423F',
    fontWeight: '700',
  },
  speciesIconBadge: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitle: {
    color: '#1f1f1f',
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  footerRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  speciesChip: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  speciesChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  metaText: {
    color: '#353535',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statusActive: {
    backgroundColor: '#E4EB92',
  },
  statusSold: {
    backgroundColor: '#F1CF4B',
  },
  statusDeceased: {
    backgroundColor: '#F16A6A',
  },
  statusText: {
    color: '#333',
    fontSize: 12,
    fontWeight: '600',
  },
});

function buildPrimaryMeta(name: string, ageLabel: string) {
  return [name.trim(), abbreviateAgeLabel(ageLabel)].filter(Boolean).join(' • ');
}

function getSpeciesIconName(species: string, tone: AnimalTone) {
  const normalized = species.trim().toLowerCase();

  if (normalized.includes('cattle') || normalized.includes('cow')) return 'cow-copy';
  if (normalized.includes('sheep')) return 'sheep';
  if (normalized.includes('pig')) return 'pig';
  if (normalized.includes('goat')) return 'goat';
  if (normalized.includes('chicken')) return 'chicken';
  if (normalized.includes('duck')) return 'duck';
  if (normalized.includes('turkey')) return 'turkey';
  if (normalized.includes('goose')) return 'goose';
  if (normalized.includes('donkey')) return 'donkey';
  if (normalized.includes('horse')) return 'horse';
  if (normalized.includes('buffalo') || normalized.includes('bison')) return 'bison';
  if (normalized.includes('rabbit')) return 'rabbit';
  if (normalized.includes('alpaca')) return 'alpaca';
  if (normalized.includes('llama')) return 'llama';
  if (normalized.includes('camel')) return 'camel';
  if (normalized.includes('ostrich')) return 'ostrich';

  return getToneFallback(tone);
}

function getToneFallback(tone: AnimalTone) {
  switch (tone) {
    case 'pig':
      return 'pig';
    case 'sheep':
      return 'sheep';
    case 'goat':
      return 'goat';
    case 'poultry':
      return 'chicken';
    case 'equine':
      return 'horse';
    case 'camelid':
      return 'camel';
    case 'neutral':
      return 'animals';
    default:
      return 'cow-copy';
  }
}

function abbreviateAgeLabel(ageLabel: string) {
  const trimmed = ageLabel.trim();

  if (!trimmed) {
    return '';
  }

  return trimmed
    .replace(/years old/i, 'yrs')
    .replace(/months old/i, 'mos')
    .replace(/days old/i, 'days');
}
