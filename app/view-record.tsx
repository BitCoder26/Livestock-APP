import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { useRecords } from '../src/context/RecordsContext';
import type { RecordEntry } from '../src/entities/record';
import { tokens } from '../src/theme/tokens';

export default function ViewRecordScreen() {
  const router = useRouter();
  const { recordId } = useLocalSearchParams<{ recordId?: string }>();
  const { records } = useRecords();

  const record = useMemo(
    () => (recordId ? records.find((entry) => entry.id === recordId) ?? null : null),
    [recordId, records],
  );

  const primaryImageUri = record?.imageUris?.[0] ?? null;
  const galleryImageUris = record?.imageUris?.slice(1) ?? [];

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
                  icon: 'edit',
                  accessibilityLabel: 'Edit record',
                  onPress: () =>
                    router.push({
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
                  <Text style={styles.summaryMeta}>{getSummaryMeta(record)}</Text>
                </View>
              </View>
              <View style={styles.statusPill}>
                <View style={[styles.statusDot, getToneDotStyle(record.speciesTone)]} />
                <Text style={styles.statusText}>{record.species}</Text>
              </View>
            </View>

            <View style={styles.summaryDetails}>
              {buildSummaryDetails(record).map((item) => (
                <SummaryDetail key={item.label} label={item.label} value={item.value} />
              ))}
            </View>

            {record.details.trim() ? (
              <View style={styles.summaryNotes}>
                <Text style={styles.summaryLabel}>Details</Text>
                <Text style={styles.summaryNotesText}>{record.details.trim()}</Text>
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

function getDisplayTitle(record: RecordEntry) {
  const cleanedTitle = stripRecordType(record.title, record.type);
  return cleanedTitle || record.recordTitle?.trim() || 'Untitled record';
}

function getSummaryMeta(record: RecordEntry) {
  const animals = [record.animal.trim(), record.animalTag.trim()].filter(Boolean);
  return animals.join(' · ') || 'No animal linked';
}

function buildSummaryDetails(record: RecordEntry) {
  return [
    { label: 'Date', value: record.date },
    { label: 'Animal(s)', value: record.animal },
    { label: 'Animal ID / Tag', value: record.animalTag },
    { label: 'Species', value: record.species },
    { label: 'Medicine / Vaccine', value: record.medicine ?? '' },
    { label: 'Dose', value: formatDose(record) },
    { label: 'Route', value: record.route ?? '' },
    { label: 'Withdrawal', value: record.withdrawal ?? '' },
    { label: 'Weight', value: formatWeight(record) },
    { label: 'Health Status', value: record.healthStatus ?? '' },
    { label: 'Diagnosis', value: record.conditionDiagnosis ?? '' },
    { label: 'Vet Seen', value: record.vetSeen ?? '' },
    { label: 'Buyer', value: record.buyer ?? '' },
    { label: 'Sale Price', value: record.salePrice ?? '' },
    { label: 'Destination', value: record.destination ?? '' },
    { label: 'Seller', value: record.seller ?? '' },
    { label: 'Purchase Price', value: record.purchasePrice ?? '' },
    { label: 'Source Farm', value: record.sourceFarm ?? '' },
    { label: 'Mother', value: record.motherName ?? '' },
    { label: 'Birth Tag / ID', value: record.birthTagId ?? '' },
    { label: 'Birth Species', value: record.birthSpecies ?? '' },
    { label: 'Birth Breed', value: record.birthBreed ?? '' },
    { label: 'Birth Sex', value: capitalize(record.birthSex ?? '') },
    { label: 'Birth Weight', value: formatBirthWeight(record) },
    { label: 'Cause of Death', value: record.causeOfDeath ?? '' },
    { label: 'Disposal Method', value: record.disposalMethod ?? '' },
    { label: 'From Farm', value: record.fromFarm ?? '' },
    { label: 'From Paddock', value: record.fromPaddock ?? '' },
    { label: 'To Farm', value: record.toFarm ?? '' },
    { label: 'To Paddock', value: record.toPaddock ?? '' },
  ].filter((item) => item.value.trim().length > 0);
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
});
