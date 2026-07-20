import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTopBar } from '../src/components/AppTopBar';
import { tokens } from '../src/theme/tokens';

const UPDATES = [
  'Refreshed bottom tab icons, including updated Animals, Setup, Export, and Records tab styling.',
  'Added a real About page with app information, version details, developer info, and support links.',
  'Added a dedicated What\'s New page so new features can be viewed inside the app instead of a popup.',
  'Improved the Settings screen with cleaner divider spacing and updated icons such as Web Portal and Upgrade to Pro.',
  'Updated export action buttons and support actions to feel more polished and easier to use.',
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
