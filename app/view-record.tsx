import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { getSpeciesThemeByTone } from '../src/constants/speciesTheme';
import { useAccount } from '../src/context/AccountContext';
import { useAnimals } from '../src/context/AnimalsContext';
import { useRecords } from '../src/context/RecordsContext';
import type { Animal, AnimalTone } from '../src/entities/animal';
import type { RecordEntry } from '../src/entities/record';
import { tokens } from '../src/theme/tokens';
import { formatDateForDisplay } from '../src/utils/dateFormat';

export default function ViewRecordScreen() {
  const router = useRouter();
  const { recordId } = useLocalSearchParams<{ recordId?: string }>();
  const { profile } = useAccount();
  const { records } = useRecords();
  const { animals } = useAnimals();

  const record = useMemo(
    () => (recordId ? records.find((entry) => entry.id === recordId) ?? null : null),
    [recordId, records],
  );

  const relatedAnimals = useMemo(() => {
    if (!record) {
      return [];
    }

    const normalizedIds = new Set(
      [record.animalTag, ...(record.animalIds ?? [])]
        .flatMap((value) => value.split(/[,:;|•]+/))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    );
    const normalizedNames = new Set(
      record.animal
        .split(/[,:;|•]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    );
    const combinedReference = [record.animalTag, record.animal, ...(record.animalIds ?? [])]
      .join(' ')
      .trim()
      .toLowerCase();

    return animals.filter((animal) => {
      const animalId = animal.id.trim().toLowerCase();
      const animalName = animal.name.trim().toLowerCase();

      return (
        normalizedIds.has(animalId) ||
        (animalName.length > 0 && normalizedNames.has(animalName)) ||
        (animalId.length > 0 && combinedReference.includes(animalId)) ||
        (animalName.length > 0 && combinedReference.includes(animalName))
      );
    });
  }, [animals, record]);

  const primaryImageUri = record?.imageUris?.[0] ?? null;
  const singleRelatedAnimal = relatedAnimals.length === 1 ? relatedAnimals[0] : null;

  const handleShareRecord = async () => {
    if (!record) {
      Alert.alert('Record not found', 'There is no record to share right now.');
      return;
    }

    const shareSections = [
      record.type,
      getDisplayTitle(record),
      ...buildSummaryDetails(record, relatedAnimals.length === 0, profile.dateFormat).map(
        (item) => `${item.label}: ${item.value}`,
      ),
      record.details.trim() ? `Details: ${record.details.trim()}` : '',
    ].filter(Boolean);

    try {
      await Share.share({
        title: record.type,
        message: shareSections.join('\n'),
      });
    } catch {
      Alert.alert('Share unavailable', 'Unable to open the share sheet right now.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="View Record"
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
        actions={
          record
            ? [
                {
                  icon: 'share-outline',
                  accessibilityLabel: 'Share',
                  onPress: () => void handleShareRecord(),
                  size: 22,
                },
                {
                  icon: 'edit',
                  accessibilityLabel: 'Edit record',
                  onPress: () =>
                    router.replace({
                      pathname: '/edit-record',
                      params: { recordId: record.id },
                    }),
                  size: 24,
                },
              ]
            : []
        }
      />
      <ScrollView contentContainerStyle={[styles.content, !record ? styles.contentEmpty : undefined]} showsVerticalScrollIndicator={false}>
        {record ? (
          <View style={styles.summarySection}>
            <View style={styles.summaryHeader}>
              <View style={styles.summaryHeaderMain}>
                {primaryImageUri ? <Image source={{ uri: primaryImageUri }} style={styles.summaryProfileImage} /> : null}
                <View style={styles.summaryIdentity}>
                  <Text style={styles.summaryId}>{record.type}</Text>
                  <Text style={styles.summaryName}>{getDisplayTitle(record)}</Text>
                  <Text style={styles.summaryMeta}>{getSummaryMeta(record, profile.dateFormat)}</Text>
                </View>
              </View>
              <View style={styles.statusPill}>
                <View style={[styles.statusDot, getToneDotStyle(record.speciesTone)]} />
                <Text style={styles.statusText}>{record.species}</Text>
              </View>
            </View>

            <View style={styles.summaryDetails}>
              {buildSummaryDetails(record, relatedAnimals.length === 0, profile.dateFormat).map((item) => (
                <SummaryDetail key={item.label} label={item.label} value={item.value} />
              ))}
            </View>

            {singleRelatedAnimal ? (
              <View style={styles.singleAnimalSection}>
                <Text style={styles.animalsTitle}>Animal</Text>
                <AnimalNavigationRow animal={singleRelatedAnimal} />
              </View>
            ) : relatedAnimals.length > 1 ? (
              <View style={styles.animalsSection}>
                <Text style={styles.animalsTitle}>{`Animals (${relatedAnimals.length})`}</Text>
                <View style={styles.animalsList}>
                  {relatedAnimals.map((animal) => (
                    <AnimalNavigationRow key={animal.id} animal={animal} />
                  ))}
                </View>
              </View>
            ) : null}

            {record.details.trim() ? (
              <View style={styles.summaryNotes}>
                <Text style={styles.summaryLabel}>Details</Text>
                <Text style={styles.summaryNotesText}>{record.details.trim()}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <AppIcon name="records_" size={80} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>Record not found</Text>
            <Text style={styles.emptyText}>Return and open a record card again.</Text>
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

function AnimalNavigationRow({ animal }: { animal: Animal }) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View animal ${animal.name.trim() || animal.id}`}
      onPress={() =>
        router.push({
          pathname: '/animal-timeline',
          params: { animalId: animal.id },
        })
      }
      style={({ pressed }) => [styles.animalRow, pressed && styles.cardPressed]}
    >
      <AnimalAvatar animal={animal} />
      <View style={styles.animalCopy}>
        <Text style={styles.animalName}>{animal.name.trim() || 'Unnamed animal'}</Text>
        <Text style={styles.animalMeta}>{`${animal.id} • ${animal.species}`}</Text>
      </View>
      <AppIcon name="chevron-right-minimal" size={18} color="#171717" />
    </Pressable>
  );
}

function AnimalAvatar({ animal }: { animal: Animal }) {
  const imageUri = animal.imageUris?.[0] ?? null;

  if (imageUri) {
    return <Image source={{ uri: imageUri }} style={styles.animalPhoto} />;
  }

  const theme = getSpeciesThemeByTone(animal.tone);

  return (
    <View style={[styles.speciesIconBadge, { backgroundColor: theme.chipBackground }] }>
      <AppIcon name={getSpeciesIconName(animal.species, animal.tone)} size={22} color={theme.icon} />
    </View>
  );
}

function getDisplayTitle(record: RecordEntry) {
  const cleanedTitle = stripRecordType(record.title, record.type);
  return cleanedTitle || record.recordTitle?.trim() || 'Untitled record';
}

function getSummaryMeta(record: RecordEntry, dateFormat: Parameters<typeof formatDateForDisplay>[1]) {
  return [formatDateForDisplay(record.date, dateFormat).trim(), record.species.trim()].filter(Boolean).join(' • ') || 'Record details';
}

function buildSummaryDetails(record: RecordEntry, includeAnimalFallback: boolean, dateFormat: Parameters<typeof formatDateForDisplay>[1]) {
  return [
    { label: 'Date', value: formatDateForDisplay(record.date, dateFormat) },
    ...(includeAnimalFallback
      ? [
          { label: 'Animal(s)', value: record.animal },
          { label: 'Animal ID / Tag', value: record.animalTag },
        ]
      : []),
    { label: 'Species', value: record.species },
    ...getTypeSpecificDetails(record),
  ].filter((item) => item.value.trim().length > 0);
}

function getTypeSpecificDetails(record: RecordEntry) {
  switch (record.type) {
    case 'Vaccination':
    case 'Medication':
      return [
        { label: 'Medicine / Vaccine', value: record.medicine ?? '' },
        { label: 'Dose', value: formatDose(record) },
        { label: 'Route', value: record.route ?? '' },
        { label: 'Withdrawal', value: record.withdrawal ?? '' },
        { label: 'Batch / Lot No.', value: record.batchNumber ?? '' },
        { label: 'Expiry Date', value: record.expiryDate ?? '' },
      ];
    case 'Count':
      return [{ label: 'Head Count', value: record.headCount ?? '' }];
    case 'Weight':
      return [{ label: 'Weight', value: formatWeight(record) }];
    case 'Health Check':
      return [
        { label: 'Health Status', value: record.healthStatus ?? '' },
        { label: 'Diagnosis', value: record.conditionDiagnosis ?? '' },
        { label: 'Vet Seen', value: record.vetSeen ?? '' },
      ];
    case 'Death':
      return [
        { label: 'Cause of Death', value: record.causeOfDeath ?? '' },
        { label: 'Disposal Method', value: record.disposalMethod ?? '' },
      ];
    case 'Birth':
      return [
        { label: 'Mother', value: record.motherName ?? '' },
        { label: 'Birth Tag / ID', value: record.birthTagId ?? '' },
        { label: 'Birth Species', value: record.birthSpecies ?? '' },
        { label: 'Birth Breed', value: record.birthBreed ?? '' },
        { label: 'Birth Sex', value: capitalize(record.birthSex ?? '') },
        { label: 'Birth Weight', value: formatBirthWeight(record) },
      ];
    case 'Sale':
      return [
        { label: 'Buyer', value: record.buyer ?? '' },
        { label: 'Sale Price', value: record.salePrice ?? '' },
        { label: 'Destination', value: record.destination ?? '' },
      ];
    case 'Purchase':
      return [
        { label: 'Seller', value: record.seller ?? '' },
        { label: 'Purchase Price', value: record.purchasePrice ?? '' },
        { label: 'Source Farm', value: record.sourceFarm ?? '' },
      ];
    case 'Movement':
      return [
        { label: 'From Farm', value: record.fromFarm ?? '' },
        { label: 'From Paddock', value: record.fromPaddock ?? '' },
        { label: 'To Farm', value: record.toFarm ?? '' },
        { label: 'To Paddock', value: record.toPaddock ?? '' },
      ];
    default:
      return [];
  }
}

function formatDose(record: RecordEntry) {
  const parts = [record.dose?.trim() ?? '', record.doseUnit?.trim() ?? ''].filter(Boolean);
  return parts.join(' ');
}

function formatWeight(record: RecordEntry) {
  const parts = [record.weight?.trim() ?? '', record.weightUnit?.trim() ?? ''].filter(Boolean);
  return parts.join(' ');
}

function formatBirthWeight(record: RecordEntry) {
  const parts = [record.birthWeight?.trim() ?? '', record.birthWeightUnit?.trim() ?? ''].filter(Boolean);
  return parts.join(' ');
}

function capitalize(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : '';
}

function stripRecordType(title: string, type: string) {
  const trimmedTitle = title.trim();
  const prefix = `${type.trim()}:`;
  return trimmedTitle.startsWith(prefix) ? trimmedTitle.slice(prefix.length).trim() : trimmedTitle;
}

function getToneDotStyle(tone: RecordEntry['speciesTone']) {
  switch (tone) {
    case 'sheep':
      return styles.statusSheep;
    case 'pig':
      return styles.statusPig;
    case 'goat':
      return styles.statusGoat;
    default:
      return styles.statusCow;
  }
}

function getSpeciesIconName(species: string, tone: AnimalTone) {
  const normalized = species.trim().toLowerCase();

  if (normalized.includes('cattle') || normalized.includes('cow')) return 'cow-copy';
  if (normalized.includes('sheep')) return 'sheep';
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
      return 'sheep';
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
  statusCow: {
    backgroundColor: '#86A43D',
  },
  statusSheep: {
    backgroundColor: '#7290C3',
  },
  statusPig: {
    backgroundColor: '#C06F7E',
  },
  statusGoat: {
    backgroundColor: '#B78E4D',
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
  singleAnimalSection: {
    gap: 8,
  },
  animalsSection: {
    gap: 12,
  },
  animalsTitle: {
    color: tokens.colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  animalsList: {
    gap: 10,
  },
  animalRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(28, 28, 28, 0.08)',
  },
  animalPhoto: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceMuted,
  },
  speciesIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  animalCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  animalName: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  animalMeta: {
    color: tokens.colors.textSoft,
    fontSize: 13,
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
  cardPressed: {
    opacity: 0.92,
  },
});
