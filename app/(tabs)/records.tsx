import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../src/theme/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from 'expo-sqlite/kv-store';

import { AppIcon } from '../../src/components/AppIcon';
import { AppReviewGate } from '../../src/components/AppReviewGate';
import { useAppDrawer } from '../../src/components/AppDrawer';
import { AppTopBar } from '../../src/components/AppTopBar';
import { PlanLimitGate } from '../../src/components/PlanLimitGate';
import { BouncyPressable } from '../../src/components/BouncyPressable';
import { RecordKindChip } from '../../src/components/RecordKindChip';
import { TabSwipeView } from '../../src/components/TabSwipeView';
import { FabSpeedDial } from '../../src/components/FabSpeedDial';
import { getSpeciesThemeByLabel } from '../../src/constants/speciesTheme';
import { useAccount } from '../../src/context/AccountContext';
import { useAnimals } from '../../src/context/AnimalsContext';
import { useCollectives } from '../../src/context/CollectivesContext';
import { useOnboarding, useSpotlightTarget } from '../../src/context/OnboardingContext';
import { hasActiveRecordFilters, useRecords } from '../../src/context/RecordsContext';
import type { Animal } from '../../src/entities/animal';
import type { RecordEntry } from '../../src/entities/record';
import { tokens } from '../../src/theme/tokens';
import { formatDateForDisplay, parseStoredDate } from '../../src/utils/dateFormat';
import { resolveRecordDisplayTags } from '../../src/utils/recordAnimals';
import { collectiveTermForSpecies } from '../../src/entities/collective';
import { formatCollectiveSummary, isCollectiveRecord, recordTypeHeadline } from '../../src/utils/recordCollectives';
import { MODAL_SHEET_ENTRANCE_DURATION, motionDuration } from '../../src/utils/motion';

const FACEBOOK_GROUP_URL = 'https://www.facebook.com/groups/1353099223626390/';
const FACEBOOK_CARD_DISMISSED_KEY = 'facebookGroupCardDismissed';
const RECORD_SORT_KEY = 'recordsSortOption';
// Saving now returns directly to the list, so the new card can enter at once.
const NEW_RECORD_CARD_ENTRANCE_DELAY = 0;
const RECORD_CARD_ENTRANCE_DURATION = motionDuration(260);
// Removal is a response to a tap, so it runs shorter than the entrance and
// without any delay at all — see the exit effect.
const RECORD_CARD_EXIT_DURATION = motionDuration(200);
let lastAnimatedRecordId: string | null = null;
// RecordsContext hands the list over already sorted by record date, newest
// first; every other order is applied on top of that here. Record date is
// when the thing happened, createdAt when it was typed in — the two only
// coincide until someone back-dates a catch-up entry, which is why both are
// offered rather than one standing in for the other.
const SORT_OPTIONS = [
  { value: 'recent', label: 'Most recent (default)' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'added', label: 'Recently added' },
  { value: 'type', label: 'Type (A–Z)' },
] as const;
type RecordSortOption = (typeof SORT_OPTIONS)[number]['value'];
const DEFAULT_SORT: RecordSortOption = 'recent';

function isRecordSortOption(value: unknown): value is RecordSortOption {
  return SORT_OPTIONS.some((option) => option.value === value);
}

/** Sheet labels carry a "(default)" aside; the count line wants the order alone. */
function getSortLabel(sort: RecordSortOption) {
  const label = SORT_OPTIONS.find((option) => option.value === sort)?.label ?? SORT_OPTIONS[0].label;
  return label.replace(' (default)', '');
}

function getRecordDateTime(record: RecordEntry) {
  return parseStoredDate(record.date)?.getTime() ?? 0;
}

function getRecordCreatedTime(record: RecordEntry) {
  return record.createdAt ? Date.parse(record.createdAt) || 0 : 0;
}

