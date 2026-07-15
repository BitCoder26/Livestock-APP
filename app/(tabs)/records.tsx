import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../../src/components/AppIcon';
import { AppTopBar } from '../../src/components/AppTopBar';
import { FloatingActionButton } from '../../src/components/FloatingActionButton';
import { useRecords } from '../../src/context/RecordsContext';
import { tokens } from '../../src/theme/tokens';

function formatAnimalCount(record: { animalIds?: string[]; animalTag: string }) {
  const count = record.animalIds?.length ?? record.animalTag.split(',').map((value) => value.trim()).filter(Boolean).length;
  return `${count} ${count === 1 ? 'animal' : 'animals'}`;
}

export default function RecordsScreen() {
  const router = useRouter();
  const { records, filteredRecords, filters } = useRecords();
  const hasActiveFilters = Object.values(filters).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );
  const shouldShowFacebookCard = records.length <= 1;
  const shouldFloatFacebookCard = shouldShowFacebookCard && filteredRecords.length === 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Records"
        actions={[
          {
            icon: 'filter',
            accessibilityLabel: 'Filter records',
            onPress: () => router.push('/records-filter'),
          },
          {
            icon: 'settings',
            accessibilityLabel: 'Open settings',
            onPress: () => router.push('/settings'),
          },
        ]}
      />
      <View style={styles.body}>
        <ScrollView
          contentContainerStyle={[styles.content, filteredRecords.length === 0 && styles.emptyContent]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.countText}>{hasActiveFilters ? `${filteredRecords.length} of ${records.length} records` : `${records.length} records`}</Text>
          {shouldShowFacebookCard ? (
            <Pressable
              accessibilityLabel="Open Facebook group in settings"
              accessibilityRole="button"
              onPress={() => router.push('/settings')}
              style={({ pressed }) => [shouldFloatFacebookCard ? styles.facebookCardFloating : styles.facebookCard, pressed && styles.cardPressed]}
            >
              <AppIcon name="group" size={24} color="#171717" />
              <View style={styles.facebookCopy}>
                <Text style={styles.facebookTitle}>Join the Facebook group</Text>
                <Text style={styles.facebookText}>Users share tips, discuss the app, and offer support there.</Text>
              </View>
              <View style={styles.facebookJoinButton}><Text style={styles.facebookJoinButtonText}>Join</Text></View>
            </Pressable>
          ) : null}
          {filteredRecords.length === 0 ? (
            <View style={styles.emptyState}>
              <AppIcon name="records_" size={86} color="#E5E0E7" opacity={1} />
              <Text style={styles.emptyTitle}>{hasActiveFilters ? 'No matches' : 'Empty'}</Text>
              <Text style={styles.emptyText}>{hasActiveFilters ? 'Try fewer filters' : 'Add below'}</Text>
            </View>
          ) : (
            filteredRecords.map((record) => (
              <Pressable
                key={record.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/add-record', params: { recordId: record.id } })}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                <View style={styles.cardCopy}>
                  <Text style={styles.cardDate}>{record.date}</Text>
                  <Text style={styles.cardType}>{record.type}</Text>
                  <View style={styles.cardFooterRow}>
                    <View
                      style={[
                        styles.speciesChip,
                        record.speciesTone === 'sheep'
                          ? styles.sheepChip
                          : record.speciesTone === 'pig'
                            ? styles.pigChip
                            : styles.cowChip,
                      ]}
                    >
                      <Text
                        style={[
                          styles.speciesChipText,
                          record.speciesTone === 'sheep'
                            ? styles.sheepChipText
                            : record.speciesTone === 'pig'
                              ? styles.pigChipText
                              : styles.cowChipText,
                        ]}
                      >
                        {record.species}
                      </Text>
                    </View>
                    <Text style={styles.cardMeta}>{formatAnimalCount(record)}</Text>
                  </View>
                </View>
                <AppIcon name="arrow-right-circle" size={24} color={tokens.colors.accent} />
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
      <FloatingActionButton
        accessibilityLabel="Add record"
        onPress={() => router.push('/add-record')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  body: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 120,
    gap: 12,
  },
  countText: {
    color: '#8A7F87',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
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
  cardCopy: {
    flex: 1,
    gap: 4,
    paddingRight: 10,
  },
  cardDate: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cardType: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '500',
  },
  cardFooterRow: {
    marginTop: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardMeta: {
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
    color: '#5b4747',
  },
  sheepChipText: {
    color: '#4b6040',
  },
  pigChipText: {
    color: '#4b6483',
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
    position: 'absolute',
    top: 18,
    left: 16,
    right: 16,
    zIndex: 2,
    minHeight: 84,
    borderRadius: 18,
    backgroundColor: 'rgba(231, 108, 102, 0.14)',
    paddingHorizontal: 18,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
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
