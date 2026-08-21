import type { AppIconName } from '../src/components/AppIcon';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../src/components/AppIcon';
import { SHEET_ENTRANCE_DURATION } from '../src/utils/motion';

const SPECIES: Array<{ icon: AppIconName; label: string }> = [
  { icon: 'cow-copy', label: 'Cattle' },
  { icon: 'sheep', label: 'Sheep' },
  { icon: 'pig', label: 'Pig' },
  { icon: 'goat', label: 'Goat' },
  { icon: 'chicken', label: 'Chicken' },
  { icon: 'duck', label: 'Duck' },
  { icon: 'turkey', label: 'Turkey' },
  { icon: 'goose', label: 'Goose' },
  { icon: 'donkey', label: 'Donkey' },
  { icon: 'horse', label: 'Horse' },
  { icon: 'bison', label: 'Buffalo' },
  { icon: 'rabbit', label: 'Rabbit' },
  { icon: 'alpaca', label: 'Alpaca' },
  { icon: 'llama', label: 'Llama' },
  { icon: 'camel', label: 'Camel' },
  { icon: 'ostrich', label: 'Ostrich' },
];

export default function SelectAnimalScreen() {
  const router = useRouter();
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: SHEET_ENTRANCE_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const handleSelect = (label: string) => {
    router.replace({
      pathname: '/add-animal',
      params: { species: label },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.dimmedHeader}>
        <View style={styles.topBar}>
          <View style={styles.topBarRow}>
            <AppIcon name="back" size={28} color="rgba(255,255,255,0.55)" />
            <Text style={styles.topBarTitle}>Add Animal</Text>
          </View>
        </View>
      </View>

      <Animated.View
        pointerEvents="none"
        style={[styles.entranceBackdrop, { opacity: entrance }]}
      />
      <Pressable style={styles.overlay} onPress={() => router.back()}>
        <Animated.View
          style={[
            styles.sheet,
            {
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
            <Text style={styles.sheetTitle}>Select Species</Text>
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              onPress={() => router.back()}
              style={styles.closeButton}
            >
              <AppIcon name="close" size={22} color="#000" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {SPECIES.map((item) => (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                onPress={() => handleSelect(item.label)}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                <AppIcon name={item.icon} size={26} color="#000" />
                <Text style={styles.cardLabel}>{item.label}</Text>
              </Pressable>
            ))}
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
    backgroundColor: '#FFFFFF',
  },
  dimmedHeader: {
    opacity: 1,
  },
  entranceBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  topBar: {
    height: 146,
    backgroundColor: '#5A2422',
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
  },
  topBarTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 26,
    fontWeight: '500',
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
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 26,
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
    color: '#111',
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingHorizontal: 10,
    paddingBottom: 24,
  },
  card: {
    width: '47%',
    minHeight: 96,
    borderRadius: 18,
    backgroundColor: '#F5F3F7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 14,
    paddingHorizontal: 20,
  },
  cardLabel: {
    color: '#171717',
    fontSize: 17,
    fontWeight: '500',
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
