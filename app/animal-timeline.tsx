import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { useAnimals } from '../src/context/AnimalsContext';
import { useRecords } from '../src/context/RecordsContext';
import type { RecordEntry } from '../src/entities/record';
import { tokens } from '../src/theme/tokens';

export default function AnimalTimelineScreen() {
  const router = useRouter();
  const { animalId } = useLocalSearchParams<{ animalId?: string }>();
  const { animals } = useAnimals();
  const { records } = useRecords();

  const animal = useMemo(
    () => (animalId ? animals.find((entry) => entry.id === animalId) ?? null : null),
    [animalId, animals],
  );

  const timelineRecords = useMemo(() => {
    if (!animal) {
      return [];
    }

    return records
      .filter((record) => recordBelongsToAnimal(record, animal.id, animal.name))
      .sort((left, right) => getRecordTimestamp(right.date) - getRecordTimestamp(left.date));
  }, [animal, records]);

  const primaryImageUri = animal?.imageUris?.[0] ?? null;
  const galleryImageUris = animal?.imageUris?.slice(1) ?? [];

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
                  icon: 'edit',
                  accessibilityLabel: 'Edit animal',
                  onPress: () =>
                    router.push({
                      pathname: '/add-animal',
                      params: { animalId: animal.id },
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
                {primaryImageUri ? <Image source={{ uri: primaryImageUri }} style={styles.summaryProfileImage} /> : null}
                <View style={styles.summaryIdentity}>
                  <Text style={styles.summaryId}>{animal.id}</Text>
                  <Text style={styles.summaryName}>{animal.name.trim() || 'Unnamed animal'}</Text>
                  <Text style={styles.summaryMeta}>{capitalize(animal.sex) || 'Sex not set'}</Text>
                </View>
              </View>
              <View style={styles.statusPill}>
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

            <View style={styles.summaryDetails}>
              <SummaryDetail label="Species" value={animal.species} />
              <SummaryDetail label="Breed" value={animal.breed} />
              <SummaryDetail label="Weight" value={formatAnimalWeight(animal.weight, animal.weightUnit)} />
              <SummaryDetail label="Age" value={animal.ageLabel} />
              <SummaryDetail label="Date of birth" value={animal.dateOfBirth} />
              <SummaryDetail label="Farm" value={animal.farm} />
              <SummaryDetail label="Paddock" value={animal.paddock} />
              <SummaryDetail label="Group" value={animal.group} />
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
          </View>
        ) : null}

        {!animal ? (
          <View style={styles.emptyState}>
            <AppIcon name="animal_" size={80} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>Animal not found</Text>
            <Text style={styles.emptyText}>Return and open an animal card again.</Text>
          </View>
        ) : timelineRecords.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="records_" size={80} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>No timeline yet</Text>
            <Text style={styles.emptyText}>Records for this animal will appear here.</Text>
          </View>
        ) : (
          <View style={styles.timelineList}>
            {timelineRecords.map((record, index) => {
              const isLast = index === timelineRecords.length - 1;
              const details = getTimelineDetails(record);

              return (
                <View key={record.id} style={styles.timelineRow}>
                  <Text style={styles.recordDate}>{record.date}</Text>
                  <View style={styles.railColumn}>
                    {!isLast ? <View style={styles.railLine} /> : null}
                    <View style={styles.railDot} />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${record.type} on ${record.date}`}
                    onPress={() => router.push({ pathname: '/view-record', params: { recordId: record.id } })}
                    style={({ pressed }) => [styles.recordCard, pressed && styles.cardPressed]}
                  >
                    <View style={styles.recordCopy}>
                      <Text style={styles.recordTitle}>{record.type}</Text>
                      <Text style={styles.recordDetails}>{details}</Text>
                    </View>
                    <AppIcon name="arrow-right-circle" size={24} color={tokens.colors.accent} />
                  </Pressable>
                </View>
              );
            })}
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
      <Text style={styles.summaryValue}>{value.trim() || 'Not set'}</Text>
    </View>
  );
}

function recordBelongsToAnimal(record: RecordEntry, animalId: string, animalName: string) {
  const normalizedId = animalId.trim().toLowerCase();
  const normalizedName = animalName.trim().toLowerCase();
  const recordIds = [record.animalTag, ...(record.animalIds ?? [])]
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const recordNames = record.animal
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return recordIds.includes(normalizedId) || (normalizedName.length > 0 && recordNames.includes(normalizedName));
}

function getRecordTimestamp(value: string) {
  const [dayPart, monthPart, yearPart] = value.trim().split(/\s+/);
  const monthIndex = MONTH_INDEX[monthPart?.toLowerCase() ?? ''];
  const day = Number(dayPart);
  const year = Number(yearPart);

  if (!Number.isFinite(day) || !Number.isFinite(year) || monthIndex === undefined) {
    return 0;
  }

  return new Date(year, monthIndex, day).getTime();
}

function getTimelineDetails(record: RecordEntry) {
  const titleDetails = stripRecordType(record.title, record.type);
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

function capitalize(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : '';
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
    width: 78,
    height: 78,
    borderRadius: 20,
    backgroundColor: tokens.colors.surfaceMuted,
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
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  recordDate: {
    width: 74,
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
  recordCopy: {
    flex: 1,
    gap: 4,
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
    lineHeight: 18,
    fontWeight: '500',
  },
});
