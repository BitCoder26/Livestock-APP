import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { SPECIES_OPTIONS } from '../src/constants/records';
import { getSpeciesThemeByLabel } from '../src/constants/speciesTheme';
import { useAccount } from '../src/context/AccountContext';
import { useCollectives } from '../src/context/CollectivesContext';
import {
  collectiveTermForSpecies,
  getCollectiveCount,
  type Collective,
  type CollectiveCountEvent,
} from '../src/entities/collective';
import { tokens } from '../src/theme/tokens';
import { formatDateForDisplay } from '../src/utils/dateFormat';

const SPECIES_ICONS = new Map<string, AppIconName>(
  SPECIES_OPTIONS.map((item) => [item.label, item.icon]),
);

export default function ViewCollectiveScreen() {
  const router = useRouter();
  const { collectiveUid } = useLocalSearchParams<{ collectiveUid?: string }>();
  const { collectives } = useCollectives();
  const { profile } = useAccount();

  const collective = useMemo(
    () => collectives.find((item) => item.uid === collectiveUid),
    [collectives, collectiveUid],
  );

  // Newest first, matching the animal timeline. Undated events sort last
  // rather than being dropped — they are still part of the history.
  const timeline = useMemo(() => {
    if (!collective) {
      return [];
    }

    return [...collective.countEvents].sort((a, b) => {
      const left = Date.parse(a.date);
      const right = Date.parse(b.date);

      if (Number.isNaN(left) && Number.isNaN(right)) return 0;
      if (Number.isNaN(left)) return 1;
      if (Number.isNaN(right)) return -1;

      return right - left;
    });
  }, [collective]);

  const term = collective ? collectiveTermForSpecies(collective.species) : 'group';
  const theme = collective ? getSpeciesThemeByLabel(collective.species) : null;
  const count = collective ? getCollectiveCount(collective) : 0;

  const handleShare = async () => {
    if (!collective) {
      Alert.alert('Not found', `There is no ${term} to share right now.`);
      return;
    }

    const sections = [
      collective.id.trim() || collective.name.trim() || `${collective.species} ${term}`,
      collective.name.trim() ? `Name: ${collective.name.trim()}` : '',
      `Species: ${collective.species}`,
      `Head count: ${count}`,
      collective.breed.trim() ? `Breed: ${collective.breed.trim()}` : '',
      collective.farm.trim() ? `Farm: ${collective.farm.trim()}` : '',
      collective.paddock.trim() ? `Location: ${collective.paddock.trim()}` : '',
      collective.startDate.trim()
        ? `Established: ${formatDateForDisplay(collective.startDate, profile.dateFormat)}`
        : '',
      `Status: ${collective.status}`,
    ].filter(Boolean);

    try {
      await Share.share({ message: sections.join('\n') });
    } catch {
      Alert.alert('Share unavailable', 'Unable to open the share sheet right now.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title={collective ? `View ${capitalize(term)}` : 'View Herd or Flock'}
        leftAction={{ icon: 'back', accessibilityLabel: 'Back', onPress: () => router.back() }}
        actions={
          collective
            ? [
                {
                  icon: 'share-outline',
                  accessibilityLabel: 'Share',
                  onPress: () => void handleShare(),
                  size: 22,
                },
                {
                  icon: 'edit',
                  accessibilityLabel: `Edit ${term}`,
                  onPress: () =>
                    router.push({
                      pathname: '/add-collective',
                      params: { collectiveUid: collective.uid },
                    }),
                  size: 24,
                },
              ]
            : []
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          !collective || timeline.length === 0 ? styles.contentEmpty : undefined,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {collective ? (
          <View style={styles.summarySection}>
            <View style={styles.summaryHeader}>
              <View style={styles.summaryHeaderMain}>
                <View
                  style={[
                    styles.summarySpeciesIconBadge,
                    { backgroundColor: theme?.chipBackground ?? tokens.colors.surfaceMuted },
                  ]}
                >
                  <AppIcon
                    name={SPECIES_ICONS.get(collective.species) ?? 'animals'}
                    size={56}
                    color={theme?.icon ?? tokens.colors.text}
                    opacity={1}
                  />
                </View>
                <View style={styles.summaryIdentity}>
                  <Text style={styles.summaryId}>
                    {collective.id.trim() || collective.name.trim() || `${collective.species} ${term}`}
                  </Text>
                  <Text style={styles.summaryName}>
                    {collective.name.trim() || `Unnamed ${term}`}
                  </Text>
                  <Text style={styles.summaryMeta}>
                    {`${count} ${count === 1 ? 'animal' : 'animals'}`}
                  </Text>
                </View>
              </View>
              <View style={styles.statusPill}>
                <View
                  style={[
                    styles.statusDot,
                    collective.status === 'Closed' ? styles.statusClosed : styles.statusActive,
                  ]}
                />
                <Text style={styles.statusText}>{collective.status}</Text>
              </View>
            </View>

            <View style={styles.summaryDetails}>
              <SummaryDetail label="Species" value={collective.species} />
              <SummaryDetail label="Breed or type" value={collective.breed} />
              <SummaryDetail
                label="Average weight"
                value={formatWeight(collective.averageWeight, collective.weightUnit)}
              />
              <SummaryDetail label="Cost per animal" value={collective.cost} />
              <SummaryDetail label="Supplier" value={collective.supplier} />
              <SummaryDetail label="Farm" value={collective.farm} />
              <SummaryDetail label="Location" value={collective.paddock} />
              <SummaryDetail
                label="Established"
                value={formatDateForDisplay(collective.startDate, profile.dateFormat)}
              />
              <SummaryDetail
                label="Born or hatched"
                value={formatDateForDisplay(collective.birthDate, profile.dateFormat)}
              />
              <SummaryDetail label="Purpose" value={collective.purpose} />
            </View>

            {collective.notes.trim() ? (
              <View style={styles.summaryNotes}>
                <Text style={styles.summaryLabel}>Notes</Text>
                <Text style={styles.summaryNotesText}>{collective.notes.trim()}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {!collective ? (
          <View style={styles.emptyState}>
            <AppIcon name="animals3" size={80} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>Not found</Text>
            <Text style={styles.emptyText}>Return and open a herd or flock again.</Text>
          </View>
        ) : timeline.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="records_" size={80} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>No timeline yet</Text>
            <Text style={styles.emptyText}>Changes to the head count will appear here.</Text>
          </View>
        ) : (
          <View style={styles.timelineList}>
            <Text style={styles.timelineListHeading}>
              Timeline · {timeline.length} {timeline.length === 1 ? 'Change' : 'Changes'}
            </Text>
            {timeline.map((event, index) => (
              <View key={event.id} style={styles.timelineRow}>
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.9}
                  numberOfLines={1}
                  style={styles.recordDate}
                >
                  {formatDateForDisplay(event.date, profile.dateFormat) || '—'}
                </Text>
                <View style={styles.railColumn}>
                  {index !== timeline.length - 1 ? <View style={styles.railLine} /> : null}
                  <View style={styles.railDot} />
                </View>
                <View style={styles.recordCard}>
                  <View style={styles.recordCopy}>
                    <Text style={styles.recordTitle}>{event.reason}</Text>
                    <Text style={styles.recordDetails}>
                      {describeEvent(event)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.delta,
                      event.delta < 0 ? styles.deltaDown : styles.deltaUp,
                    ]}
                  >
                    {formatDelta(event.delta)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryDetail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryDetail}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value.trim() ? value : '—'}</Text>
    </View>
  );
}

function describeEvent(event: CollectiveCountEvent) {
  const magnitude = Math.abs(event.delta);
  const direction = event.delta < 0 ? 'left' : 'joined';
  const base = `${magnitude} ${magnitude === 1 ? 'animal' : 'animals'} ${direction} the group`;

  return event.notes.trim() ? `${base} · ${event.notes.trim()}` : base;
}

function formatDelta(delta: number) {
  return delta < 0 ? `${delta}` : `+${delta}`;
}

function formatWeight(weight: string, unit: string) {
  return weight.trim() ? `${weight.trim()} ${unit}` : '';
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 40, gap: 16 },
  contentEmpty: { flexGrow: 1 },
  summarySection: {
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    gap: 16,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  summaryHeaderMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  summaryIdentity: { flex: 1, gap: 3, paddingTop: 4 },
  summarySpeciesIconBadge: {
    width: 116,
    height: 116,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryId: { color: tokens.colors.text, fontSize: 23, fontWeight: '700' },
  summaryName: { color: tokens.colors.textSoft, fontSize: 15, fontWeight: '500' },
  summaryMeta: { color: tokens.colors.text, fontSize: 13, fontWeight: '500' },
  statusPill: {
    minHeight: 32,
    borderRadius: 16,
    backgroundColor: tokens.colors.surfaceMuted,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusActive: { backgroundColor: '#86A43D' },
  statusClosed: { backgroundColor: '#8A8A8A' },
  statusText: { color: tokens.colors.text, fontSize: 12, fontWeight: '600' },
  summaryDetails: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 15 },
  summaryDetail: { width: '47%', gap: 3 },
  summaryLabel: {
    color: tokens.colors.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  summaryValue: { color: tokens.colors.text, fontSize: 14, fontWeight: '500' },
  summaryNotes: { gap: 5 },
  summaryNotesText: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 8,
  },
  emptyTitle: { marginTop: 12, color: '#E5E0E7', fontSize: 29, fontWeight: '700' },
  emptyText: { color: '#E5E0E7', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  timelineList: { gap: 14 },
  timelineListHeading: {
    color: tokens.colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginLeft: 4,
  },
  timelineRow: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  recordDate: {
    width: 92,
    paddingTop: 14,
    color: tokens.colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  railColumn: { width: 18, alignItems: 'center', position: 'relative' },
  railLine: {
    position: 'absolute',
    top: 18,
    bottom: -34,
    width: 2,
    backgroundColor: 'rgba(231, 108, 102, 0.8)',
  },
  railDot: {
    marginTop: 14,
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: tokens.colors.accent,
  },
  recordCard: {
    flex: 1,
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
  recordCopy: { flex: 1, gap: 4 },
  recordTitle: { color: tokens.colors.text, fontSize: 16, fontWeight: '700' },
  recordDetails: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '500',
  },
  delta: { fontSize: 17, fontWeight: '700' },
  deltaUp: { color: '#86A43D' },
  deltaDown: { color: '#B64949' },
});
