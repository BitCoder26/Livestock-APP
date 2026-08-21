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
import {
  collectiveTermForSpecies,
  describeCollectiveCount,
  getCollectiveCount,
  type Collective,
} from '../../src/entities/collective';
import { abbreviateAgeLabel, getAnimalSexIcon } from '../../src/utils/animalDisplay';
import { getSpeciesThemeByLabel, getSpeciesThemeByTone, getToneForSpecies } from '../../src/constants/speciesTheme';
import { FabSpeedDial } from '../../src/components/FabSpeedDial';
import { ImportPromptBubble } from '../../src/components/ImportPromptBubble';
import { useAnimals } from '../../src/context/AnimalsContext';
import { useOnboarding, useSpotlightTarget } from '../../src/context/OnboardingContext';
import { useSetup } from '../../src/context/SetupContext';
import type { Animal, AnimalTone } from '../../src/entities/animal';
import { tokens } from '../../src/theme/tokens';
import { MODAL_SHEET_ENTRANCE_DURATION, motionDuration } from '../../src/utils/motion';
import { useThumbnailUri } from '../../src/utils/useThumbnailUri';

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

/** Sheet labels carry a "(default)" aside; the count line wants the order alone. */
function getSortLabel(sort: SortOption) {
  const label = SORT_OPTIONS.find((option) => option.value === sort)?.label ?? SORT_OPTIONS[0].label;
  return label.replace(' (default)', '');
}
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

// Collectives carry no createdAt, but they are stored newest-first (see
// addCollective), so "recently added" is the stored order and "oldest" is its
// reverse. The remaining options map straight across from the animal sort.
const COLLECTIVE_STATUS_SORT_PRIORITY: Record<Collective['status'], number> = { Active: 0, Inactive: 1 };

function sortCollectives(list: Collective[], sort: SortOption): Collective[] {
  switch (sort) {
    case 'name-asc':
      return [...list].sort((a, b) =>
        (a.name.trim() || a.id).localeCompare(b.name.trim() || b.id),
      );
    case 'tag-asc':
      return [...list].sort((a, b) =>
        a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }),
      );
    case 'status':
      return [...list].sort(
        (a, b) => COLLECTIVE_STATUS_SORT_PRIORITY[a.status] - COLLECTIVE_STATUS_SORT_PRIORITY[b.status],
      );
    case 'oldest':
      return [...list].reverse();
    case 'newest':
    default:
      return list;
  }
}

