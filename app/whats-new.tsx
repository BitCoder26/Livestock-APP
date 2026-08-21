import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTopBar } from '../src/components/AppTopBar';
import { tokens } from '../src/theme/tokens';

const UPDATES = [
  'Added a new Reports screen with Herd Overview, Activity, Financial, and Health summaries, filterable by All time, This year, or This month.',
  'You can now add a photo to animal profiles, individual records, and your business logo.',
  'Your business name, address, and logo now appear at the top of exported PDFs.',
  'Added new checks to catch mistakes before they\'re saved, including duplicate animal IDs, locations that don\'t belong to the selected farm, and Movement records with the same source and destination.',
  'Added a sort control to the Animals tab: Recently Added, Oldest Added, Name (A–Z), Tag / ID (A–Z), or Status.',
  'Added Backup & Restore, so you can save your farm data and bring it back on this or a new device.',
  'General bug fixes and stability improvements.',
];

export default function WhatsNewScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="What's New"
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Latest Updates</Text>
        <Text style={styles.intro}>Here are the newest features and improvements added to Livestock Tracker.</Text>
        <View style={styles.list}>
          {UPDATES.map((item, index) => (
            <View key={item} style={styles.listItem}>
              <Text style={styles.bullet}>{index + 1}.</Text>
              <Text style={styles.itemText}>{item}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  content: {
    paddingHorizontal: 26,
    paddingTop: 20,
    paddingBottom: 120,
    gap: 14,
  },
  heading: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  intro: {
    color: '#4a4a4a',
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '400',
  },
  list: {
    gap: 14,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bullet: {
    color: tokens.colors.accent,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 1,
  },
  itemText: {
    flex: 1,
    color: '#383838',
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '500',
  },
});
