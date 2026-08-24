import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Image, Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Text } from '../src/theme/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { SPECIES_OPTIONS } from '../src/constants/records';
import { getSpeciesThemeByLabel } from '../src/constants/speciesTheme';
import { useAccount } from '../src/context/AccountContext';
import { useCollectives } from '../src/context/CollectivesContext';
import { useRecords } from '../src/context/RecordsContext';
import { buildCollectiveWeightHistory, type WeightHistoryPoint } from '../src/utils/reports';
import type { RecordEntry } from '../src/entities/record';
import {
  COLLECTIVE_STATUSES,
  collectiveTermForSpecies,
  getCollectiveCount,
  type Collective,
  type CollectiveCountEvent,
  type CollectiveStatus,
} from '../src/entities/collective';
import { tokens } from '../src/theme/tokens';
import { formatDateForDisplay } from '../src/utils/dateFormat';
import { isHeadcountRecord, recordTypeHeadline } from '../src/utils/recordCollectives';
import { BouncyPressable } from '../src/components/BouncyPressable';

const SCREEN_WIDTH = Dimensions.get('window').width;

type TimelineEntry =
  | { kind: 'record'; id: string; date: string; record: RecordEntry }
  | { kind: 'count'; id: string; date: string; event: CollectiveCountEvent }
  | { kind: 'status'; id: string; date: string; status: CollectiveStatus };

const SPECIES_ICONS = new Map<string, AppIconName>(
  SPECIES_OPTIONS.map((item) => [item.label, item.icon]),
);

