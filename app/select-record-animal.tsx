import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { useAnimals } from '../src/context/AnimalsContext';
import { tokens } from '../src/theme/tokens';

export default function SelectRecordAnimalScreen() {
  const router = useRouter();
  const { selectedAnimalIds, recordId, draftRecord } = useLocalSearchParams<{ selectedAnimalIds?: string; recordId?: string; draftRecord?: string }>();
  const { animals } = useAnimals();
  const initialIds = useMemo(
    () => (selectedAnimalIds ? selectedAnimalIds.split(',').filter(Boolean) : []),
    [selectedAnimalIds],
  );
  const [draftIds, setDraftIds] = useState<string[]>(initialIds);

  const toggleAnimal = (animalId: string) => {
    setDraftIds((current) =>
      current.includes(animalId)
        ? current.filter((id) => id !== animalId)
        : [...current, animalId],
    );
  };

  const returnToAddRecord = () => {
    router.dismissTo({
      pathname: '/add-record',
      params: {
        selectedAnimalIds: draftIds.join(','),
        ...(recordId ? { recordId } : {}),
        ...(draftRecord ? { draftRecord } : {}),
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Select Animal"
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: returnToAddRecord,
        }}
        actions={
          animals.length > 0
            ? [
                {
                  icon: 'check',
                  accessibilityLabel: 'Confirm selected animals',
                  onPress: returnToAddRecord,
                },
              ]
            : []
        }
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
              accessibilityLabel={`Select ${animal.name}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: draftIds.includes(animal.id) }}
              onPress={() => toggleAnimal(animal.id)}
              style={({ pressed }) => [
                styles.card,
                draftIds.includes(animal.id) && styles.cardActive,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>{animal.name}</Text>
                <Text style={styles.cardMeta}>
                  {animal.id} • {animal.species}
                </Text>
              </View>
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
  cardActive: {
    backgroundColor: '#FCE5E4',
    borderWidth: 1,
    borderColor: '#E79D99',
  },
  cardCopy: {
    flex: 1,
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
