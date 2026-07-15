import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, AppIconName } from '../../src/components/AppIcon';
import { AppTopBar } from '../../src/components/AppTopBar';
import { useSetup } from '../../src/context/SetupContext';
import { tokens } from '../../src/theme/tokens';

const SETUP_ITEMS: Array<{
  title: string;
  icon: AppIconName;
  route: '/setup-farms' | '/setup-paddocks' | '/setup-groups' | '/setup-medicines';
  collection: 'farms' | 'paddocks' | 'groups' | 'medicines';
}> = [
  { title: 'Farms', icon: 'pin', route: '/setup-farms', collection: 'farms' },
  { title: 'Paddocks', icon: 'sprout', route: '/setup-paddocks', collection: 'paddocks' },
  { title: 'Groups', icon: 'tag', route: '/setup-groups', collection: 'groups' },
  { title: 'Medicines & Vaccines', icon: 'medicine', route: '/setup-medicines', collection: 'medicines' },
];

export default function SetupScreen() {
  const router = useRouter();
  const { farms, paddocks, groups, medicines } = useSetup();
  const counts = { farms: farms.length, paddocks: paddocks.length, groups: groups.length, medicines: medicines.length };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Setup"
        actions={[
          {
            icon: 'settings',
            accessibilityLabel: 'Open settings',
            onPress: () => router.push('/settings'),
          },
        ]}
      />
      <View style={styles.body}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {SETUP_ITEMS.map((item) => (
            <Pressable
              key={item.title}
              accessibilityLabel={item.title}
              accessibilityRole="button"
              onPress={() => router.push(item.route)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={styles.leftGroup}>
                <AppIcon name={item.icon} size={22} color="#000" />
                <Text style={styles.title}>{item.title}</Text>
              </View>
              <View style={styles.rightGroup}>
                <Text style={styles.count}>{counts[item.collection]}</Text>
                <AppIcon name="arrow-right-circle" size={24} color={tokens.colors.accent} />
              </View>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable
          accessibilityLabel="Open settings for feedback and suggestions"
          accessibilityRole="button"
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [styles.feedbackCard, pressed && styles.cardPressed]}
        >
          <AppIcon name="alert" size={24} color="#171717" />
          <View style={styles.feedbackCopy}>
            <Text style={styles.feedbackTitle}>Need more setup options?</Text>
            <Text style={styles.feedbackText}>Leave a suggestion in Feedback + Suggestions in Settings.</Text>
          </View>
          <View style={styles.feedbackActionButton}><Text style={styles.feedbackActionButtonText}>Suggest</Text></View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  body: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 112,
    gap: 8,
  },
  card: {
    minHeight: 60,
    borderRadius: 18,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 14,
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
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  title: {
    color: tokens.colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  count: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  feedbackCard: {
    minHeight: 84,
    borderRadius: 18,
    backgroundColor: 'rgba(231, 108, 102, 0.14)',
    paddingHorizontal: 18,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
    marginBottom: 16,
    width: '92%',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  feedbackCopy: {
    flex: 1,
    gap: 2,
  },
  feedbackTitle: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  feedbackText: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  feedbackActionButton: {
    minWidth: 76,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    flexShrink: 0,
  },
  feedbackActionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