export default function ViewCollectiveScreen() {
  const router = useRouter();
  const { collectiveUid } = useLocalSearchParams<{ collectiveUid?: string }>();
  const {
    collectives,
    deleteCollective,
    setCollectiveStatusManually,
    removeCollectiveStatusChange,
  } = useCollectives();
  const { profile } = useAccount();
  const { records } = useRecords();

  const collective = useMemo(
    () => collectives.find((item) => item.uid === collectiveUid),
    [collectives, collectiveUid],
  );

  // Records belonging to this group, newest first — the same list the animal
  // timeline builds from.
  const collectiveRecords = useMemo(() => {
    if (!collective) {
      return [];
    }

    return records
      .filter((record) => record.collectiveUid === collective.uid)
      .sort((left, right) => right.date.localeCompare(left.date));
  }, [collective, records]);

  // One list, exactly as the animal page does it: records are the timeline,
  // with status changes merged in for display.
  //
  // Count events join them only when no record owns them — an Established
  // entry, or a correction typed straight into the group. A count event that
  // came from a record is already represented by that record, and showing both
  // would report the same change twice.
  const timeline = useMemo((): TimelineEntry[] => {
    if (!collective) {
      return [];
    }

    const fromRecords = collectiveRecords.map(
      (record): TimelineEntry => ({ kind: 'record', id: record.id, date: record.date, record }),
    );
    const fromCount = collective.countEvents
      .filter((event) => !event.recordId)
      .map((event): TimelineEntry => ({ kind: 'count', id: event.id, date: event.date, event }));
    // statusHistory is appended, so it runs oldest-first, and every change is
    // dated to the day — two on the same day tie, and a stable sort would keep
    // the older one ahead. Reversed here so the newest reads first among them,
    // and the pin below targets the latest by identity rather than by position,
    // which a date tie cannot get wrong.
    const statusHistory = collective.statusHistory ?? [];
    const latestStatusId = statusHistory[statusHistory.length - 1]?.id;
    const fromStatus = [...statusHistory].reverse().map(
      (change): TimelineEntry => ({
        kind: 'status',
        id: change.id,
        date: change.date,
        status: change.status,
      }),
    );

    // Newest first. Undated events sort last rather than being dropped — they
    // are still part of the history. On a date tie the status change wins the
    // top slot, matching the animal timeline.
    const sorted = [...fromRecords, ...fromCount, ...fromStatus].sort((a, b) => {
      const left = Date.parse(a.date);
      const right = Date.parse(b.date);

      if (Number.isNaN(left) && Number.isNaN(right)) return 0;
      if (Number.isNaN(left)) return 1;
      if (Number.isNaN(right)) return -1;
      if (left !== right) return right - left;
      if (a.kind === b.kind) return 0;

      return a.kind === 'status' ? -1 : 1;
    });

    // The change that set the current state leads the timeline, so the status
    // just picked from the dropdown is always the first thing read.
    const latestStatus = latestStatusId
      ? sorted.findIndex((entry) => entry.kind === 'status' && entry.id === latestStatusId)
      : -1;

    if (latestStatus > 0) {
      const [entry] = sorted.splice(latestStatus, 1);
      sorted.unshift(entry);
    }

    return sorted;
  }, [collective, collectiveRecords]);


  const term = collective ? collectiveTermForSpecies(collective.species) : 'group';
  const theme = collective ? getSpeciesThemeByLabel(collective.species) : null;
  const count = collective ? getCollectiveCount(collective) : 0;
  // Weight and purchase cost are no longer typed onto the group — they are
  // recorded as dated Weight and Purchase records, which is the only way a
  // figure that changes every week can stay true. Both are read back off those
  // records here, falling back to whatever an older group already had stored so
  // nothing entered before the change disappears from the summary.
  const latestWeight = useMemo(() => {
    const weighings = collectiveRecords
      .filter((record) => record.type === 'Weight' && record.weight?.trim())
      .sort((left, right) => right.date.localeCompare(left.date));

    const latest = weighings[0];

    if (latest?.weight) {
      return formatWeight(latest.weight, latest.weightUnit ?? 'kg');
    }

    return formatWeight(collective?.averageWeight ?? '', collective?.weightUnit ?? 'kg');
  }, [collective?.averageWeight, collective?.weightUnit, collectiveRecords]);

  const totalPurchaseSpend = useMemo(() => {
    const purchases = collectiveRecords.filter(
      (record) => record.type === 'Purchase' && record.purchasePrice?.trim(),
    );

    if (purchases.length === 0) {
      return collective?.cost?.trim() ?? '';
    }

    // A group topped up more than once has more than one price, so the honest
    // figure is the total of them rather than any single one.
    const total = purchases.reduce((sum, record) => {
      const value = Number.parseFloat(record.purchasePrice ?? '');
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);

    return total > 0 ? String(Math.round(total * 100) / 100) : '';
  }, [collective?.cost, collectiveRecords]);

  // A record that moves the head count owns a count event carrying its id.
  // Reading the delta from there rather than re-deriving it from the record's
  // own fields means the timeline can never disagree with the head count, and
  // it handles Headcount's signed correction without a special case.
  const recordDeltas = useMemo(() => {
    const deltas = new Map<string, number>();

    for (const event of collective?.countEvents ?? []) {
      if (event.recordId) {
        deltas.set(event.recordId, (deltas.get(event.recordId) ?? 0) + event.delta);
      }
    }

    return deltas;
  }, [collective?.countEvents]);

  const weightHistory = useMemo(
    () => (collective ? buildCollectiveWeightHistory(collective.uid, records) : []),
    [collective, records],
  );

  const primaryImageUri = collective?.imageUris?.[0]?.trim() || null;
  const [primaryImageFailed, setPrimaryImageFailed] = useState(false);
  const statusPillRef = useRef<View>(null);
  const [statusAnchor, setStatusAnchor] = useState<
    { x: number; y: number; width: number; height: number } | null
  >(null);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  const applyStatus = async (status: CollectiveStatus) => {
    if (!collective) {
      return;
    }

    setShowStatusPicker(false);
    const result = await setCollectiveStatusManually(collective.uid, status);

    if (!result.ok) {
      Alert.alert('Could not update', result.message);
    }
  };

  useEffect(() => {
    setPrimaryImageFailed(false);
  }, [collective?.uid, primaryImageUri]);

  // The detail screen always shows the photo when there is one — the card
  // preference only governs the list, where the species icon carries the
  // at-a-glance scanning.
  const showPrimaryImage = Boolean(primaryImageUri) && !primaryImageFailed;

  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // The dropdown is drawn in a Modal so it can escape the ScrollView's clipping,
  // which puts it in the window's coordinate space — so the three-dot button is
  // measured and the menu placed at those coordinates rather than anchored by
  // layout. Same approach as the animal timeline's menu.
  const [actionsAnchor, setActionsAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const moreRef = useRef<View | null>(null);

  // Removes the dated line only. The group keeps whatever status it has —
  // that is the dropdown's to change, not this button's.
  const handleRemoveStatusChange = async (changeId: string) => {
    if (!collective) {
      return;
    }

    const result = await removeCollectiveStatusChange(collective.uid, changeId);

    if (!result.ok) {
      Alert.alert('Could not remove', result.message);
    }
  };

  const openActionsMenu = () => {
    moreRef.current?.measureInWindow((x, y, width, height) => {
      setActionsAnchor({ x, y, width, height });
    });
    setShowActionsMenu(true);
  };

  const handleEditCollective = () => {
    if (!collective) {
      return;
    }

    setShowActionsMenu(false);
    router.push({ pathname: '/add-collective', params: { collectiveUid: collective.uid } });
  };

  // Deleted here rather than handed to the list screen the way an animal is:
  // collective cards have no exit-animation wrapper to hand it to, so this
  // follows the edit screen's own delete instead.
  const confirmDeleteCollective = async () => {
    if (!collective) {
      return;
    }

    setShowDeleteConfirm(false);
    const result = await deleteCollective(collective.uid);

    if (!result.ok) {
      Alert.alert('Could not delete', result.message);
      return;
    }

    router.replace('/(tabs)/animals');
  };

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
      collective.location.trim() ? `Location: ${collective.location.trim()}` : '',
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
                  icon: 'more-vertical',
                  accessibilityLabel: `${capitalize(term)} options`,
                  onPress: openActionsMenu,
                  size: 28,
                  anchorRef: moreRef,
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
                {showPrimaryImage ? (
                  <Image
                    accessibilityIgnoresInvertColors
                    resizeMode="cover"
                    source={{ uri: primaryImageUri ?? undefined }}
                    style={styles.summaryProfileImage}
                    onError={() => setPrimaryImageFailed(true)}
                  />
                ) : (
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
                )}
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
              <Pressable
                ref={statusPillRef}
                collapsable={false}
                accessibilityLabel={`Status: ${collective.status}. Change status`}
                accessibilityRole="button"
                onPress={() => {
                  statusPillRef.current?.measureInWindow((x, y, width, height) => {
                    setStatusAnchor({ x, y, width, height });
                  });
                  setShowStatusPicker(true);
                }}
                style={({ pressed }) => [styles.statusPill, pressed && styles.pressed]}
              >
                <View
                  style={[
                    styles.statusDot,
                    collective.status === 'Inactive' ? styles.statusClosed : styles.statusActive,
                  ]}
                />
                <Text style={styles.statusText}>{collective.status}</Text>
                <AppIcon name="chevron-down" size={14} color={tokens.colors.text} />
              </Pressable>
            </View>

            <View style={styles.summaryDetails}>
              <SummaryDetail always label="Species" value={collective.species} />
              <SummaryDetail label="Breed or type" value={collective.breed} />
              <SummaryDetail label="Latest weight" value={latestWeight} />
              <SummaryDetail label="Purchase spend" value={totalPurchaseSpend} />
              <SummaryDetail label="Supplier" value={collective.supplier} />
              <SummaryDetail label="Farm" value={collective.farm} />
              <SummaryDetail label="Location" value={collective.location} />
              <SummaryDetail
                label="Established"
                value={formatDateForDisplay(collective.startDate, profile.dateFormat)}
              />
              <SummaryDetail label="Purpose" value={collective.purpose} />
              <SummaryDetail label="Labels" value={collective.labels.join(', ')} />
            </View>

            <WeightHistorySection points={weightHistory} />

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
            <Text style={styles.emptyText}>Records and changes to this group will appear here.</Text>
          </View>
        ) : (
          <View style={styles.timelineList}>
            <Text style={styles.timelineListHeading}>
              Timeline · {timeline.length} {timeline.length === 1 ? 'Entry' : 'Entries'}
            </Text>
            {timeline.map((entry, index) => (
              <View key={entry.id} style={styles.timelineRow}>
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.9}
                  numberOfLines={1}
                  style={styles.recordDate}
                >
                  {formatDateForDisplay(entry.date, profile.dateFormat) || '—'}
                </Text>
                <View style={styles.railColumn}>
                  {index !== timeline.length - 1 ? <View style={styles.railLine} /> : null}
                  <View style={styles.railDot} />
                </View>
                {entry.kind === 'record' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${recordTypeHeadline(entry.record)} on ${formatDateForDisplay(entry.record.date, profile.dateFormat)}`}
                    onPress={() =>
                      router.push({ pathname: '/view-record', params: { recordId: entry.record.id } })
                    }
                    style={({ pressed }) => [styles.recordCard, pressed && styles.pressed]}
                  >
                    <View style={styles.recordCopy}>
                      <Text style={styles.recordTitle}>{recordTypeHeadline(entry.record)}</Text>
                      <Text style={styles.recordDetails}>
                        {[
                          // Headcount keeps a signed delta in affectedCount, so
                          // it reports the total it found rather than "-12".
                          isHeadcountRecord(entry.record.type)
                            ? `counted ${entry.record.newCount?.trim() || '0'}`
                            : entry.record.affectedCount?.trim()
                              ? `${entry.record.affectedCount.trim()} animals`
                              : '',
                          entry.record.details?.trim() ?? '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <View style={styles.recordTrailing}>
                      {recordDeltas.get(entry.record.id) ? (
                        <Text
                          style={[
                            styles.delta,
                            recordDeltas.get(entry.record.id)! < 0 ? styles.deltaDown : styles.deltaUp,
                          ]}
                        >
                          {formatDelta(recordDeltas.get(entry.record.id)!)}
                        </Text>
                      ) : null}
                      <AppIcon name="chevron-right-minimal" size={18} color="#171717" />
                    </View>
                  </Pressable>
                ) : entry.kind === 'status' ? (
                  <View style={[styles.recordCard, styles.statusCard]}>
                    <Text style={styles.statusCardText}>{`Marked ${entry.status}`}</Text>
                    <Pressable
                      accessibilityLabel={`Remove status change: marked ${entry.status}`}
                      accessibilityRole="button"
                      hitSlop={10}
                      onPress={() => void handleRemoveStatusChange(entry.id)}
                      style={({ pressed }) => [styles.statusCardRemove, pressed && styles.pressed]}
                    >
                      <AppIcon name="close" size={11} color={tokens.colors.text} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole={entry.event.recordId ? 'button' : undefined}
                    disabled={!entry.event.recordId}
                    onPress={
                      entry.event.recordId
                        ? () =>
                            router.push({
                              pathname: '/view-record',
                              params: { recordId: entry.event.recordId! },
                            })
                        : undefined
                    }
                    style={({ pressed }) => [styles.recordCard, pressed && styles.pressed]}
                  >
                    <View style={styles.recordCopy}>
                      <Text style={styles.recordTitle}>{entry.event.reason}</Text>
                      <Text style={styles.recordDetails}>{describeEvent(entry.event)}</Text>
                    </View>
                    <Text
                      style={[
                        styles.delta,
                        entry.event.delta < 0 ? styles.deltaDown : styles.deltaUp,
                      ]}
                    >
                      {formatDelta(entry.event.delta)}
                    </Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      <Modal
        animationType="none"
        transparent
        visible={showStatusPicker}
        onRequestClose={() => setShowStatusPicker(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setShowStatusPicker(false)}>
          <View
            style={[
              styles.menuCard,
              statusAnchor
                ? {
                    top: statusAnchor.y + statusAnchor.height + 6,
                    right: Math.max(12, SCREEN_WIDTH - (statusAnchor.x + statusAnchor.width)),
                  }
                : styles.menuFallback,
            ]}
          >
            {COLLECTIVE_STATUSES.map((status) => (
              <BouncyPressable
                key={status}
                accessibilityLabel={status}
                accessibilityRole="button"
                onPress={() => void applyStatus(status)}
                style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
              >
                <View
                  style={[
                    styles.statusDot,
                    status === 'Inactive' ? styles.statusClosed : styles.statusActive,
                  ]}
                />
                <Text style={styles.menuText}>{status}</Text>
                {collective?.status === status ? (
                  <AppIcon name="check" size={15} color={tokens.colors.accent} />
                ) : null}
              </BouncyPressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        animationType="none"
        transparent
        visible={showActionsMenu}
        onRequestClose={() => setShowActionsMenu(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setShowActionsMenu(false)}>
          <View
            style={[
              styles.menuCard,
              actionsAnchor
                ? {
                    top: actionsAnchor.y + actionsAnchor.height + 6,
                    right: Math.max(12, SCREEN_WIDTH - (actionsAnchor.x + actionsAnchor.width)),
                  }
                : styles.menuFallback,
            ]}
          >
            <BouncyPressable
              accessibilityLabel={`Share ${term}`}
              accessibilityRole="button"
              onPress={() => {
                setShowActionsMenu(false);
                void handleShare();
              }}
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            >
              <View style={styles.menuIcon}>
                <AppIcon name="share-outline" size={24} color={tokens.colors.text} />
              </View>
              <Text style={styles.menuText}>Share</Text>
            </BouncyPressable>
            <BouncyPressable
              accessibilityLabel={`Edit ${term}`}
              accessibilityRole="button"
              onPress={handleEditCollective}
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            >
              <View style={styles.menuIcon}>
                <AppIcon name="edit" size={24} color={tokens.colors.text} />
              </View>
              <Text style={styles.menuText}>Edit</Text>
            </BouncyPressable>
            <BouncyPressable
              accessibilityLabel={`Delete ${term}`}
              accessibilityRole="button"
              onPress={() => {
                setShowActionsMenu(false);
                setShowDeleteConfirm(true);
              }}
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            >
              <View style={styles.menuIcon}>
                <AppIcon name="trash" size={24} color={tokens.colors.danger} />
              </View>
              <Text style={[styles.menuText, styles.menuTextDanger]}>Delete</Text>
            </BouncyPressable>
          </View>
        </Pressable>
      </Modal>

      {/* No animation: confirming routes straight back to the list, and RN's
          Modal fade is a fixed ~300ms that plays over the top of that
          transition. Dismissing instantly hands the screen back immediately. */}
      <Modal
        animationType="none"
        transparent
        visible={showDeleteConfirm}
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <Pressable style={styles.centeredModalBackdrop} onPress={() => setShowDeleteConfirm(false)}>
          <Pressable style={styles.deleteConfirmCard} onPress={() => undefined}>
            <Text style={styles.deleteConfirmTitle}>{`Delete ${term}?`}</Text>
            <Text style={styles.deleteConfirmText}>
              {`This ${term} will be deleted. Are you sure?`}
            </Text>
            <Text style={styles.deleteConfirmText}>
              Its records are kept and stay in your Records list. This action cannot be undone.
            </Text>
            <View style={styles.deleteConfirmActions}>
              <BouncyPressable
                accessibilityLabel="Cancel delete"
                accessibilityRole="button"
                containerStyle={{ flex: 1 }}
                onPress={() => setShowDeleteConfirm(false)}
                style={({ pressed }) => [styles.deleteCancelButton, pressed && styles.pressed]}
              >
                <Text style={styles.deleteCancelButtonText}>Cancel</Text>
              </BouncyPressable>
              <BouncyPressable
                accessibilityLabel="Confirm delete"
                accessibilityRole="button"
                containerStyle={{ flex: 1 }}
                onPress={() => void confirmDeleteCollective()}
                style={({ pressed }) => [styles.deleteConfirmButton, pressed && styles.pressed]}
              >
                <Text style={styles.deleteConfirmButtonText}>Delete</Text>
              </BouncyPressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// Mirrors the animal timeline's Weight History block, including its 1/2/3+
// rule: a line only means something once there is genuine time-series data, so
// one reading shows as text and two show start/latest/change.
//
// The sample size is the one thing the animal version has no need of — a flock
// is weighed by sample, and an average off five birds is a weaker claim than
// one off fifty, so it is stated rather than left implied.
function WeightHistorySection({ points }: { points: WeightHistoryPoint[] }) {
  if (points.length === 0) {
    return null;
  }

  const latest = points[points.length - 1];

  if (points.length === 1) {
    return (
      <View style={styles.summaryNotes}>
        <Text style={styles.summaryLabel}>Weight History</Text>
        <Text style={styles.summaryNotesText}>{`Latest: ${formatWeightPoint(latest)}`}</Text>
      </View>
    );
  }

  const first = points[0];
  const change = latest.value - first.value;
  const sign = change > 0 ? '+' : '';

  return (
    <View style={styles.summaryNotes}>
      <Text style={styles.summaryLabel}>Weight History</Text>
      <Text style={styles.summaryNotesText}>
        {`Start: ${formatWeightPoint(first)} · Latest: ${formatWeightPoint(latest)} · Change: ${sign}${trimZeros(change)} ${latest.unit}`}
      </Text>
      {points.length >= 3 ? <WeightLineChart points={points} /> : null}
    </View>
  );
}

const WEIGHT_CHART_WIDTH = 300;
const WEIGHT_CHART_HEIGHT = 100;
const WEIGHT_CHART_PADDING = 10;

function WeightLineChart({ points }: { points: WeightHistoryPoint[] }) {
  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;
  const usableWidth = WEIGHT_CHART_WIDTH - WEIGHT_CHART_PADDING * 2;
  const usableHeight = WEIGHT_CHART_HEIGHT - WEIGHT_CHART_PADDING * 2;

  const coords = points.map((point, index) => ({
    x: WEIGHT_CHART_PADDING + (index / (points.length - 1)) * usableWidth,
    y: WEIGHT_CHART_HEIGHT - WEIGHT_CHART_PADDING - ((point.value - minValue) / valueRange) * usableHeight,
  }));

  return (
    <Svg
      width="100%"
      height={WEIGHT_CHART_HEIGHT}
      viewBox={`0 0 ${WEIGHT_CHART_WIDTH} ${WEIGHT_CHART_HEIGHT}`}
      style={styles.weightChart}
    >
      <Polyline
        points={coords.map((coord) => `${coord.x},${coord.y}`).join(' ')}
        fill="none"
        stroke={tokens.colors.accent}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {coords.map((coord, index) => (
        <Circle key={points[index].recordId} cx={coord.x} cy={coord.y} r={3} fill={tokens.colors.accent} />
      ))}
    </Svg>
  );
}

function formatWeightPoint(point: WeightHistoryPoint) {
  const base = `${trimZeros(point.value)} ${point.unit}`.trim();
  return point.sampleSize ? `${base} (${point.sampleSize} weighed)` : base;
}

function trimZeros(value: number) {
  return Number(value.toFixed(2)).toString();
}

function SummaryDetail({
  label,
  value,
  always = false,
}: {
  label: string;
  value: string;
  always?: boolean;
}) {
  // A view screen reports what is known; the edit form is where every possible
  // field lives, filled or not. An empty row here is a placeholder rather than
  // information, and enough of them push the timeline off the screen.
  if (!value.trim() && !always) {
    return null;
  }

  return (
    <View style={styles.summaryDetail}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value.trim() || '—'}</Text>
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
  pressed: { opacity: 0.85 },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  menuCard: {
    position: 'absolute',
    minWidth: 176,
    borderRadius: 16,
    backgroundColor: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 6,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  menuFallback: {
    top: 120,
    right: 16,
  },
  menuRow: {
    minHeight: 44,
    borderRadius: 11,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuRowPressed: {
    backgroundColor: tokens.colors.surfaceMuted,
  },
  menuText: {
    flex: 1,
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  menuIcon: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextDanger: {
    color: tokens.colors.danger,
  },
  centeredModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.46)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  deleteConfirmCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 26,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  deleteConfirmTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  deleteConfirmText: {
    marginTop: 8,
    color: tokens.colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    textAlign: 'center',
  },
  deleteConfirmActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  deleteCancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#E5E0E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteCancelButtonText: { color: '#544F49', fontSize: 15, fontWeight: '700' },
  deleteConfirmButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
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
  // The status pill is taken out of the row's flow and pinned to the top-right
  // corner. In flow it reserved its width for the full height of the row, so
  // the id and name — which sit at the bottom, level with the picture — wrapped
  // at the pill's left edge against space that looked empty.
  summaryHeader: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  // Beside the picture but bottom-aligned, so the id and name sit off its
  // south-east corner rather than level with its top — matching View Animal.
  summaryHeaderMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
  summaryIdentity: { flex: 1, gap: 3 },
  summarySpeciesIconBadge: {
    width: 116,
    height: 116,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryProfileImage: {
    width: 116,
    height: 116,
    borderRadius: 28,
    backgroundColor: tokens.colors.surfaceMuted,
  },
  summaryId: { color: tokens.colors.text, fontSize: 19, fontWeight: '700' },
  summaryName: { color: tokens.colors.textSoft, fontSize: 15, fontWeight: '500' },
  summaryMeta: { color: tokens.colors.text, fontSize: 13, fontWeight: '500' },
  statusPill: {
    position: 'absolute',
    top: 0,
    right: 0,
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
  weightChart: { marginTop: 4 },
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
  // Matching the animal timeline's status line exactly: same muted ground, no
  // shadow, shorter than a record card because it carries one sentence.
  statusCard: {
    backgroundColor: tokens.colors.surfaceMuted,
    shadowOpacity: 0,
    elevation: 0,
    minHeight: 56,
  },
  // Sits just inside the bubble's top-right corner, the same placement the
  // photo remove button uses. White on the muted card so it reads as a control
  // laid on top rather than part of the line.
  statusCardRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  statusCardText: {
    color: tokens.colors.textSoft,
    fontSize: 14,
    fontWeight: '600',
  },
  recordCard: {
    flex: 1,
    backgroundColor: tokens.colors.surface,
    borderRadius: 18,
    minHeight: 84,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#DDD5D3',
    shadowColor: '#3B2B28',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  recordCopy: { flex: 1, gap: 4 },
  recordTitle: { color: tokens.colors.text, fontSize: 16, fontWeight: '700' },
  recordDetails: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '500',
  },
  // The delta sits before the chevron, so a record that moves the count reads
  // the same way an Established or manual correction does.
  recordTrailing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  delta: { fontSize: 17, fontWeight: '700' },
  deltaUp: { color: '#86A43D' },
  deltaDown: { color: '#B64949' },
});
