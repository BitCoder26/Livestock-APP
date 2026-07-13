import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../../src/components/AppIcon';
import { AppTopBar } from '../../src/components/AppTopBar';
import { FloatingActionButton } from '../../src/components/FloatingActionButton';
import { useRecords } from '../../src/context/RecordsContext';
import { tokens } from '../../src/theme/tokens';

export default function RecordsScreen() {
  const router = useRouter();
  const { records, filteredRecords, filters } = useRecords();
  const hasActiveFilters = Object.values(filters).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );
  const shouldShowFacebookCard = records.length <= 1;

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
        {shouldShowFacebookCard ? (
          <Pressable
            accessibilityLabel="Open Facebook group in settings"
            accessibilityRole="button"
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.facebookCardFloating, pressed && styles.cardPressed]}
          >
            <View style={styles.facebookIconWrap}>
              <AppIcon name="group" size={24} color="#171717" />
            </View>
            <View style={styles.facebookCopy}>
              <Text style={styles.facebookTitle}>Join the Facebook group</Text>
              <Text style={styles.facebookText}>Users share tips, discuss the app, and offer support there.</Text>
            </View>
            <AppIcon name="arrow-right-circle" size={24} color={tokens.colors.accent} />
          </Pressable>
        ) : null}
        <ScrollView
          contentContainerStyle={[styles.content, filteredRecords.length === 0 && styles.emptyContent]}
          showsVerticalScrollIndicator={false}
        >
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
                onPress={() => router.push('/add-record')}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                <View style={styles.cardCopy}>
                  <Text style={styles.cardDate}>{record.date}</Text>
                  <Text style={styles.cardTitle}>{record.title}</Text>
                  <View style={styles.metaRow}>
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
                    <Text style={styles.tagText}>{record.animalTag}</Text>
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
    gap: 8,
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
    minHeight: 103,
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    gap: 4,
  },
  cardDate: {
    color: tokens.colors.text,
    fontSize: 19,
    fontWeight: '700',
  },
  cardTitle: {
    color: '#2c2c2c',
    fontSize: 16,
    fontWeight: '500',
  },
  metaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  speciesChip: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderWidth: 1,
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
    fontSize: 11,
    fontWeight: '500',
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
  tagText: {
    color: '#3e3e3e',
    fontSize: 13,
    fontWeight: '500',
  },
  facebookCard: {
    minHeight: 76,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  facebookCardFloating: {
    position: 'absolute',
    top: 18,
    left: 16,
    right: 16,
    minHeight: 76,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    zIndex: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  facebookIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: tokens.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    alignSelf: 'stretch',
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
});
