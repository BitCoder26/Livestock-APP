import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Svg, { Circle, Polyline } from 'react-native-svg';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { getSpeciesThemeByTone } from '../src/constants/speciesTheme';
import { useAccount } from '../src/context/AccountContext';
import { useAnimals } from '../src/context/AnimalsContext';
import { useRecords } from '../src/context/RecordsContext';
import { type FarmEntity, type PaddockEntity, useSetup } from '../src/context/SetupContext';
import {
  ANIMAL_STATUS_REASONS,
  type AnimalStatus,
  type AnimalStatusChange,
  type AnimalStatusReason,
  type AnimalTone,
} from '../src/entities/animal';
import { AnimatedPopupCard } from '../src/components/AnimatedPopupCard';
import { BouncyPressable } from '../src/components/BouncyPressable';
import type { RecordEntry } from '../src/entities/record';
import { tokens } from '../src/theme/tokens';
import { formatDateForDisplay, parseStoredDate } from '../src/utils/dateFormat';
import { resolveRecordAnimalUids } from '../src/utils/recordAnimals';
import {
  resolveAnimalFarmName,
  resolveAnimalGroupName,
  resolveAnimalPaddockName,
  resolveMovementSummary,
} from '../src/utils/recordLocations';
import { buildWeightHistory, type WeightHistoryPoint } from '../src/utils/reports';

export default function AnimalTimelineScreen() {
  const router = useRouter();
  const { animalUid, animalId } = useLocalSearchParams<{ animalUid?: string; animalId?: string }>();
  const { profile } = useAccount();
  const { animals, setAnimalStatusManually } = useAnimals();
  const { records } = useRecords();
  const { farmEntities, paddockEntities, groupEntities } = useSetup();

  const animal = useMemo(
    () =>
      animalUid
        ? animals.find((entry) => entry.uid === animalUid) ?? null
        : animalId
          ? animals.find((entry) => entry.id === animalId) ?? null
          : null,
    [animalId, animalUid, animals],
  );
  // Resolved live via uid rather than trusting animal.farm/paddock directly,
  // so a farm/paddock rename in Setup shows up here immediately.
  const animalFarmName = animal ? resolveAnimalFarmName(animal, farmEntities) : '';
  const animalPaddockName = animal ? resolveAnimalPaddockName(animal, paddockEntities) : '';
  const animalGroupName = animal ? resolveAnimalGroupName(animal, groupEntities) : '';

  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<AnimalStatus | null>(null);

  const timelineRecords = useMemo(() => {
    if (!animal) {
      return [];
    }

    return records
      .filter((record) => resolveRecordAnimalUids(record, animals).includes(animal.uid))
      .sort((left, right) => getRecordTimestamp(right.date) - getRecordTimestamp(left.date));
  }, [animal, animals, records]);

  // Status changes live on the animal rather than in Records — the Records tab
  // logs what happened to the animal, not corrections to the bookkeeping, and a
  // fix-up after a bulk import would otherwise consume the free record
  // allowance. They are merged in here purely for display.
  const timelineEntries = useMemo(() => {
    const recordEntries = timelineRecords.map((record) => ({
      kind: 'record' as const,
      id: record.id,
      date: record.date,
      record,
    }));

    const statusEntries = (animal?.statusHistory ?? []).map((change) => ({
      kind: 'status' as const,
      id: change.id,
      date: change.date,
      change,
    }));

    return [...recordEntries, ...statusEntries].sort(
      (left, right) => getRecordTimestamp(right.date) - getRecordTimestamp(left.date),
    );
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

  const applyStatus = async (status: AnimalStatus, reason: AnimalStatusReason | '') => {
    if (!animal) {
      return;
    }

    setShowStatusPicker(false);
    setPendingStatus(null);

    const result = await setAnimalStatusManually(animal.uid, {
      date: new Date().toISOString().slice(0, 10),
      status,
      reason,
      notes: '',
    });

    if (!result.ok) {
      Alert.alert('Could not update', 'The status change could not be saved. Please try again.');
      return;
    }

    // Sold and Died are real farm events with a buyer, a price or a cause. The
    // status alone loses all of that, so offer the record that keeps it —
    // dismissible, since someone tidying up imported history wants neither.
    if (reason === 'Sold' || reason === 'Died') {
      Alert.alert(
        `Set to ${status}`,
        reason === 'Sold'
          ? 'Add a Sale record to log the buyer and price?'
          : 'Add a Death record to log the cause?',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Add record',
            onPress: () =>
              router.push({
                pathname: '/add-record',
                params: { animalUid: animal.uid, type: reason === 'Sold' ? 'Sale' : 'Death' },
              }),
          },
        ],
      );
    }
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
      animalPaddockName ? `Paddock: ${animalPaddockName}` : '',
      animalGroupName ? `Group: ${animalGroupName}` : '',
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
                  icon: 'share-outline',
                  accessibilityLabel: 'Share',
                  onPress: handleShareAnimal,
                  size: 22,
                },
                {
                  icon: 'edit',
                  accessibilityLabel: 'Edit animal',
                  onPress: () =>
                    router.push({
                      pathname: '/add-animal',
                      params: { animalUid: animal.uid },
                    }),
                  size: 24,
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
                  <Text style={styles.summaryMeta}>{capitalize(animal.sex) || 'Sex not set'}</Text>
                </View>
              </View>
              <Pressable
                accessibilityLabel={`Status: ${animal.status}. Change status`}
                accessibilityRole="button"
                onPress={() => setShowStatusPicker(true)}
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

            <View style={styles.summaryDetails}>
              <SummaryDetail label="Species" value={animal.species} />
              <SummaryDetail label="Breed" value={animal.breed} />
              <SummaryDetail label="Weight" value={formatAnimalWeight(animal.weight, animal.weightUnit)} />
              <SummaryDetail label="Age" value={animal.ageLabel} />
              <SummaryDetail label="Date of birth" value={formatDateForDisplay(animal.dateOfBirth, profile.dateFormat)} />
              <SummaryDetail label="Farm" value={animalFarmName} />
              <SummaryDetail label="Paddock" value={animalPaddockName} />
              <SummaryDetail label="Group" value={animalGroupName} />
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
                      <View style={styles.recordCopy}>
                        <Text style={styles.recordTitle}>
                          {`Status changed to ${entry.change.status}`}
                        </Text>
                        <Text style={styles.recordDetails}>
                          {describeStatusChange(entry.change)}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }

              const record = entry.record;
              const details = getTimelineDetails(record, farmEntities, paddockEntities);

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
                    accessibilityLabel={`${record.type} on ${formatDateForDisplay(record.date, profile.dateFormat)}`}
                    onPress={() => router.push({ pathname: '/view-record', params: { recordId: record.id } })}
                    style={({ pressed }) => [styles.recordCard, pressed && styles.cardPressed]}
                  >
                    <View style={styles.recordCopy}>
                      <Text style={styles.recordTitle}>{record.type}</Text>
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
        visible={showStatusPicker}
        onRequestClose={() => {
          setShowStatusPicker(false);
          setPendingStatus(null);
        }}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            setShowStatusPicker(false);
            setPendingStatus(null);
          }}
        >
          <AnimatedPopupCard
            visible={showStatusPicker}
            style={styles.modalCard}
            onPress={() => undefined}
          >
            <Text style={styles.modalTitle}>
              {pendingStatus ? 'Why?' : 'Change status'}
            </Text>
            <Text style={styles.modalSubtitle}>
              {pendingStatus
                ? 'Recorded on the timeline so the change can be traced.'
                : 'Adding a Death, Sale or Purchase record sets this automatically.'}
            </Text>

            {pendingStatus ? (
              <View style={styles.optionList}>
                {ANIMAL_STATUS_REASONS.map((reason) => (
                  <BouncyPressable
                    key={reason}
                    accessibilityLabel={reason}
                    accessibilityRole="button"
                    onPress={() => void applyStatus(pendingStatus, reason)}
                    style={({ pressed }) => [styles.optionRow, pressed && styles.cardPressed]}
                  >
                    <Text style={styles.optionText}>{reason}</Text>
                    <AppIcon name="chevron-right-minimal" size={16} color="#171717" />
                  </BouncyPressable>
                ))}
              </View>
            ) : (
              <View style={styles.optionList}>
                {(['Active', 'Sold', 'Deceased'] as AnimalStatus[]).map((status) => (
                  <BouncyPressable
                    key={status}
                    accessibilityLabel={status}
                    accessibilityRole="button"
                    onPress={() => setPendingStatus(status)}
                    style={({ pressed }) => [styles.optionRow, pressed && styles.cardPressed]}
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
                    <Text style={styles.optionText}>{status}</Text>
                    {animal?.status === status ? (
                      <AppIcon name="check" size={16} color={tokens.colors.accent} />
                    ) : (
                      <AppIcon name="chevron-right-minimal" size={16} color="#171717" />
                    )}
                  </BouncyPressable>
                ))}
              </View>
            )}
          </AnimatedPopupCard>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function describeStatusChange(change: AnimalStatusChange) {
  const source = change.manual ? 'Set manually' : 'From a record';
  return change.reason ? `${change.reason} · ${source}` : source;
}

