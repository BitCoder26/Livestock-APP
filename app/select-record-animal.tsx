import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { useAnimals } from '../src/context/AnimalsContext';
import { tokens } from '../src/theme/tokens';

export default function SelectRecordAnimalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedAnimalIds, recordId, draftRecord } = useLocalSearchParams<{ selectedAnimalIds?: string; recordId?: string; draftRecord?: string }>();
  const { animals } = useAnimals();
  const initialIds = useMemo(
    () => (selectedAnimalIds ? selectedAnimalIds.split(',').filter(Boolean) : []),
    [selectedAnimalIds],
  );
  const [draftIds, setDraftIds] = useState<string[]>(initialIds);
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

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
      <Animated.View pointerEvents="none" style={[styles.entranceBackdrop, { opacity: entrance }]} />
      <Pressable style={styles.overlay} onPress={returnToAddRecord}>
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 0) + 26,
              opacity: entrance.interpolate({
                inputRange: [0, 0.28, 1],
                outputRange: [0, 1, 1],
              }),
              transform: [
                {
                  translateY: entrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [140, 0],
                  }),
                },
                {
                  scale: entrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.985, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable onPress={() => undefined}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderSpacer} />
              <Text style={styles.sheetTitle}>Select Animal</Text>
              <Pressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                onPress={returnToAddRecord}
                style={styles.closeButton}
              >
                <AppIcon name="close" size={22} color="#000" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
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
                <>
                  {animals.map((animal, index) => (
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
                      {draftIds.includes(animal.id) ? (
                        <AppIcon name="check" size={18} color={tokens.colors.accent} />
                      ) : null}
                    </Pressable>
                  ))}
                  <BouncyPressable
                    accessibilityLabel="Confirm selected animals"
                    accessibilityRole="button"
                    onPress={returnToAddRecord}
                    style={styles.applyButton}
                  >
                    <AppIcon name="check" size={20} color="#fff" />
                    <Text style={styles.applyText}>Done</Text>
                  </BouncyPressable>
                </>
              )}
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  entranceBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 18,
    maxHeight: '86%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 10,
  },
  sheetHeaderSpacer: {
    width: 30,
  },
  sheetTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContent: {
    gap: 12,
    paddingBottom: 24,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 24,
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
    gap: 12,
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
  applyButton: {
    marginTop: 8,
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: tokens.colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  applyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.9,
  },
});