// Holds the new card back until the save-time circular reveal has all but
// finished, so it lands on a settled screen rather than sliding in behind the
// mask. This is the *return* reveal in (tabs)/_layout.tsx — the forward one on
// the add buttons was removed — so it tracks REVEAL_DURATION, 650 on iOS.
const NEW_ANIMAL_CARD_ENTRANCE_DELAY = 580;
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
  const { labels } = useSetup();
  const { step } = useOnboarding();
  const isFocused = useIsFocused();
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [appliedStatus, setAppliedStatus] = useState<StatusFilter[]>([]);
  const [appliedSpecies, setAppliedSpecies] = useState<SpeciesFilter[]>([]);
  const [appliedLabels, setAppliedLabels] = useState<string[]>([]);
  const [appliedSort, setAppliedSort] = useState<SortOption>(DEFAULT_SORT);
  const [draftSearchQuery, setDraftSearchQuery] = useState('');
  const [draftStatus, setDraftStatus] = useState<StatusFilter[]>([]);
  const [draftSpecies, setDraftSpecies] = useState<SpeciesFilter[]>([]);
  const [draftLabels, setDraftLabels] = useState<string[]>([]);
  const [showLabelSelector, setShowLabelSelector] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const sheetEntrance = useRef(new Animated.Value(0)).current;
  const sortSheetEntrance = useRef(new Animated.Value(0)).current;
  const availableLabels = useMemo(
    () =>
      Array.from(
        new Map(
          [...labels, ...animals.flatMap((animal) => animal.labels)]
            .map((label) => label.trim())
            .filter(Boolean)
            .map((label) => [label.toLowerCase(), label]),
        ).values(),
      ),
    [animals, labels],
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
    appliedLabels.length > 0;

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

      // An animal carries several labels, so it matches if any selected label
      // is among them.
      const matchesLabel =
        appliedLabels.length === 0 ||
        appliedLabels.some((label) =>
          animal.labels.some((entry) => entry.trim().toLowerCase() === label.toLowerCase()),
        );

      return matchesSearch && matchesStatus && matchesSpecies && matchesLabel;
    });
  }, [animals, appliedLabels, appliedSearchQuery, appliedSpecies, appliedStatus]);

  const sortedAnimals = useMemo(
    () => sortAnimals(filteredAnimals, appliedSort),
    [filteredAnimals, appliedSort],
  );
  const sortedCollectives = useMemo(
    () => sortCollectives(collectives, appliedSort),
    [collectives, appliedSort],
  );

  const openFilters = () => {
    setDraftSearchQuery(appliedSearchQuery);
    setDraftStatus([...appliedStatus]);
    setDraftSpecies([...appliedSpecies]);
    setDraftLabels([...appliedLabels]);
    setShowLabelSelector(false);
    setShowFilterSheet(true);
  };

  const applyFilters = () => {
    setAppliedSearchQuery(draftSearchQuery.trim());
    setAppliedStatus([...draftStatus]);
    setAppliedSpecies([...draftSpecies]);
    setAppliedLabels([...draftLabels]);
    setShowLabelSelector(false);
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
            icon: 'filter-funnel-outline',
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
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  numberOfLines={1}
                  style={[styles.segmentText, selected ? styles.segmentTextActive : styles.segmentTextIdle]}
                >
                  {option === 'individual' ? 'Individual animals' : 'Herds & flocks'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <ImportPromptBubble onPress={() => router.push('/import-animals')} />
        <Text style={styles.countText}>
          {animalView === 'collectives'
            ? describeCollectiveCount(collectives)
            : hasActiveFilters
              ? `${filteredAnimals.length} of ${animals.length} animals`
              : `${animals.length} animals`}
          <Text>{` · ${getSortLabel(appliedSort)}`}</Text>
        </Text>
        {animalView === 'collectives' ? (
          collectives.length === 0 ? (
            <View style={styles.emptyState}>
              <AppIcon name="animals3" size={78} color="#E5E0E7" opacity={1} />
              <Text style={styles.emptyTitle}>Empty</Text>
              <Text style={styles.emptyText}>Add a herd or flock below</Text>
            </View>
          ) : (
            <>
              {sortedCollectives.map((collective) => {
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
                // The count moves down to the footer row, which was carrying
                // only the status word. Sharing the info row with the species
                // chip meant a long name pushed the count under the chevron —
                // and the count is the fact this card exists to show.
                const meta = reference ? label : '';
                const countLabel = `${count} ${count === 1 ? 'animal' : 'animals'}`;

                return (
                  <BouncyPressable
                    key={collective.uid}
                    accessibilityLabel={title}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: '/view-collective',
                        params: { collectiveUid: collective.uid },
                      })
                    }
                    style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                  >
                    <CollectiveCardAvatar collective={collective} tone={tone} />
                    <View style={styles.cardCopy}>
                      <View style={styles.headerRow}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {title}
                          {meta ? <Text style={styles.cardTitleName}>{` (${meta})`}</Text> : null}
                        </Text>
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
                        <Text style={styles.countBadge} numberOfLines={1}>
                          {countLabel}
                        </Text>
                      </View>
                      <View style={styles.footerRow}>
                        <View style={styles.statusRow}>
                          <View
                            style={[
                              styles.statusDot,
                              collective.status === 'Inactive'
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
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {animal.id}
                      {animal.name.trim() ? (
                        <Text style={styles.cardTitleName}>{` (${animal.name.trim()})`}</Text>
                      ) : null}
                    </Text>
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
                    <AppIcon
                      key={`${animal.id}-${animal.sex}`}
                      name={getAnimalSexIcon(animal.sex)}
                      size={14}
                      color={tokens.colors.text}
                    />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {abbreviateAgeLabel(animal.ageLabel)}
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
      <FabSpeedDial
        accessibilityLabel="Add animal"
        positionerRef={fabRef}
        actions={[
          {
            // Custom white artwork: a single head for one animal, the herd
            // drawing for several at once.
            image: require('../../assets/individual.png'),
            label: 'Add animal',
            onPress: () => router.push('/add-animal'),
          },
          {
            image: require('../../assets/herd.png'),
            label: 'Add herd or flock',
            onPress: () => router.push('/add-collective'),
          },
        ]}
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
                <View style={[styles.searchField, searchFocused && styles.searchFieldFocused]}>
                  <AppIcon name="search" size={18} color="#6f6f6f" />
                  <TextInput
                    accessibilityLabel="Search by ID or name"
                    placeholder="Search by ID or name"
                    placeholderTextColor="#7a7a7a"
                    style={styles.searchInput}
                    value={draftSearchQuery}
                    onChangeText={setDraftSearchQuery}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
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
              {availableLabels.length > 0 ? (
                <View style={styles.filterBlock}>
                  <Text style={styles.filterLabel}>By Label</Text>
                  <Pressable
                    accessibilityLabel="Select labels"
                    accessibilityRole="button"
                    onPress={(event) => {
                      event.stopPropagation();
                      setShowLabelSelector(true);
                    }}
                    style={({ pressed }) => [styles.pickerField, pressed && styles.pressed]}
                  >
                    <Text style={[styles.fieldValue, draftLabels.length === 0 && styles.placeholderValue]}>
                      {formatLabelSelection(draftLabels)}
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
                    setDraftLabels([]);
                    setShowLabelSelector(false);
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
          {showLabelSelector ? (
            <Pressable
              style={styles.selectionBackdrop}
              onPress={(event) => {
                event.stopPropagation();
                setShowLabelSelector(false);
              }}
            >
              <AnimatedPopupCard visible={showLabelSelector} style={styles.selectionCard} onPress={() => undefined}>
                <View style={styles.selectionHeader}>
                  <Text style={styles.selectionTitle}>Select labels</Text>
                  <Pressable
                    accessibilityLabel="Done"
                    accessibilityRole="button"
                    onPress={() => setShowLabelSelector(false)}
                  >
                    <Text style={styles.modalDone}>Done</Text>
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {availableLabels.map((label) => {
                    const isSelected = draftLabels.some((entry) => entry.toLowerCase() === label.toLowerCase());

                    return (
                      <Pressable
                        key={label}
                        accessibilityLabel={label}
                        accessibilityRole="button"
                        onPress={() =>
                          setDraftLabels((current) =>
                            current.some((entry) => entry.toLowerCase() === label.toLowerCase())
                              ? current.filter((entry) => entry.toLowerCase() !== label.toLowerCase())
                              : [...current, label],
                          )
                        }
                        style={({ pressed }) => [
                          styles.selectionRow,
                          isSelected && styles.selectionRowActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[styles.selectionText, isSelected && styles.selectionTextActive]}>{label}</Text>
                        {isSelected ? <AppIcon name="check" size={16} color="#fff" /> : null}
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
                      isSelected && styles.sortRowActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.selectionText, isSelected && styles.sortTextActive]}>{option.label}</Text>
                    {isSelected ? <AppIcon name="check" size={16} color="#fff" /> : null}
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
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
    gap: 10,
    // No extra margin — the content container's own gap is the only spacing
    // between the toggle and the import card, keeping them visually paired.
    marginBottom: 0,
  },
  // No flex: each button is only as wide as its own label, so the pair sits at
  // the start of the row instead of splitting the screen in half.
  // The two labels together are wide for one row on a small screen, and these
  // buttons hug their text rather than flexing — so let them give ground before
  // the text does.
  segmentButton: {
    flexShrink: 1,
    minWidth: 0,
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
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // Same focus ring DesignField gives every field on the add screens.
  searchFieldFocused: {
    borderColor: tokens.colors.accent,
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
    backgroundColor: tokens.colors.accent,
  },
  // Sort is a single choice, so the selected row is filled solid rather than
  // washed — the check mark and label go white to sit on it.
  sortRowActive: {
    backgroundColor: tokens.colors.accent,
  },
  sortTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  selectionText: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  selectionTextActive: {
    color: '#fff',
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
    backgroundColor: tokens.colors.accent,
  },
  filterChipText: {
    color: '#555',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
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
    width: 48,
    height: 48,
    borderRadius: 16,
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
  // The name rides alongside the identifier rather than taking a line of its
  // own: unbolded and bracketed, so the tag still reads as the title.
  cardTitleName: {
    // 13 to match metaText and the count, not the 16 of the identifier it sits
    // beside — a nested Text inherits the parent's size unless it says otherwise.
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.textSoft,
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
  // Sits immediately right of the species chip. flexShrink 0 keeps it whole —
  // it was being clipped by the chevron back when it shared this row with the
  // name, which now lives up in the title.
  countBadge: {
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 0,
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
  // Cards draw at badge size, so they use the thumbnail rather than decoding
  // the full-size photo once per row (see useThumbnailUri).
  const imageUri = useThumbnailUri(animal.showImageOnCard ? animal.imageUris?.[0] : null);
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
          size={24}
          color={theme.icon}
        />
      )}
    </View>
  );
}

function CollectiveCardAvatar({ collective, tone }: { collective: Collective; tone: AnimalTone }) {
  const imageUri = useThumbnailUri(collective.showImageOnCard ? collective.imageUris?.[0] : null);
  const [imageFailed, setImageFailed] = useState(false);
  const theme = getSpeciesThemeByLabel(collective.species);

  useEffect(() => {
    setImageFailed(false);
  }, [collective.uid, imageUri]);

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
          name={getSpeciesIconName(collective.species, tone)}
          size={24}
          color={theme.icon}
        />
      )}
    </View>
  );
}

function formatLabelSelection(labels: string[]) {
  if (labels.length === 0) {
    return 'Select labels';
  }

  if (labels.length === 1) {
    return labels[0];
  }

  return `${labels.length} labels selected`;
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

