import { useIsFocused, useRouter } from 'expo-router';
import { useRef } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../../src/components/AppIcon';
import { AppTopBar } from '../../src/components/AppTopBar';
import { BouncyPressable } from '../../src/components/BouncyPressable';
import { TabSwipeView } from '../../src/components/TabSwipeView';
import { FloatingActionButton } from '../../src/components/FloatingActionButton';
import { getSpeciesThemeByLabel } from '../../src/constants/speciesTheme';
import { useAccount } from '../../src/context/AccountContext';
import { useOnboarding, useSpotlightTarget } from '../../src/context/OnboardingContext';
import { useRecords } from '../../src/context/RecordsContext';
import { tokens } from '../../src/theme/tokens';
import { formatDateForDisplay } from '../../src/utils/dateFormat';

const FACEBOOK_GROUP_URL = 'https://www.facebook.com/groups/1353099223626390/';

function formatAnimalSummary(record: { animalIds?: string[]; animalTag: string; type?: string; headCount?: string }) {
  if (record.type === 'Count') {
    return `${record.headCount?.trim() || '?'} head counted`;
  }

  const count = record.animalIds?.length ?? record.animalTag.split(',').map((value) => value.trim()).filter(Boolean).length;

  if (count === 1) {
    return `1 animal (${record.animalTag.trim()})`;
  }

  return `${count} animals`;
}

export default function RecordsScreen() {
  const router = useRouter();
  const { profile } = useAccount();
  const { records, filteredRecords, filters } = useRecords();
  const { step } = useOnboarding();
  const isFocused = useIsFocused();

  const fabRef = useRef<View>(null);
  useSpotlightTarget('record', step === 'record' && isFocused, fabRef);
  const hasActiveFilters = Object.values(filters).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );
  const shouldFloatPromoCard = filteredRecords.length === 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <TabSwipeView>
        <AppTopBar
        title="Records"
        actions={[
          {
            icon: 'filter',
            accessibilityLabel: 'Filter records',
            onPress: () => router.push('/records-filter'),
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
          <BouncyPressable
            accessibilityLabel="Open Facebook group"
            accessibilityRole="button"
            containerStyle={shouldFloatPromoCard ? styles.facebookCardFloatingContainer : undefined}
            onPress={() => Linking.openURL(FACEBOOK_GROUP_URL)}
            style={({ pressed }) => [
              styles.facebookCard,
              shouldFloatPromoCard && styles.facebookCardFloating,
              pressed && styles.cardPressed,
            ]}
          >
            <AppIcon name="group" size={24} color="#171717" />
            <View style={styles.facebookCopy}>
              <Text style={styles.facebookTitle}>Join the Facebook group</Text>
              <Text style={styles.facebookText}>Users share tips, discuss the app, and offer support there.</Text>
            </View>
            <View style={styles.facebookJoinButton}><Text style={styles.facebookJoinButtonText}>Join</Text></View>
          </BouncyPressable>
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
                <BouncyPressable
                  key={record.id}
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
                        <Text style={styles.cardMeta}>{formatAnimalSummary(record)}</Text>
                      </View>
                    </View>
                  </View>
                  <AppIcon name="chevron-right-minimal" size={18} color="#171717" />
                </BouncyPressable>
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
      </TabSwipeView>
    </SafeAreaView>
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
    backgroundColor: 'rgba(231, 108, 102, 0.14)',
    paddingHorizontal: 18,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  facebookCardFloating: {
    marginBottom: 0,
  },
  facebookCardFloatingContainer: {
    position: 'absolute',
    top: 18,
    left: 16,
    right: 16,
    zIndex: 2,
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
  },
  facebookJoinButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