function sortRecords(list: RecordEntry[], sort: RecordSortOption): RecordEntry[] {
  switch (sort) {
    case 'oldest':
      return [...list].sort((a, b) => getRecordDateTime(a) - getRecordDateTime(b));
    case 'added':
      return [...list].sort((a, b) => getRecordCreatedTime(b) - getRecordCreatedTime(a));
    // Ties keep the incoming newest-first date order, so each type block reads
    // as its own little timeline rather than in arbitrary order.
    case 'type':
      return [...list].sort((a, b) => a.type.localeCompare(b.type));
    case 'recent':
    default:
      return list;
  }
}

/**
 * Whether the record belongs to one animal or to a group, said in the group's
 * own word: a chicken record reads FLOCK, a pig record HERD, and anything
 * without an everyday collective noun falls back to BATCH.
 */
function getRecordKindLabel(record: RecordEntry) {
  if (!isCollectiveRecord(record)) {
    return 'Individual';
  }

  const term = collectiveTermForSpecies(record.species);

  return term ? `${term.charAt(0).toUpperCase()}${term.slice(1)}` : term;
}

function formatAnimalSummary(record: RecordEntry, animals: Animal[]) {
  const count = record.animalIds?.length ?? record.animalTag.split(',').map((value) => value.trim()).filter(Boolean).length;

  if (count === 0) {
    // Only Other can be saved without an animal — a feed delivery, bedding, a
    // fencing repair. It belongs to the farm rather than to anything in it.
    return 'Whole farm';
  }

  if (count === 1) {
    // Named the way the keeper refers to it: the tag it wears, with whatever
    // they call it in brackets. Plenty of animals are never given a name.
    const [tag] = resolveRecordDisplayTags(record, animals);
    const reference = (tag || record.animalTag).trim();
    const uid = record.animalUids?.[0];
    const name = (uid ? animals.find((entry) => entry.uid === uid)?.name ?? '' : '').trim();

    return name ? `${reference} (${name})` : reference;
  }

  return `${count} animals`;
}

const CARD_CHEVRON_COLOR = tokens.colors.text;

