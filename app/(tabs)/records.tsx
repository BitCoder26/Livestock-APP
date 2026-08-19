import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from 'expo-sqlite/kv-store';

import { AppIcon } from '../../src/components/AppIcon';
import { AppReviewGate } from '../../src/components/AppReviewGate';
import { AppTopBar } from '../../src/components/AppTopBar';
import { BouncyPressable } from '../../src/components/BouncyPressable';
import { TabSwipeView } from '../../src/components/TabSwipeView';
import { FloatingActionButton } from '../../src/components/FloatingActionButton';
import { getSpeciesThemeByLabel } from '../../src/constants/speciesTheme';
import { useAccount } from '../../src/context/AccountContext';
import { useAnimals } from '../../src/context/AnimalsContext';
import { useOnboarding, useSpotlightTarget } from '../../src/context/OnboardingContext';
import { useRecords } from '../../src/context/RecordsContext';
import type { Animal } from '../../src/entities/animal';
import type { RecordEntry } from '../../src/entities/record';
import { tokens } from '../../src/theme/tokens';
import { formatDateForDisplay } from '../../src/utils/dateFormat';
import { resolveRecordDisplayTags } from '../../src/utils/recordAnimals';
import { motionDuration } from '../../src/utils/motion';

const FACEBOOK_GROUP_URL = 'https://www.facebook.com/groups/1353099223626390/';
const FACEBOOK_CARD_DISMISSED_KEY = 'facebookGroupCardDismissed';
const NEW_RECORD_CARD_ENTRANCE_DELAY = 700;
const RECORD_CARD_MOTION_DURATION = motionDuration(420);
let lastAnimatedRecordId: string | null = null;

function formatAnimalSummary(record: RecordEntry, animals: Animal[]) {
  const count = record.animalIds?.length ?? record.animalTag.split(',').map((value) => value.trim()).filter(Boolean).length;

  if (count === 1) {
    const [tag] = resolveRecordDisplayTags(record, animals);
    return `1 animal · ${(tag || record.animalTag).trim()}`;
  }

  return `${count} animals`;
}

export default function RecordsScreen() {
  const router = useRouter();
  const { newRecordId, deletingRecordId } = useLocalSearchParams<{
    newRecordId?: string;
    deletingRecordId?: string;
  }>();
  const { profile } = useAccount();
  const { animals } = useAnimals();
  const { records, filteredRecords, filters, deleteRecord } = useRecords();
  const { step } = useOnboarding();
  const isFocused = useIsFocused();

  const fabRef = useRef<View>(null);
  useSpotlightTarget('record', step === 'record' && isFocused, fabRef);
  const hasActiveFilters = Object.values(filters).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );
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
        actions={[
          {
            icon: 'filter',
            accessibilityLabel: hasActiveFilters ? 'Filter records (filters applied)' : 'Filter records',
            onPress: () => router.push('/records-filter'),
            badge: hasActiveFilters,
          },
          {
            icon: 'profile',
            accessibilityLabel: 'Open account',
            onPress: () => router.push('/account'),
          },
        ]}
      />
      <View style={styles.body}>
        <ScrollView
          contentContainerStyle={[styles.content, filteredRecords.length === 0 && styles.emptyContent]}
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
                  <Text style={styles.facebookTitle} numberOfLines={1}>Join the Facebook group</Text>
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
          <Text style={[styles.countText, shouldFloatPromoCard && styles.countTextBelowFloatingFacebook]}>{hasActiveFilters ? `${filteredRecords.length} of ${records.length} records` : `${records.length} records`}</Text>
          {filteredRecords.length === 0 ? (
            <View style={styles.emptyState}>
              <AppIcon name="records_" size={86} color="#E5E0E7" opacity={1} />
              <Text style={styles.emptyTitle}>{hasActiveFilters ? 'No matches' : 'Empty'}</Text>
              <Text style={styles.emptyText}>{hasActiveFilters ? 'Try fewer filters' : 'Add below'}</Text>
            </View>
          ) : (
            filteredRecords.map((record) => {
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
                        {record.type}
                      </Text>
                      <Text style={styles.cardDate} numberOfLines={1}>
                        {formatDateForDisplay(record.date, profile.dateFormat)}
                      </Text>
                      <View style={styles.footerRow}>
                        <View style={[styles.speciesChip, { backgroundColor: speciesTheme.chipBackground }]}>
                          <Text style={[styles.speciesChipText, { color: speciesTheme.text }]}>{record.species}</Text>
                        </View>
                        <View style={styles.animalMetaRow}>
                          <Text style={styles.cardMeta}>{formatAnimalSummary(record, animals)}</Text>
                        </View>
                      </View>
                    </View>
                    <AppIcon name="chevron-right-minimal" size={18} color="#171717" />
                  </BouncyPressable>
                </RecordCardMotion>
              );
            })
          )}
        </ScrollView>
      </View>
      <FloatingActionButton
        accessibilityLabel="Add record"
        onPress={() => router.push({ pathname: '/add-record', params: { reveal: '1' } })}
        positionerRef={fabRef}
      />
      <AppReviewGate />
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
        duration: RECORD_CARD_MOTION_DURATION,
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

    const animation = Animated.sequence([
      Animated.delay(NEW_RECORD_CARD_ENTRANCE_DELAY),
      Animated.timing(entrance, {
        toValue: 0,
        duration: RECORD_CARD_MOTION_DURATION,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

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
          duration: RECORD_CARD_MOTION_DURATION,
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
  safeArea: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  body: {
    flex: 1,
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
  countTextBelowFloatingFacebook: {
    marginTop: 102,
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
    paddingVertical: 12,
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
  cardCopy: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  cardTypeTitle: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  cardDate: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 0,
  },
  footerRow: {
    marginTop: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardMeta: {
    color: tokens.colors.muted,
    fontSize: 11,
    fontWeight: '600',
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
    fontSize: 11,
    fontWeight: '600',
  },
  facebookCard: {
    minHeight: 84,
    borderRadius: 18,
    backgroundColor: '#FCEAEA',
    overflow: 'hidden',
    paddingHorizontal: 18,
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