function SummaryDetail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryDetail}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value.trim() || 'Not set'}</Text>
    </View>
  );
}

function getRecordTimestamp(value: string) {
  return parseStoredDate(value)?.getTime() ?? 0;
}

function getTimelineDetails(record: RecordEntry, farms: FarmEntity[], paddocks: PaddockEntity[]) {
  // Movement's location summary is resolved fresh from the current
  // farm/paddock names rather than the frozen title text, so a rename
  // shows up here too.
  const titleDetails =
    record.type === 'Movement' ? resolveMovementSummary(record, farms, paddocks) : stripRecordType(record.title, record.type);
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
  summaryHeaderMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  summaryIdentity: {
    flex: 1,
    gap: 3,
    paddingTop: 4,
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
    fontSize: 23,
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
    backgroundColor: '#D49A3A',
  },
  statusDeceased: {
    backgroundColor: '#8A8A8A',
  },
  statusText: {
    color: tokens.colors.text,
    fontSize: 12,
    fontWeight: '600',
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
  // Bookkeeping entries read quieter than husbandry events: muted fill, no
  // shadow, no chevron, and a hollow rail dot.
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
  modalTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalSubtitle: {
    marginTop: 6,
    color: tokens.colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
  optionList: {
    marginTop: 16,
    gap: 8,
  },
  optionRow: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: tokens.colors.surfaceMuted,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionText: {
    flex: 1,
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  statusCard: {
    backgroundColor: tokens.colors.surfaceMuted,
    shadowOpacity: 0,
    elevation: 0,
    minHeight: 64,
  },
  railDotStatus: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: tokens.colors.accent,
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