export default function RecordsScreen() {
  const router = useRouter();
  const { openDrawer } = useAppDrawer();
  const { newRecordId, deletingRecordId } = useLocalSearchParams<{
    newRecordId?: string;
    deletingRecordId?: string;
  }>();
  const { profile } = useAccount();
  const { animals } = useAnimals();
  const { collectives } = useCollectives();
  const { records, filteredRecords, filters, deleteRecord } = useRecords();
  const { step } = useOnboarding();
  const isFocused = useIsFocused();

  const fabRef = useRef<View>(null);
  useSpotlightTarget('record', step === 'record' && isFocused, fabRef);
  const hasActiveFilters = hasActiveRecordFilters(filters);
  const [appliedSort, setAppliedSort] = useState<RecordSortOption>(DEFAULT_SORT);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [reviewPromptVisible, setReviewPromptVisible] = useState(false);
  const sortSheetEntrance = useRef(new Animated.Value(0)).current;
  const sortedRecords = useMemo(
    () => sortRecords(filteredRecords, appliedSort),
    [appliedSort, filteredRecords],
  );
  const sortLabel = getSortLabel(appliedSort);

  // The chosen order is a preference, not a momentary lens: it survives a
  // relaunch so a stretch of oldest-first data entry does not have to be
  // re-picked every time the app is opened. The sort button keeps its badge
  // for as long as the order is not the default — which is exactly when
  // someone returning later needs telling why the top card is not the one
  // they added last.
  useEffect(() => {
    let isActive = true;

    AsyncStorage.getItem(RECORD_SORT_KEY)
      .then((value) => {
        if (isActive && isRecordSortOption(value)) {
          setAppliedSort(value);
        }
      })
      .catch(() => {});

    return () => {
      isActive = false;
    };
  }, []);

  const chooseSort = (value: RecordSortOption) => {
    setAppliedSort(value);
    setShowSortSheet(false);
    void AsyncStorage.setItem(RECORD_SORT_KEY, value).catch(() => {});
  };

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
  const [isFacebookCardDismissed, setIsFacebookCardDismissed] = useState(false);
  // Only reserve space for the floating card while it's actually showing —
  // once dismissed, the count/empty state should sit exactly where they do
  // on the Animals tab (which has no promo card to offset for) instead of
  // keeping a leftover gap.
  const shouldFloatPromoCard = filteredRecords.length === 0 && !isFacebookCardDismissed;

  useEffect(() => {
    AsyncStorage.getItem(FACEBOOK_CARD_DISMISSED_KEY)
      .then((value) => {
        if (value === '1') {
          setIsFacebookCardDismissed(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleDismissFacebookCard = () => {
    setIsFacebookCardDismissed(true);
    void AsyncStorage.setItem(FACEBOOK_CARD_DISMISSED_KEY, '1').catch(() => {});
  };

  const finishRecordDeletion = async (recordId: string) => {
    const result = await deleteRecord(recordId);

    if (!result.ok) {
      Alert.alert('Record could not be deleted', 'The record was left unchanged. Please try again.');
      return false;
    }

    return true;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <TabSwipeView>
        <AppTopBar
        title="Records"
        leftAction={{
          icon: 'menu',
          accessibilityLabel: 'Open menu',
          onPress: openDrawer,
        }}
        actions={[
          {
            icon: 'sort',
            accessibilityLabel:
              appliedSort !== DEFAULT_SORT ? 'Sort records (custom sort applied)' : 'Sort records',
            onPress: () => setShowSortSheet(true),
            badge: appliedSort !== DEFAULT_SORT,
          },
          {
            icon: 'filter-funnel-outline',
            accessibilityLabel: hasActiveFilters ? 'Filter records (filters applied)' : 'Filter records',
            onPress: () => router.push('/records-filter'),
            badge: hasActiveFilters,
          },
        ]}
      />
      <View style={styles.body}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {isFacebookCardDismissed ? null : (
            <View style={[styles.facebookWrapper, shouldFloatPromoCard && styles.facebookCardFloatingContainer]}>
              <BouncyPressable
                accessibilityLabel="Open Facebook group"
                accessibilityRole="button"
                containerStyle={styles.facebookCardContainer}
                onPress={() => Linking.openURL(FACEBOOK_GROUP_URL)}
                style={({ pressed }) => [
                  styles.facebookCard,
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={styles.facebookIcon}>
                  <AppIcon name="group" size={24} color="#171717" />
                </View>
                <View style={styles.facebookCopy}>
                  <Text style={styles.facebookTitle}>Join the Facebook group</Text>
                  <Text style={styles.facebookText}>Users share tips, discuss the app, and offer support there.</Text>
                </View>
                <View style={styles.facebookJoinButton}><Text style={styles.facebookJoinButtonText}>Join</Text></View>
              </BouncyPressable>
              <Pressable
                accessibilityLabel="Dismiss Facebook group card"
                accessibilityRole="button"
                hitSlop={10}
                onPress={handleDismissFacebookCard}
                style={({ pressed }) => [styles.promoDismissButton, pressed && styles.cardPressed]}
              >
                <AppIcon name="close" size={10} color="#8A5A55" />
              </Pressable>
            </View>
          )}
          <Text style={[styles.countText, shouldFloatPromoCard && styles.countTextBelowFloatingFacebook]}>
            {hasActiveFilters
              ? `${filteredRecords.length} of ${records.length} records`
              : `${records.length} records`}
            <Text>{` · ${sortLabel}`}</Text>
          </Text>
          {filteredRecords.length === 0 ? null : (
            sortedRecords.map((record) => {
              const speciesTheme = getSpeciesThemeByLabel(record.species);

              return (
                <RecordCardMotion
                  key={record.id}
                  recordId={record.id}
                  animate={record.id === newRecordId}
                  exit={record.id === deletingRecordId}
                  onExitComplete={finishRecordDeletion}
                >
                  <BouncyPressable
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/view-record', params: { recordId: record.id } })}
                    style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                  >
                    <View style={styles.cardCopy}>
                      <Text style={styles.cardTypeTitle} numberOfLines={1}>
                        {recordTypeHeadline(record)}
                      </Text>
                      <View style={styles.dateRow}>
                        <RecordKindChip
                          label={getRecordKindLabel(record)}
                          tone={isCollectiveRecord(record) ? 'group' : 'individual'}
                        />
                        <Text style={styles.cardDate} numberOfLines={1}>
                          {formatDateForDisplay(record.date, profile.dateFormat)}
                        </Text>
                      </View>
                      <View style={styles.footerRow}>
                        {record.species.trim() ? (
                          <View style={[styles.speciesChip, { backgroundColor: speciesTheme.chipBackground }]}>
                            <Text style={[styles.speciesChipText, { color: speciesTheme.text }]}>{record.species}</Text>
                          </View>
                        ) : null}
                        <View style={styles.animalMetaRow}>
                          <Text style={styles.cardMeta}>
                            {isCollectiveRecord(record)
                              ? formatCollectiveSummary(record, collectives)
                              : formatAnimalSummary(record, animals)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <AppIcon name="chevron-right-bold" size={22} color={CARD_CHEVRON_COLOR} />
                  </BouncyPressable>
                </RecordCardMotion>
              );
            })
          )}
        </ScrollView>
        {filteredRecords.length === 0 ? (
          <View pointerEvents="none" style={styles.emptyState}>
            <AppIcon name="records_" size={86} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>{hasActiveFilters ? 'No matches' : 'Empty'}</Text>
            <Text style={styles.emptyText}>{hasActiveFilters ? 'Try fewer filters' : 'Add below'}</Text>
          </View>
        ) : null}
      </View>
      <FabSpeedDial
        accessibilityLabel="Add record"
        positionerRef={fabRef}
        actions={[
          {
            // Mirrors the Animals tab exactly: the single-animal artwork,
            // then the herd artwork.
            image: require('../../assets/individual.png'),
            label: 'Add for animal',
            onPress: () => router.push('/add-record'),
          },
          {
            image: require('../../assets/herd.png'),
            label: 'Add for herd or flock',
            onPress: () => router.push('/add-collective-record'),
          },
        ]}
      />
      <AppReviewGate onVisibilityChange={setReviewPromptVisible} />
      {/* Held back while the rating prompt owns the screen — it mounts, and
          so runs its check, only once that one is gone. */}
      {reviewPromptVisible ? null : <PlanLimitGate />}

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
                <Text style={styles.sheetTitle}>Sort records</Text>
                <Pressable
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                  onPress={() => setShowSortSheet(false)}
                  style={styles.closeButton}
                >
                  <AppIcon name="close" size={26} color="#000" />
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
                      onPress={() => chooseSort(option.value)}
                      style={({ pressed }) => [
                        styles.selectionRow,
                        styles.sortRow,
                        isSelected && styles.sortRowActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.selectionText, isSelected && styles.sortTextActive]}>
                        {option.label}
                      </Text>
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

function RecordCardMotion({
  animate,
  children,
  exit,
  onExitComplete,
  recordId,
}: PropsWithChildren<{
  animate: boolean;
  exit: boolean;
  onExitComplete: (recordId: string) => Promise<boolean>;
  recordId: string;
}>) {
  const shouldAnimate = useRef(animate && lastAnimatedRecordId !== recordId).current;
  const entrance = useRef(new Animated.Value(shouldAnimate ? 0 : 1)).current;
  const onExitCompleteRef = useRef(onExitComplete);
  onExitCompleteRef.current = onExitComplete;

  useEffect(() => {
    if (!shouldAnimate) {
      return;
    }

    lastAnimatedRecordId = recordId;
    const animation = Animated.sequence([
      Animated.delay(NEW_RECORD_CARD_ENTRANCE_DELAY),
      Animated.timing(entrance, {
        toValue: 1,
        duration: RECORD_CARD_ENTRANCE_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start();
    return () => animation.stop();
  }, [entrance, recordId, shouldAnimate]);

  useEffect(() => {
    if (!exit) {
      return;
    }

    // No delay here. A delete is a direct response to the user's tap, and the
    // 340ms that stops a new card racing the reveal is just dead air when the
    // card is on its way out.
    const animation = Animated.timing(entrance, {
      toValue: 0,
      duration: RECORD_CARD_EXIT_DURATION,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });

    animation.start(({ finished }) => {
      if (!finished) {
        return;
      }

      void onExitCompleteRef.current(recordId).then((didDelete) => {
        if (didDelete) {
          return;
        }

        Animated.timing(entrance, {
          toValue: 1,
          duration: RECORD_CARD_ENTRANCE_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    });

    return () => animation.stop();
  }, [entrance, exit, recordId]);

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
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
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
  sheetHeaderSpacer: { width: 34 },
  sheetTitle: { color: tokens.colors.text, fontSize: 18, fontWeight: '700' },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  // The filter screen opens on a text label, whose ink starts a few pixels
  // below its line box; a filled chip has no such inset, so it needs the
  // difference added back to sit the same distance under the sheet title.
  sortSheetContent: { paddingTop: 6, paddingBottom: 24 },
  selectionRow: {
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: '#EFECF0',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  selectionRowActive: { backgroundColor: tokens.colors.accent },
  // Sort options are pills; the multi-select rows elsewhere keep the softer
  // 18pt corner so the two lists stay distinguishable.
  sortRow: { borderRadius: 999 },
  // Sort is a single choice, so the selected row is filled solid rather than
  // washed — the check mark and label go white to sit on it.
  sortRowActive: { backgroundColor: tokens.colors.accent },
  sortTextActive: { color: '#fff', fontWeight: '700' },
  selectionText: { color: tokens.colors.text, fontSize: 14, fontWeight: '500' },
  selectionTextActive: { color: '#fff' },
  pressed: { opacity: 0.9 },
  safeArea: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  body: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 120,
    gap: 5,
  },
  countText: {
    color: '#8A7F87',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  countTextBelowFloatingFacebook: {
    marginTop: 102,
  },
  emptyState: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
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
  // A hairline instead of a drop shadow: the list reads as a set of tiles
  // rather than a stack of floating slabs, and nothing bleeds between rows.
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 18,
    minHeight: 79,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#DDD5D3',
    // Far softer than the original 0.16 / 7 / 4: the border does the defining
    // and this only warms the edge underneath. Brown rather than black so it
    // sits in the same family as the border it falls behind.
    shadowColor: '#3B2B28',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.92,
  },
  cardCopy: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  cardTypeTitle: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  // The kind badge rides with the date rather than in the footer: that line
  // was three-quarters empty, while the footer had three non-shrinking items
  // competing for one row on a narrow phone.
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // The date, the kind badge and the meta line are all one voice: same colour,
  // size and weight, so the only text that stands apart on the card is the
  // title above them and the species chip's own themed label.
  cardDate: {
    color: '#353535',
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardMeta: {
    // Matches the Animals card's meta line exactly (metaText there), so the
    // two lists read as one typographic system.
    color: '#353535',
    fontSize: 13,
    fontWeight: '500',
  },
  animalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  speciesChip: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 3,
    flexShrink: 0,
  },
  speciesChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  facebookCard: {
    minHeight: 84,
    borderRadius: 18,
    backgroundColor: '#FCEAEA',
    overflow: 'hidden',
    // Extra right padding pulls the action button in off the card's edge; the
    // copy column is flex, so it reclaims the width by wrapping.
    paddingLeft: 18,
    paddingRight: 28,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  facebookIcon: {
    marginRight: -6,
  },
  facebookWrapper: {
    position: 'relative',
  },
  facebookCardContainer: {
    borderRadius: 18,
    backgroundColor: '#FCEAEA',
    marginBottom: 8,
  },
  facebookCardFloatingContainer: {
    position: 'absolute',
    top: 18,
    left: 16,
    right: 16,
    zIndex: 2,
  },
  promoDismissButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  facebookCopy: {
    flex: 1,
    gap: 2,
  },
  facebookTitle: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  facebookText: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  facebookJoinButton: {
    minWidth: 62,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    flexShrink: 0,
    marginRight: 8,
  },
  facebookJoinButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
