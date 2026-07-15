import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { useAnimals } from '../src/context/AnimalsContext';
import { tokens } from '../src/theme/tokens';

export default function SelectMotherAnimalScreen() {
  const router = useRouter();
  const { recordId, draftRecord } = useLocalSearchParams<{ recordId?: string; draftRecord?: string }>();
  const { animals } = useAnimals();

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Select Mother"
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {animals.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="animals" size={86} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>No animals available</Text>
            <BouncyPressable
              accessibilityLabel="Add animal"
              accessibilityRole="button"
              onPress={() => router.push('/add-animal')}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            >
              <AppIcon name="plus" size={16} color="#fff" />
              <Text style={styles.addButtonText}>Add Animal</Text>
            </BouncyPressable>
          </View>
        ) : (
          animals.map((animal, index) => (
            <Pressable
              key={`${animal.id}-${animal.name}-${index}`}
              accessibilityLabel={`Select ${animal.name} as mother`}
              accessibilityRole="button"
              onPress={() =>
                router.replace({
                  pathname: '/add-record',
                  params: {
                    selectedMotherName: animal.name,
                    ...(recordId ? { recordId } : {}),
                    ...(draftRecord ? { draftRecord } : {}),
                  },
                })
              }
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>{animal.name}</Text>
                <Text style={styles.cardMeta}>
                  {animal.id} • {animal.species}
                </Text>
              </View>
              <AppIcon name="chevron-right" size={18} color="#8A8A8A" />
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 36,
    gap: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingTop: 48,
    gap: 16,
  },
  emptyTitle: {
    color: '#8A8A8A',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  addButton: {
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: tokens.colors.accent,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    minHeight: 72,
    borderRadius: 18,
    backgroundColor: '#F5F3F7',
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardCopy: {
    gap: 5,
  },
  cardTitle: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cardMeta: {
    color: '#5E5E5E',
    fontSize: 13,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.9,
  },
});
