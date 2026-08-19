import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { PropsWithChildren } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../../src/components/AppIcon';
import { AppTopBar } from '../../src/components/AppTopBar';
import { AnimatedPopupCard } from '../../src/components/AnimatedPopupCard';
import { BouncyPressable } from '../../src/components/BouncyPressable';
import { TabSwipeView } from '../../src/components/TabSwipeView';
import { useCollectives } from '../../src/context/CollectivesContext';
import { collectiveTermForSpecies, getCollectiveCount } from '../../src/entities/collective';
import { getSpeciesThemeByLabel, getSpeciesThemeByTone, getToneForSpecies } from '../../src/constants/speciesTheme';
import { FloatingActionButton } from '../../src/components/FloatingActionButton';
import { useAnimals } from '../../src/context/AnimalsContext';
import { useOnboarding, useSpotlightTarget } from '../../src/context/OnboardingContext';
import { useSetup } from '../../src/context/SetupContext';
import type { Animal, AnimalTone } from '../../src/entities/animal';
import { tokens } from '../../src/theme/tokens';
import { MODAL_SHEET_ENTRANCE_DURATION, motionDuration } from '../../src/utils/motion';

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
type StatusFilter = Exclude<(typeof STATUS_FILTER_OPTIONS)[number], 'All'>;
type SpeciesFilter = (typeof SPECIES_FILTER_OPTIONS)[number]['label'];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Recently Added (default)' },
  { value: 'oldest', label: 'Oldest Added' },
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'tag-asc', label: 'Tag / ID (A–Z)' },
  { value: 'status', label: 'Status' },
] as const;
type SortOption = (typeof SORT_OPTIONS)[number]['value'];
const DEFAULT_SORT: SortOption = 'newest';
const STATUS_SORT_PRIORITY: Record<Animal['status'], number> = { Active: 0, Sold: 1, Deceased: 2 };

// AnimalsContext backfills a real createdAt for every stored animal (see
// synthesizeCreatedAt in AnimalsContext.tsx), so this should always be
// populated. The 0 (epoch) fallback only guards truly malformed data.
function getCreatedAtTime(animal: Animal): number {
  return animal.createdAt ? Date.parse(animal.createdAt) || 0 : 0;
}

function sortAnimals(list: Animal[], sort: SortOption): Animal[] {
  switch (sort) {
    case 'name-asc':
      return [...list].sort((a, b) => (a.name.trim() || a.id).localeCompare(b.name.trim() || b.id));
    case 'tag-asc':
      return [...list].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));
    case 'status':
      return [...list].sort((a, b) => STATUS_SORT_PRIORITY[a.status] - STATUS_SORT_PRIORITY[b.status]);
    case 'oldest':
      return [...list].sort((a, b) => getCreatedAtTime(a) - getCreatedAtTime(b));
    case 'newest':
    default:
      return [...list].sort((a, b) => getCreatedAtTime(b) - getCreatedAtTime(a));
  }
}

// Holds the new card back until the circular reveal has all but finished, so
// it lands on a settled screen rather than sliding in behind the mask. It was
// 700ms, which was tuned against a 650ms reveal; the reveal is now 380ms and
// the old value left the card visibly late.
const NEW_ANIMAL_CARD_ENTRANCE_DELAY = 340;
const ANIMAL_CARD_ENTRANCE_DURATION = motionDuration(260);
// Removal is a response to a tap, so it runs shorter than the entrance and
// without any delay at all — see the exit effect.
const ANIMAL_CARD_EXIT_DURATION = motionDuration(200);
let lastAnimatedAnimalUid: string | null = null;

