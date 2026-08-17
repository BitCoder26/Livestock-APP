import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { useAnimals } from '../src/context/AnimalsContext';
import { tokens } from '../src/theme/tokens';

export default function SelectMotherAnimalScreen() {
  const router = useRouter();
  const { recordId, draftRecord, birthSpecies, selectedMotherUid } = useLocalSearchParams<{
    recordId?: string;
    draftRecord?: string;
    birthSpecies?: string;
    selectedMotherUid?: string;
  }>();
  const { animals } = useAnimals();
  const eligibleMothers = birthSpecies?.trim()
    ? animals.filter(
        (animal) =>
          animal.sex === 'female' &&
          animal.species.trim().toLowerCase() === birthSpecies.trim().toLowerCase(),
      )
    : [];

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
        {!birthSpecies?.trim() ? (
          <View style={styles.emptyState}>
            <AppIcon name="animals" size={86} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>Select the new animal's species first</Text>
            <Text style={styles.emptyDescription}>The mother list is filtered to females of the same species.</Text>
          </View>
        ) : eligibleMothers.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="animals" size={86} color="#E5E0E7" opacity={1} />
            <Text style={styles.emptyTitle}>No eligible mothers</Text>
            <Text style={styles.emptyDescription}>No female {birthSpecies} animals are currently available.</Text>
          </View>
        ) : (
          eligibleMothers.map((animal) => (
            <Pressable
              key={animal.uid}
              accessibilityLabel={`Select ${animal.name} as mother`}
              accessibilityRole="button"
              onPress={() =>
                router.dismissTo({
                  pathname: '/add-record',
                  params: {
                    selectedMotherUid: animal.uid,
                    selectedMotherName: animal.name.trim() || 'Unnamed',
                    ...(recordId ? { recordId } : {}),
                    ...(draftRecord ? { draftRecord } : {}),
                  },
                })
              }
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>
                  {animal.id} • {animal.species} • {animal.status}
                </Text>
                <Text style={styles.cardMeta}>{animal.name.trim() || 'Unnamed'}</Text>
              </View>
              <AppIcon
                name={animal.uid === selectedMotherUid ? 'check' : 'chevron-right'}
                size={18}
                color={animal.uid === selectedMotherUid ? tokens.colors.accent : '#8A8A8A'}
              />
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
    color: '#E5E0E7',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyDescription: {
    color: '#E5E0E7',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    textAlign: 'center',
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
