import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Animal Timeline"
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerStyle={[styles.content, !animal || timelineRecords.length === 0 ? styles.contentEmpty : undefined]} showsVerticalScrollIndicator={false}>
        {animal ? (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryId}>{animal.id}</Text>
            <Text style={styles.summaryName}>{animal.name.trim() || 'Unnamed animal'}</Text>
            <Text style={styles.summaryMeta}>{[animal.species, animal.status].filter(Boolean).join('  •  ')}</Text>
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
          timelineRecords.map((record) => (
            <Pressable
              key={record.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/add-record', params: { recordId: record.id } })}
              style={({ pressed }) => [styles.recordCard, pressed && styles.cardPressed]}
            >
              <View style={styles.recordCopy}>
                <Text style={styles.recordDate}>{record.date}</Text>
                <Text style={styles.recordType}>{record.type}</Text>
                <View style={styles.recordFooter}>
                  <View style={[
                    styles.speciesChip,
                    record.speciesTone === 'sheep'
                      ? styles.sheepChip
                      : record.speciesTone === 'pig'
                        ? styles.pigChip
                        : styles.cowChip,
                  ]}>
                    <Text style={[
                      styles.speciesChipText,
                      record.speciesTone === 'sheep'
                        ? styles.sheepChipText
                        : record.speciesTone === 'pig'
                          ? styles.pigChipText
                          : styles.cowChipText,
                    ]}>{record.species}</Text>
                  </View>
                  <Text style={styles.recordMeta}>{formatAnimalCount(record)}</Text>
                </View>
              </View>
              <AppIcon name="arrow-right-circle" size={24} color={tokens.colors.accent} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
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

function formatAnimalCount(record: { animalIds?: string[]; animalTag: string }) {
  const count = record.animalIds?.length ?? record.animalTag.split(',').map((value) => value.trim()).filter(Boolean).length;
  return `${count} ${count === 1 ? 'animal' : 'animals'}`;
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
    gap: 12,
  },
  contentEmpty: {
    flexGrow: 1,
  },
  summaryCard: {
    borderRadius: 22,
    backgroundColor: '#F5F3F7',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 3,
  },
  summaryId: {
    color: tokens.colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  summaryName: {
    color: tokens.colors.textSoft,
    fontSize: 14,
    fontWeight: '600',
  },
  summaryMeta: {
    color: '#6C6761',
    fontSize: 12,
    fontWeight: '500',
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
  recordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    minHeight: 96,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(28, 28, 28, 0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.92,
  },
  recordCopy: {
    flex: 1,
    gap: 4,
    paddingRight: 10,
  },
  recordDate: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  recordType: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '500',
  },
  recordFooter: {
    marginTop: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordMeta: {
    color: '#544F49',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  speciesChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    flexShrink: 0,
  },
  cowChip: {
    backgroundColor: '#FCE5E4',
    borderColor: '#E79D99',
  },
  sheepChip: {
    backgroundColor: '#E7F1DA',
    borderColor: '#BFD7A6',
  },
  pigChip: {
    backgroundColor: '#DCEAF9',
    borderColor: '#90B9DE',
  },
  speciesChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cowChipText: {
    color: '#5B4747',
  },
  sheepChipText: {
    color: '#4B6040',
  },
  pigChipText: {
    color: '#4B6483',
  },
});
