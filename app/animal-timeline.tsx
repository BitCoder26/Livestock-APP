import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Image, Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Text } from '../src/theme/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import Svg, { Circle, Polyline } from 'react-native-svg';

import { AppIcon, type AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { getSpeciesThemeByTone } from '../src/constants/speciesTheme';
import { useAccount } from '../src/context/AccountContext';
import { useAnimals } from '../src/context/AnimalsContext';
import { useRecords } from '../src/context/RecordsContext';
import { type FarmEntity, type LocationEntity, useSetup } from '../src/context/SetupContext';
import { type AnimalStatus, type AnimalTone } from '../src/entities/animal';
import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { BouncyPressable } from '../src/components/BouncyPressable';
import type { RecordEntry } from '../src/entities/record';
import { tokens } from '../src/theme/tokens';
import { formatDateForDisplay, parseStoredDate } from '../src/utils/dateFormat';
import { recordTypeHeadline } from '../src/utils/recordCollectives';
import { resolveRecordAnimalUids } from '../src/utils/recordAnimals';
import { abbreviateAgeLabel, getAnimalSexIcon } from '../src/utils/animalDisplay';

const SCREEN_WIDTH = Dimensions.get('window').width;
import {
  resolveAnimalFarmName,
  resolveAnimalLabelNames,
  resolveAnimalLocationName,
  resolveMovementSummary,
} from '../src/utils/recordLocations';
import { buildWeightHistory, type WeightHistoryPoint } from '../src/utils/reports';

export default function AnimalTimelineScreen() {
  const router = useRouter();
  const { animalUid, animalId } = useLocalSearchParams<{ animalUid?: string; animalId?: string }>();
  const { profile } = useAccount();
  const { animals, setAnimalStatusManually, removeAnimalStatusChange } = useAnimals();
  const { records } = useRecords();
  const { farmEntities, locationEntities, labelEntities } = useSetup();

  const animal = useMemo(
    () =>
      animalUid
        ? animals.find((entry) => entry.uid === animalUid) ?? null
        : animalId
          ? animals.find((entry) => entry.id === animalId) ?? null
          : null,
    [animalId, animalUid, animals],
  );
  // Resolved live via uid rather than trusting animal.farm/location directly,
  // so a farm/location rename in Setup shows up here immediately.
  const animalFarmName = animal ? resolveAnimalFarmName(animal, farmEntities) : '';
  const animalLocationName = animal ? resolveAnimalLocationName(animal, locationEntities) : '';
  const animalLabelNames = animal ? resolveAnimalLabelNames(animal, labelEntities) : [];

  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // The dropdown is drawn in a Modal so it can escape the ScrollView's clipping,
  // which puts it in the window's coordinate space — so the pill is measured and
  // the menu placed at those coordinates rather than anchored by layout.
  const [pillAnchor, setPillAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const pillRef = useRef<View | null>(null);
  // Same window-coordinate anchoring as the status dropdown, measured off the
  // top bar's three-dot button instead of the status pill.
  const [actionsAnchor, setActionsAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const moreRef = useRef<View | null>(null);

  const timelineRecords = useMemo(() => {
    if (!animal) {
      return [];
    }

    return records
      .filter((record) => resolveRecordAnimalUids(record, animals).includes(animal.uid))
      .sort((left, right) => getRecordTimestamp(right.date) - getRecordTimestamp(left.date));
  }, [animal, animals, records]);

  // Status changes are merged in for display only — they live on the animal,
  // not in Records, which logs husbandry events rather than bookkeeping.
  const timelineEntries = useMemo(() => {
    const fromRecords = timelineRecords.map((record) => ({
      kind: 'record' as const,
      id: record.id,
      date: record.date,
      record,
    }));

    // statusHistory is appended, so it runs oldest-first, and every change is
    // dated to the day — two on the same day tie, and a stable sort would keep
    // the older one ahead. Reversed here so the newest reads first among them,
    // and the pin below targets the latest by identity rather than by position,
    // which a date tie cannot get wrong.
    const statusHistory = animal?.statusHistory ?? [];
    const latestStatusId = statusHistory[statusHistory.length - 1]?.id;
    const fromStatus = [...statusHistory].reverse().map((change) => ({
      kind: 'status' as const,
      id: change.id,
      date: change.date,
      status: change.status,
    }));

    // Newest first, and on a date tie the status change wins the top slot —
    // a status set today should read above the day's records, not under them.
    const sorted = [...fromRecords, ...fromStatus].sort((left, right) => {
      const byDate = getRecordTimestamp(right.date) - getRecordTimestamp(left.date);

      if (byDate !== 0) {
        return byDate;
      }

      if (left.kind === right.kind) {
        return 0;
      }

      return left.kind === 'status' ? -1 : 1;
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
  }, [animal?.statusHistory, timelineRecords]);

  const weightHistory = useMemo(
    () => (animal ? buildWeightHistory(animal, records) : []),
    [animal, records],
  );

  const primaryImageUri = animal?.imageUris?.[0] ?? null;
  const galleryImageUris = animal?.imageUris?.slice(1) ?? [];
  const [primaryImageFailed, setPrimaryImageFailed] = useState(false);

  useEffect(() => {
    setPrimaryImageFailed(false);
  }, [primaryImageUri, animal?.uid]);

  const showPrimaryImage = Boolean(primaryImageUri) && !primaryImageFailed;
  const speciesTheme = animal ? getSpeciesThemeByTone(animal.tone) : null;

  const applyStatus = async (status: AnimalStatus) => {
    if (!animal) {
      return;
    }

    setShowStatusPicker(false);
    const result = await setAnimalStatusManually(animal.uid, status);

    if (!result.ok) {
      Alert.alert('Could not update', 'The status change could not be saved. Please try again.');
    }
  };

  // Removes the dated line only. The animal keeps whatever status it has —
  // that is the dropdown's to change, not this button's.
  const handleRemoveStatusChange = async (changeId: string) => {
    if (!animal) {
      return;
    }

    const result = await removeAnimalStatusChange(animal.uid, changeId);

    if (!result.ok) {
      Alert.alert('Could not remove', 'That status change could not be removed. Please try again.');
    }
  };

  const openActionsMenu = () => {
    moreRef.current?.measureInWindow((x, y, width, height) => {
      setActionsAnchor({ x, y, width, height });
    });
    setShowActionsMenu(true);
  };

  const handleEditAnimal = () => {
    if (!animal) {
      return;
    }

    setShowActionsMenu(false);
    router.push({ pathname: '/add-animal', params: { animalUid: animal.uid } });
  };

  const confirmDeleteAnimal = () => {
    if (!animal) {
      return;
    }

    setShowDeleteConfirm(false);
    router.replace({
      pathname: '/(tabs)/animals',
      params: { deletingAnimalUid: animal.uid },
    });
  };

  const handleShareAnimal = async () => {
    if (!animal) {
      Alert.alert('Animal not found', 'There is no animal to share right now.');
      return;
    }

    const shareSections = [
      animal.name.trim() || 'Unnamed animal',
      `ID: ${animal.id}`,
      animal.species.trim() ? `Species: ${animal.species.trim()}` : '',
      animal.breed.trim() ? `Breed: ${animal.breed.trim()}` : '',
      animal.ageLabel.trim() ? `Age: ${animal.ageLabel.trim()}` : '',
      animal.weight.trim() ? `Weight: ${formatAnimalWeight(animal.weight, animal.weightUnit)}` : '',
      animalFarmName ? `Farm: ${animalFarmName}` : '',
      animalLocationName ? `Location: ${animalLocationName}` : '',
      animalLabelNames.length > 0 ? `Labels: ${animalLabelNames.join(', ')}` : '',
      animal.source.trim() ? `Source: ${animal.source.trim()}` : '',
      animal.farmEntryDate.trim() ? `Farm entry date: ${formatDateForDisplay(animal.farmEntryDate, profile.dateFormat)}` : '',
      `Status: ${animal.status}`,
      animal.notes.trim() ? `Notes: ${animal.notes.trim()}` : '',
      `Timeline records: ${timelineRecords.length}`,
    ].filter(Boolean);

    try {
      await Share.share({
        title: animal.name.trim() || animal.id,
        message: shareSections.join('\n'),
      });
    } catch {
      Alert.alert('Share unavailable', 'Unable to open the share sheet right now.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="View Animal"
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
        actions={
          animal
            ? [
                {
                  icon: 'more-vertical',
                  accessibilityLabel: 'Animal options',
                  onPress: openActionsMenu,
                  size: 28,
                  anchorRef: moreRef,
                },
              ]
            : []
        }
      />
      <ScrollView contentContainerStyle={[styles.content, !animal || timelineRecords.length === 0 ? styles.contentEmpty : undefined]} showsVerticalScrollIndicator={false}>
        {animal ? (
          <View style={styles.summarySection}>
            <View style={styles.summaryHeader}>
              <View style={styles.summaryHeaderMain}>
                {showPrimaryImage ? (
                  <Image
                    source={{ uri: primaryImageUri ?? undefined }}
                    style={styles.summaryProfileImage}
                    onError={() => setPrimaryImageFailed(true)}
                  />
                ) : (
                  <View style={styles.summaryProfileFallback}>
                    <View
                      style={[
                        styles.summarySpeciesIconBadge,
                        { backgroundColor: speciesTheme?.chipBackground ?? tokens.colors.surfaceMuted },
                      ]}
                    >
                      <AppIcon
                        name={getSpeciesIconName(animal.species, animal.tone)}
                        size={56}
                        color={speciesTheme?.icon ?? tokens.colors.text}
                        opacity={1}
                      />
                    </View>
                  </View>
                )}
                <View style={styles.summaryIdentity}>
                  <Text style={styles.summaryId}>{animal.id}</Text>
                  <Text style={styles.summaryName}>{animal.name.trim() || 'Unnamed animal'}</Text>
                </View>
              </View>
              <Pressable
                ref={pillRef}
                collapsable={false}
                accessibilityLabel={`Status: ${animal.status}. Change status`}
                accessibilityRole="button"
                onPress={() => {
                  pillRef.current?.measureInWindow((x, y, width, height) => {
                    setPillAnchor({ x, y, width, height });
                  });
                  setShowStatusPicker(true);
                }}
                style={({ pressed }) => [styles.statusPill, pressed && styles.cardPressed]}
              >
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
                <AppIcon name="chevron-down" size={14} color={tokens.colors.text} />
              </Pressable>
            </View>

            {/* Sex, age and weight are the three the eye goes to first, so they
                sit as cards above the grid and stay out of it — the same value
                twice on one screen reads as a bug. Breed stays in the grid: it
                is free text and would wrap or truncate in a box. */}
            <View style={styles.statCards}>
              <StatCard
                label="Sex"
                value={capitalize(animal.sex)}
                icon={animal.sex ? getAnimalSexIcon(animal.sex) : undefined}
              />
              <StatCard label="Age" value={abbreviateAgeLabel(animal.ageLabel)} />
              <StatCard label="Weight" value={formatAnimalWeight(animal.weight, animal.weightUnit)} />
            </View>

            <View style={styles.summaryDetails}>
              <SummaryDetail label="EID" value={animal.eid} />
              <SummaryDetail always label="Species" value={animal.species} />
              <SummaryDetail label="Breed" value={animal.breed} />
              <SummaryDetail label="Date of birth" value={formatDateForDisplay(animal.dateOfBirth, profile.dateFormat)} />
              <SummaryDetail label="Farm" value={animalFarmName} />
              <SummaryDetail label="Location" value={animalLocationName} />
              <SummaryDetail label="Labels" value={animalLabelNames.join(", ")} />
              <SummaryDetail label="Source" value={animal.source} />
              <SummaryDetail
                label="Farm entry date"
                value={formatDateForDisplay(animal.farmEntryDate, profile.dateFormat)}
              />
            </View>

            {animal.notes.trim() ? (
              <View style={styles.summaryNotes}>
                <Text style={styles.summaryLabel}>Notes</Text>
                <Text style={styles.summaryNotesText}>{animal.notes.trim()}</Text>
              </View>
            ) : null}

            {galleryImageUris.length ? (
              <View style={styles.summaryImages}>
                <Text style={styles.summaryLabel}>Images</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryImageRow}>
                  {galleryImageUris.map((uri) => (
                    <Image key={uri} source={{ uri }} style={styles.summaryImage} />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <WeightHistorySection points={weightHistory} />
          </View>
        ) : null}

        {!animal ? (
          <View style={styles.emptyState}>
            <AppIcon name="animal_" size={80} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>Animal not found</Text>
            <Text style={styles.emptyText}>Return and open an animal card again.</Text>
          </View>
        ) : timelineEntries.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="records_" size={80} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>No timeline yet</Text>
            <Text style={styles.emptyText}>Records for this animal will appear here.</Text>
          </View>
        ) : (
          <View style={styles.timelineList}>
            <Text style={styles.timelineListHeading}>
              Timeline · {timelineEntries.length} {timelineEntries.length === 1 ? 'Entry' : 'Entries'}
            </Text>
            {timelineEntries.map((entry, index) => {
              const isLast = index === timelineEntries.length - 1;

              if (entry.kind === 'status') {
                return (
                  <View key={entry.id} style={styles.timelineRow}>
                    <Text
                      adjustsFontSizeToFit
                      minimumFontScale={0.9}
                      numberOfLines={1}
                      style={styles.recordDate}
                    >
                      {formatDateForDisplay(entry.date, profile.dateFormat)}
                    </Text>
                    <View style={styles.railColumn}>
                      {!isLast ? <View style={styles.railLine} /> : null}
                      <View style={[styles.railDot, styles.railDotStatus]} />
                    </View>
                    <View style={[styles.recordCard, styles.statusCard]}>
                      <Text style={styles.statusCardText}>{`Marked ${entry.status}`}</Text>
                      <Pressable
                        accessibilityLabel={`Remove status change: marked ${entry.status}`}
                        accessibilityRole="button"
                        hitSlop={10}
                        onPress={() => void handleRemoveStatusChange(entry.id)}
                        style={({ pressed }) => [styles.statusCardRemove, pressed && styles.cardPressed]}
                      >
                        <AppIcon name="close" size={11} color={tokens.colors.text} />
                      </Pressable>
                    </View>
                  </View>
                );
              }

              const record = entry.record;

              const details = getTimelineDetails(record, farmEntities, locationEntities);

              return (
                <View key={entry.id} style={styles.timelineRow}>
                  <Text
                    adjustsFontSizeToFit
                    minimumFontScale={0.9}
                    numberOfLines={1}
                    style={styles.recordDate}
                  >
                    {formatDateForDisplay(record.date, profile.dateFormat)}
                  </Text>
                  <View style={styles.railColumn}>
                    {!isLast ? <View style={styles.railLine} /> : null}
                    <View style={styles.railDot} />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${recordTypeHeadline(record)} on ${formatDateForDisplay(record.date, profile.dateFormat)}`}
                    onPress={() => router.push({ pathname: '/view-record', params: { recordId: record.id } })}
                    style={({ pressed }) => [styles.recordCard, pressed && styles.cardPressed]}
                  >
                    <View style={styles.recordCopy}>
                      <Text style={styles.recordTitle}>{recordTypeHeadline(record)}</Text>
                      <Text style={styles.recordDetails}>{details}</Text>
                    </View>
                    <AppIcon name="chevron-right-minimal" size={18} color="#171717" />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

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
              accessibilityLabel="Share animal"
              accessibilityRole="button"
              onPress={() => {
                setShowActionsMenu(false);
                void handleShareAnimal();
              }}
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            >
              <View style={styles.menuIcon}>
                <AppIcon name="share-outline" size={24} color={tokens.colors.text} />
              </View>
              <Text style={styles.menuText}>Share</Text>
            </BouncyPressable>
            <BouncyPressable
              accessibilityLabel="Edit animal"
              accessibilityRole="button"
              onPress={handleEditAnimal}
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            >
              <View style={styles.menuIcon}>
                <AppIcon name="edit" size={24} color={tokens.colors.text} />
              </View>
              <Text style={styles.menuText}>Edit</Text>
            </BouncyPressable>
            <BouncyPressable
              accessibilityLabel="Delete animal"
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
            <Text style={styles.deleteConfirmTitle}>Delete animal?</Text>
            <Text style={styles.deleteConfirmText}>This animal will be deleted. Are you sure?</Text>
            <Text style={styles.deleteConfirmText}>
              Its records are kept and stay in your Records list. This action cannot be undone.
            </Text>
            <View style={styles.deleteConfirmActions}>
              <BouncyPressable
                accessibilityLabel="Cancel delete"
                accessibilityRole="button"
                containerStyle={{ flex: 1 }}
                onPress={() => setShowDeleteConfirm(false)}
                style={({ pressed }) => [styles.deleteCancelButton, pressed && styles.cardPressed]}
              >
                <Text style={styles.deleteCancelButtonText}>Cancel</Text>
              </BouncyPressable>
              <BouncyPressable
                accessibilityLabel="Confirm delete animal"
                accessibilityRole="button"
                containerStyle={{ flex: 1 }}
                onPress={confirmDeleteAnimal}
                style={({ pressed }) => [styles.deleteConfirmButton, pressed && styles.cardPressed]}
              >
                <Text style={styles.deleteConfirmButtonText}>Delete</Text>
              </BouncyPressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
              pillAnchor
                ? {
                    top: pillAnchor.y + pillAnchor.height + 6,
                    right: Math.max(12, SCREEN_WIDTH - (pillAnchor.x + pillAnchor.width)),
                  }
                : styles.menuFallback,
            ]}
          >
            {(['Active', 'Sold', 'Deceased'] as AnimalStatus[]).map((status) => (
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
                    status === 'Sold'
                      ? styles.statusSold
                      : status === 'Deceased'
                        ? styles.statusDeceased
                        : styles.statusActive,
                  ]}
                />
                <Text style={styles.menuText}>{status}</Text>
                {animal?.status === status ? (
                  <AppIcon name="check" size={15} color={tokens.colors.accent} />
                ) : null}
              </BouncyPressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  /** Drawn in place of the value — the sex card reads as a glyph, not a word. */
  icon?: AppIconName;
}) {
  return (
    <View style={styles.statCard}>
      <Text numberOfLines={1} style={styles.summaryLabel}>
        {label}
      </Text>
      {icon ? (
        <View accessibilityLabel={value}>
          <AppIcon name={icon} size={20} color={tokens.colors.text} />
        </View>
      ) : (
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          numberOfLines={1}
          style={styles.statCardValue}
        >
          {value.trim() || '—'}
        </Text>
      )}
    </View>
  );
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
      <Text style={styles.summaryValue}>{value.trim() || '\u2014'}</Text>
    </View>
  );
}

function getRecordTimestamp(value: string) {
  return parseStoredDate(value)?.getTime() ?? 0;
}

function getTimelineDetails(record: RecordEntry, farms: FarmEntity[], locations: LocationEntity[]) {
  // Movement's location summary is resolved fresh from the current
  // farm/location names rather than the frozen title text, so a rename
  // shows up here too.
  const titleDetails =
    record.type === 'Movement' ? resolveMovementSummary(record, farms, locations) : stripRecordType(record.title, record.type);
  const detailSections = [titleDetails, record.details.trim()].filter(Boolean);

  if (detailSections.length > 0) {
    return Array.from(new Set(detailSections)).join('\n');
  }

  const fallbackDetails = [
    record.weight?.trim() ? `${record.weight.trim()} ${record.weightUnit ?? ''}`.trim() : '',
    record.medicine?.trim() ?? '',
  ].filter(Boolean);

  return fallbackDetails.join(' · ') || `${record.species} record`;
}

function stripRecordType(title: string, type: string) {
  const trimmedTitle = title.trim();
  const prefix = `${type.trim()}:`;
  return trimmedTitle.startsWith(prefix) ? trimmedTitle.slice(prefix.length).trim() : trimmedTitle;
}

function formatAnimalWeight(weight: string, unit: string) {
  return weight.trim() ? `${weight.trim()} ${unit}`.trim() : '';
}

// Optional Weight History block: only rendered once the animal has at least
// one Weight record. Follows the 1/2/3+ display rules from the Reports V1
// scope — a line chart only makes sense once there's genuine time-series
// data, so 1-2 points show as plain text instead.
function WeightHistorySection({ points }: { points: WeightHistoryPoint[] }) {
  if (points.length === 0) {
    return null;
  }

  const latest = points[points.length - 1];

  if (points.length === 1) {
    return (
      <View style={styles.summaryNotes}>
        <Text style={styles.summaryLabel}>Weight History</Text>
        <Text style={styles.summaryNotesText}>Latest: {formatWeightValue(latest)}</Text>
      </View>
    );
  }

  const first = points[0];
  const change = latest.value - first.value;

  return (
    <View style={styles.summaryNotes}>
      <Text style={styles.summaryLabel}>Weight History</Text>
      <Text style={styles.summaryNotesText}>
        Start: {formatWeightValue(first)} · Latest: {formatWeightValue(latest)} · Change:{' '}
        {formatSignedWeightChange(change, latest.unit)}
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

function formatWeightValue(point: WeightHistoryPoint) {
  return `${trimTrailingZeros(point.value)} ${point.unit}`.trim();
}

function formatSignedWeightChange(change: number, unit: string) {
  const sign = change > 0 ? '+' : '';
  return `${sign}${trimTrailingZeros(change)} ${unit}`.trim();
}

function trimTrailingZeros(value: number) {
  return Number(value.toFixed(2)).toString();
}

function capitalize(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : '';
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

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 40,
    gap: 16,
  },
  contentEmpty: {
    flexGrow: 1,
  },
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
  // Beside the picture but bottom-aligned, so the id and name sit off its
  // south-east corner rather than level with its top.
  summaryHeaderMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 14,
  },
  summaryIdentity: {
    flex: 1,
    gap: 3,
  },
  summaryProfileImage: {
    width: 116,
    height: 116,
    borderRadius: 28,
    backgroundColor: tokens.colors.surfaceMuted,
  },
  summaryProfileFallback: {
    width: 116,
    height: 116,
    borderRadius: 28,
    backgroundColor: tokens.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summarySpeciesIconBadge: {
    width: 116,
    height: 116,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryId: {
    color: tokens.colors.text,
    fontSize: 19,
    fontWeight: '700',
  },
  summaryName: {
    color: tokens.colors.textSoft,
    fontSize: 15,
    fontWeight: '500',
  },
  summaryMeta: {
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  statusPill: {
    minHeight: 32,
    borderRadius: 16,
    backgroundColor: tokens.colors.surfaceMuted,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusActive: {
    backgroundColor: '#86A43D',
  },
  statusSold: {
    backgroundColor: tokens.colors.upgradeGold,
  },
  statusDeceased: {
    backgroundColor: '#C4433B',
  },
  statusText: {
    color: tokens.colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  // Left-justified rather than stretched: three fixed squares sitting at the
  // start of the row, so the block reads as a set of badges instead of a bar
  // divided into thirds.
  statCards: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 10,
  },
  statCard: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: tokens.colors.surfaceMuted,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  statCardValue: {
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  summaryDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 18,
    rowGap: 15,
  },
  summaryDetail: {
    width: '47%',
    gap: 3,
  },
  summaryLabel: {
    color: tokens.colors.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  summaryNotes: {
    gap: 5,
  },
  summaryNotesText: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  weightChart: {
    marginTop: 6,
  },
  summaryImages: {
    gap: 8,
  },
  summaryImageRow: {
    gap: 10,
  },
  summaryImage: {
    width: 112,
    height: 84,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceMuted,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 8,
  },
  emptyTitle: {
    marginTop: 12,
    color: '#E5E0E7',
    fontSize: 29,
    fontWeight: '700',
  },
  emptyText: {
    color: '#E5E0E7',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  timelineList: {
    gap: 14,
  },
  timelineListHeading: {
    color: tokens.colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginLeft: 4,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  recordDate: {
    width: 92,
    paddingTop: 14,
    color: tokens.colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  railColumn: {
    width: 18,
    alignItems: 'center',
    position: 'relative',
  },
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
  cardPressed: {
    opacity: 0.92,
  },
  // Bookkeeping reads quieter than a husbandry event: muted fill, no shadow,
  // no chevron, hollow rail dot.
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
  railDotStatus: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: tokens.colors.accent,
  },
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
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
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
    shadowOffset: { width: 0, height: 10 },
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
  deleteCancelButtonText: {
    color: '#544F49',
    fontSize: 15,
    fontWeight: '700',
  },
  deleteConfirmButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  recordCopy: {
    flex: 1,
    gap: 2,
    paddingRight: 10,
  },
  recordTitle: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  recordDetails: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '500',
  },
});