export default function AnimalsScreen() {
  const router = useRouter();
  const { newAnimalUid, deletingAnimalUid } = useLocalSearchParams<{
    newAnimalUid?: string;
    deletingAnimalUid?: string;
  }>();
  const { animals, deleteAnimal } = useAnimals();
  const { groups } = useSetup();
  const { step } = useOnboarding();
  const isFocused = useIsFocused();
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [appliedStatus, setAppliedStatus] = useState<StatusFilter[]>([]);
  const [appliedSpecies, setAppliedSpecies] = useState<SpeciesFilter[]>([]);
  const [appliedGroups, setAppliedGroups] = useState<string[]>([]);
  const [appliedSort, setAppliedSort] = useState<SortOption>(DEFAULT_SORT);
  const [draftSearchQuery, setDraftSearchQuery] = useState('');
  const [draftStatus, setDraftStatus] = useState<StatusFilter[]>([]);
  const [draftSpecies, setDraftSpecies] = useState<SpeciesFilter[]>([]);
  const [draftGroups, setDraftGroups] = useState<string[]>([]);
  const [showGroupSelector, setShowGroupSelector] = useState(false);
  const sheetEntrance = useRef(new Animated.Value(0)).current;
  const sortSheetEntrance = useRef(new Animated.Value(0)).current;
  const availableGroups = useMemo(
    () =>
      Array.from(
        new Map(
          [...groups, ...animals.map((animal) => animal.group)]
            .map((group) => group.trim())
            .filter(Boolean)
            .map((group) => [group.toLowerCase(), group]),
        ).values(),
      ),
    [animals, groups],
  );

  const { collectives } = useCollectives();
  // Individual animals and collectives are different entities with different
  // forms, so the tab is a view switch rather than a filter over one list.
  const [animalView, setAnimalView] = useState<'individual' | 'collectives'>('individual');
  const fabRef = useRef<View>(null);
  useSpotlightTarget('animal', step === 'animal' && isFocused, fabRef);

  useEffect(() => {
    if (!showFilterSheet) {
      sheetEntrance.setValue(0);
      return;
    }

    Animated.timing(sheetEntrance, {
      toValue: 1,
      duration: MODAL_SHEET_ENTRANCE_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [sheetEntrance, showFilterSheet]);

  useEffect(() => {
    if (!showSortSheet) {
      sortSheetEntrance.setValue(0);
      return;
    }

    Animated.timing(sortSheetEntrance, {
      toValue: 1,
      duration: MODAL_SHEET_ENTRANCE_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [sortSheetEntrance, showSortSheet]);

  const hasActiveFilters =
    appliedSearchQuery.trim().length > 0 ||
    appliedStatus.length > 0 ||
    appliedSpecies.length > 0 ||
    appliedGroups.length > 0;

  const filteredAnimals = useMemo(() => {
    const normalizedQuery = appliedSearchQuery.trim().toLowerCase();

    return animals.filter((animal) => {
      const matchesSearch =
        normalizedQuery.length === 0 ||
        animal.id.toLowerCase().includes(normalizedQuery) ||
        animal.name.toLowerCase().includes(normalizedQuery);

      const matchesStatus =
        appliedStatus.length === 0 ||
        appliedStatus.some((status) =>
          status === 'Dead' ? animal.status === 'Deceased' : animal.status === status,
        );

      const matchesSpecies =
        appliedSpecies.length === 0 ||
        appliedSpecies.some((species) => animal.species.trim().toLowerCase() === species.toLowerCase());

      const matchesGroup =
        appliedGroups.length === 0 ||
        appliedGroups.some((group) => animal.group.trim().toLowerCase() === group.toLowerCase());

      return matchesSearch && matchesStatus && matchesSpecies && matchesGroup;
    });
  }, [animals, appliedGroups, appliedSearchQuery, appliedSpecies, appliedStatus]);

  const sortedAnimals = useMemo(
    () => sortAnimals(filteredAnimals, appliedSort),
    [filteredAnimals, appliedSort],
  );

  const openFilters = () => {
    setDraftSearchQuery(appliedSearchQuery);
    setDraftStatus([...appliedStatus]);
    setDraftSpecies([...appliedSpecies]);
    setDraftGroups([...appliedGroups]);
    setShowGroupSelector(false);
    setShowFilterSheet(true);
  };

  const applyFilters = () => {
    setAppliedSearchQuery(draftSearchQuery.trim());
    setAppliedStatus([...draftStatus]);
    setAppliedSpecies([...draftSpecies]);
    setAppliedGroups([...draftGroups]);
    setShowGroupSelector(false);
    setShowFilterSheet(false);
  };

  const finishAnimalDeletion = async (animalUid: string) => {
    const result = await deleteAnimal(animalUid);

    if (!result.ok) {
      Alert.alert('Animal could not be deleted', 'The animal was left unchanged. Please try again.');
      return false;
    }

    return true;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <TabSwipeView>
        <AppTopBar
        title="Animals"
        actions={[
          {
            icon: 'sort',
            accessibilityLabel: appliedSort !== DEFAULT_SORT ? 'Sort animals (custom sort applied)' : 'Sort animals',
            onPress: () => setShowSortSheet(true),
            badge: appliedSort !== DEFAULT_SORT,
          },
          {
            icon: 'filter',
            accessibilityLabel: hasActiveFilters ? 'Filter animals (filters applied)' : 'Filter animals',
            onPress: openFilters,
            badge: hasActiveFilters,
          },
          {
            icon: 'profile',
            accessibilityLabel: 'Open account',
            onPress: () => router.push('/account'),
          },
        ]}
      />
      <ScrollView
        contentContainerStyle={[styles.content, filteredAnimals.length === 0 && styles.emptyContent]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.segmentRow}>
          {(['individual', 'collectives'] as const).map((option) => {
            const selected = animalView === option;
            return (
              <Pressable
                key={option}
                accessibilityLabel={option === 'individual' ? 'Individual animals' : 'Herds and flocks'}
                accessibilityRole="button"
                onPress={() => setAnimalView(option)}
                style={({ pressed }) => [
                  styles.segmentButton,
                  selected ? styles.segmentButtonActive : styles.segmentButtonIdle,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.segmentText, selected ? styles.segmentTextActive : styles.segmentTextIdle]}>
                  {option === 'individual' ? 'Individual' : 'Herds & flocks'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.countText}>{animalView === 'collectives' ? `${collectives.length} herds & flocks` : hasActiveFilters ? `${filteredAnimals.length} of ${animals.length} animals` : `${animals.length} animals`}</Text>
        {animalView === 'collectives' ? (
          collectives.length === 0 ? (
            <View style={styles.emptyState}>
              <AppIcon name="animals3" size={78} color="#E5E0E7" opacity={1} />
              <Text style={styles.emptyTitle}>Empty</Text>
              <Text style={styles.emptyText}>Add a herd or flock below</Text>
            </View>
          ) : (
            <>
              {collectives.map((collective) => {
                const term = collectiveTermForSpecies(collective.species);
                const count = getCollectiveCount(collective);
                // Collectives carry a species label but no tone, so the theme
                // is resolved by label rather than by tone as animals are.
                const theme = getSpeciesThemeByLabel(collective.species);
                const tone = getToneForSpecies(collective.species);
                // Mirrors the individual card exactly: the identifier is the
                // title and the name sits in the meta row beside the quantity,
                // where an animal's name sits beside its age. Falls back to the
                // name, then the species term, because a reference is not
                // required for every species.
                const reference = collective.id.trim();
                const label = collective.name.trim();
                const title = reference || label || `${collective.species} ${term}`;
                const meta = [
                  reference ? label : '',
                  `${count} ${count === 1 ? 'animal' : 'animals'}`,
                ]
                  .filter(Boolean)
                  .join(' • ');

                return (
                  <BouncyPressable
                    key={collective.uid}
                    accessibilityLabel={title}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: '/add-collective',
                        params: { collectiveUid: collective.uid },
                      })
                    }
                    style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                  >
                    <View
                      style={[styles.speciesIconBadge, { backgroundColor: theme.chipBackground }]}
                    >
                      <AppIcon
                        name={getSpeciesIconName(collective.species, tone)}
                        size={26}
                        color={theme.icon}
                      />
                    </View>
                    <View style={styles.cardCopy}>
                      <View style={styles.headerRow}>
                        <Text style={styles.cardTitle}>{title}</Text>
                      </View>
                      <View style={styles.infoRow}>
                        <View
                          style={[styles.speciesChip, { backgroundColor: theme.chipBackground }]}
                        >
                          <AppIcon
                            name={getSpeciesIconName(collective.species, tone)}
                            size={11}
                            color={theme.icon}
                          />
                          <Text style={[styles.speciesChipText, { color: theme.text }]}>
                            {collective.species}
                          </Text>
                        </View>
                        <Text style={styles.metaText} numberOfLines={1}>
                          {meta}
                        </Text>
                      </View>
                      <View style={styles.footerRow}>
                        <View style={styles.statusRow}>
                          <View
                            style={[
                              styles.statusDot,
                              collective.status === 'Closed'
                                ? styles.statusSold
                                : styles.statusActive,
                            ]}
                          />
                          <Text style={styles.statusText}>{collective.status}</Text>
                        </View>
                      </View>
                    </View>
                    <AppIcon name="chevron-right-minimal" size={18} color="#171717" />
                  </BouncyPressable>
                );
              })}
            </>
          )
        ) : filteredAnimals.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="goat-face" size={78} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>Empty</Text>
            <Text style={styles.emptyText}>{animals.length === 0 ? 'Add below' : 'No animals match your filters'}</Text>
          </View>
        ) : (
          sortedAnimals.map((animal) => {
            const theme = getSpeciesThemeByTone(animal.tone);

            return (
              <AnimalCardMotion
                key={animal.uid}
                animalUid={animal.uid}
                animate={animal.uid === newAnimalUid}
                exit={animal.uid === deletingAnimalUid}
                onExitComplete={finishAnimalDeletion}
              >
                <BouncyPressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: '/animal-timeline',
                      params: { animalUid: animal.uid },
                    })
                  }
                  style={({ pressed }) => [
                    styles.card,
                    pressed && styles.cardPressed,
                  ]}
                >
                <AnimalCardAvatar animal={animal} />
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
                      <AppIcon
                        name={getSpeciesIconName(animal.species, animal.tone)}
                        size={11}
                        color={theme.icon}
                      />
                      <Text
                        style={[
                          styles.speciesChipText,
                          { color: theme.text },
                        ]}
                      >
                        {animal.species}
                      </Text>
                    </View>
                    <AppIcon
                      key={`${animal.id}-${animal.sex}`}
                      name={getAnimalSexIcon(animal.sex)}
                      size={14}
                      color={tokens.colors.text}
                    />
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
                <AppIcon name="chevron-right-minimal" size={18} color="#171717" />
                </BouncyPressable>
              </AnimalCardMotion>
            );
          })
        )}
      </ScrollView>
      <FloatingActionButton
        accessibilityLabel="Add animal"
        onPress={() => router.push('/add-choose')}
        positionerRef={fabRef}
      />
      <Modal transparent animationType="none" visible={showFilterSheet} onRequestClose={() => setShowFilterSheet(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowFilterSheet(false)}>
          <Animated.View
            pointerEvents="none"
            style={[styles.modalBackdrop, { opacity: sheetEntrance }]}
          />
          <Animated.View
            style={[
              styles.sheet,
              {
                opacity: sheetEntrance.interpolate({
                  inputRange: [0, 0.28, 1],
                  outputRange: [0, 1, 1],
                }),
                transform: [
                  {
                    translateY: sheetEntrance.interpolate({
                      inputRange: [0, 1],
                      outputRange: [140, 0],
                    }),
                  },
                  {
                    scale: sheetEntrance.interpolate({
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
                    value={draftSearchQuery}
                    onChangeText={setDraftSearchQuery}
                  />
                </View>
              </View>

              <View style={styles.filterBlock}>
                <Text style={styles.filterLabel}>Status</Text>
                <View style={styles.optionRow}>
                  {STATUS_FILTER_OPTIONS.map((status) => {
                    const active = status === 'All' ? draftStatus.length === 0 : draftStatus.includes(status);

                    return (
                      <Pressable
                        key={status}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: active }}
                        onPress={() => {
                          if (status === 'All') {
                            setDraftStatus([]);
                            return;
                          }

                          setDraftStatus((current) =>
                            current.includes(status)
                              ? current.filter((item) => item !== status)
                              : [...current, status],
                          );
                        }}
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
                    const active =
                      species === ALL_SPECIES_FILTER
                        ? draftSpecies.length === 0
                        : draftSpecies.includes(species);

                    return (
                      <Pressable
                        key={species}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: active }}
                        onPress={() => {
                          if (species === ALL_SPECIES_FILTER) {
                            setDraftSpecies([]);
                            return;
                          }

                          setDraftSpecies((current) =>
                            current.includes(species)
                              ? current.filter((item) => item !== species)
                              : [...current, species],
                          );
                        }}
                        style={[styles.filterChip, active && styles.filterChipActive]}
                      >
                        <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{species}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              {availableGroups.length > 0 ? (
                <View style={styles.filterBlock}>
                  <Text style={styles.filterLabel}>By Group</Text>
                  <Pressable
                    accessibilityLabel="Select groups"
                    accessibilityRole="button"
                    onPress={(event) => {
                      event.stopPropagation();
                      setShowGroupSelector(true);
                    }}
                    style={({ pressed }) => [styles.pickerField, pressed && styles.pressed]}
                  >
                    <Text style={[styles.fieldValue, draftGroups.length === 0 && styles.placeholderValue]}>
                      {formatGroupSelection(draftGroups)}
                    </Text>
                    <AppIcon name="chevron-down" size={18} color="#7a7a7a" />
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.filterActionsRow}>
                <BouncyPressable
                  accessibilityLabel="Clear filter"
                  accessibilityRole="button"
                  containerStyle={{ flex: 1 }}
                  onPress={() => {
                    setDraftSearchQuery('');
                    setDraftStatus([]);
                    setDraftSpecies([]);
                    setDraftGroups([]);
                    setShowGroupSelector(false);
                  }}
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
          {showGroupSelector ? (
            <Pressable
              style={styles.selectionBackdrop}
              onPress={(event) => {
                event.stopPropagation();
                setShowGroupSelector(false);
              }}
            >
              <AnimatedPopupCard visible={showGroupSelector} style={styles.selectionCard} onPress={() => undefined}>
                <View style={styles.selectionHeader}>
                  <Text style={styles.selectionTitle}>Select groups</Text>
                  <Pressable
                    accessibilityLabel="Done"
                    accessibilityRole="button"
                    onPress={() => setShowGroupSelector(false)}
                  >
                    <Text style={styles.modalDone}>Done</Text>
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {availableGroups.map((group) => {
                    const isSelected = draftGroups.some((entry) => entry.toLowerCase() === group.toLowerCase());

                    return (
                      <Pressable
                        key={group}
                        accessibilityLabel={group}
                        accessibilityRole="button"
                        onPress={() =>
                          setDraftGroups((current) =>
                            current.some((entry) => entry.toLowerCase() === group.toLowerCase())
                              ? current.filter((entry) => entry.toLowerCase() !== group.toLowerCase())
                              : [...current, group],
                          )
                        }
                        style={({ pressed }) => [
                          styles.selectionRow,
                          isSelected && styles.selectionRowActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[styles.selectionText, isSelected && styles.selectionTextActive]}>{group}</Text>
                        {isSelected ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </AnimatedPopupCard>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>

      <Modal transparent animationType="none" visible={showSortSheet} onRequestClose={() => setShowSortSheet(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowSortSheet(false)}>
          <Animated.View
            pointerEvents="none"
            style={[styles.modalBackdrop, { opacity: sortSheetEntrance }]}
          />
          <Animated.View
            style={[
              styles.sheet,
              {
                opacity: sortSheetEntrance.interpolate({
                  inputRange: [0, 0.28, 1],
                  outputRange: [0, 1, 1],
                }),
                transform: [
                  {
                    translateY: sortSheetEntrance.interpolate({
                      inputRange: [0, 1],
                      outputRange: [140, 0],
                    }),
                  },
                  {
                    scale: sortSheetEntrance.interpolate({
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
              <Text style={styles.sheetTitle}>Sort animals</Text>
              <Pressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                onPress={() => setShowSortSheet(false)}
                style={styles.closeButton}
              >
                <AppIcon name="close" size={22} color="#000" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.sortSheetContent} showsVerticalScrollIndicator={false}>
              {SORT_OPTIONS.map((option) => {
                const isSelected = appliedSort === option.value;

                return (
                  <Pressable
                    key={option.value}
                    accessibilityLabel={option.label}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    onPress={() => {
                      setAppliedSort(option.value);
                      setShowSortSheet(false);
                    }}
                    style={({ pressed }) => [
                      styles.selectionRow,
                      isSelected && styles.selectionRowActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.selectionText, isSelected && styles.selectionTextActive]}>{option.label}</Text>
                    {isSelected ? <AppIcon name="check" size={16} color={tokens.colors.accent} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
      </TabSwipeView>
    </SafeAreaView>
  );
}

function AnimalCardMotion({
  animate,
  animalUid,
  children,
  exit,
  onExitComplete,
}: PropsWithChildren<{
  animate: boolean;
  animalUid: string;
  exit: boolean;
  onExitComplete: (animalUid: string) => Promise<boolean>;
}>) {
  const shouldAnimate = useRef(animate && lastAnimatedAnimalUid !== animalUid).current;
  const entrance = useRef(new Animated.Value(shouldAnimate ? 0 : 1)).current;
  const onExitCompleteRef = useRef(onExitComplete);
  onExitCompleteRef.current = onExitComplete;

  useEffect(() => {
    if (!shouldAnimate) {
      return;
    }

    lastAnimatedAnimalUid = animalUid;
    const animation = Animated.sequence([
      Animated.delay(NEW_ANIMAL_CARD_ENTRANCE_DELAY),
      Animated.timing(entrance, {
        toValue: 1,
        duration: ANIMAL_CARD_ENTRANCE_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start();
    return () => animation.stop();
  }, [animalUid, entrance, shouldAnimate]);

  useEffect(() => {
    if (!exit) {
      return;
    }

    // No delay here. A delete is a direct response to the user's tap, and the
    // 340ms that stops a new card racing the reveal is just dead air when the
    // card is on its way out.
    const animation = Animated.timing(entrance, {
      toValue: 0,
      duration: ANIMAL_CARD_EXIT_DURATION,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });

    animation.start(({ finished }) => {
      if (!finished) {
        return;
      }

      void onExitCompleteRef.current(animalUid).then((didDelete) => {
        if (didDelete) {
          return;
        }

        Animated.timing(entrance, {
          toValue: 1,
          duration: ANIMAL_CARD_ENTRANCE_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    });

    return () => animation.stop();
  }, [animalUid, entrance, exit]);

  return (
    <Animated.View
      style={{
        opacity: entrance,
        transform: [
          {
            translateY: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [12, 0],
            }),
          },
          {
            scale: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [0.965, 1],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
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
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: tokens.colors.surfaceMuted,
    borderRadius: 20,
    padding: 3,
    marginBottom: 12,
    gap: 3,
  },
  // Matches the Export tab's segmented control: two standalone pills rather
  // than options inside a track.
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
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
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 18,
    paddingHorizontal: 20,
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
  filterContent: {
    gap: 18,
    paddingBottom: 24,
  },
  sortSheetContent: {
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
  pickerField: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#F5F3F7',
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
  selectionBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    justifyContent: 'flex-end',
    zIndex: 10,
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
  modalDone: {
    color: tokens.colors.accent,
    fontSize: 16,
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
    backgroundColor: '#FCE5E4',
  },
  selectionText: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  selectionTextActive: {
    color: '#74423F',
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
  },
  pressed: {
    opacity: 0.9,
  },
  filterActionsRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 12,
  },
  clearFilterButton: {
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: '#F5F3F7',
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
  speciesIconBadge: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  animalProfileImage: {
    width: '100%',
    height: '100%',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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

function AnimalCardAvatar({ animal }: { animal: Animal }) {
  const imageUri = animal.showImageOnCard ? animal.imageUris?.[0]?.trim() || null : null;
  const [imageFailed, setImageFailed] = useState(false);
  const theme = getSpeciesThemeByTone(animal.tone);

  useEffect(() => {
    setImageFailed(false);
  }, [animal.uid, imageUri]);

  return (
    <View style={[styles.speciesIconBadge, { backgroundColor: theme.chipBackground }]}>
      {imageUri && !imageFailed ? (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={{ uri: imageUri }}
          style={styles.animalProfileImage}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <AppIcon
          name={getSpeciesIconName(animal.species, animal.tone)}
          size={26}
          color={theme.icon}
        />
      )}
    </View>
  );
}

function buildPrimaryMeta(name: string, ageLabel: string) {
  return [name.trim(), abbreviateAgeLabel(ageLabel)].filter(Boolean).join(' • ');
}

function formatGroupSelection(groups: string[]) {
  if (groups.length === 0) {
    return 'Select groups';
  }

  if (groups.length === 1) {
    return groups[0];
  }

  return `${groups.length} groups selected`;
}

function getSpeciesIconName(species: string, tone: AnimalTone) {
  const normalized = species.trim().toLowerCase();

  if (normalized.includes('cattle') || normalized.includes('cow')) return 'cow-copy';
  if (normalized.includes('sheep')) return 'sheep-black';
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

function getAnimalSexIcon(sex: unknown): 'female' | 'male' {
  return sex === 'male' ? 'male' : 'female';
}

function getToneFallback(tone: AnimalTone) {
  switch (tone) {
    case 'pig':
      return 'pig';
    case 'sheep':
      return 'sheep-black';
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
