import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from 'expo-sqlite/kv-store';

import { AppIcon, AppIconName } from '../../src/components/AppIcon';
import { AppTopBar } from '../../src/components/AppTopBar';
import { BouncyPressable } from '../../src/components/BouncyPressable';
import { TabSwipeView } from '../../src/components/TabSwipeView';
import { useOnboarding, useSpotlightTarget } from '../../src/context/OnboardingContext';
import { useSetup } from '../../src/context/SetupContext';
import { tokens } from '../../src/theme/tokens';

const USERJOT_URL = 'https://livestockbook.userjot.com/?cursor=1&order=top&limit=10';
const FEEDBACK_CARD_DISMISSED_KEY = 'setupFeedbackCardDismissed';

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
  const { step } = useOnboarding();
  const isFocused = useIsFocused();
  const counts = { farms: farms.length, paddocks: paddocks.length, groups: groups.length, medicines: medicines.length };

  const farmCardRef = useRef<View>(null);
  useSpotlightTarget('setup', step === 'setup' && isFocused, farmCardRef);

  const [isFeedbackCardDismissed, setIsFeedbackCardDismissed] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(FEEDBACK_CARD_DISMISSED_KEY)
      .then((value) => {
        if (value === '1') {
          setIsFeedbackCardDismissed(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleDismissFeedbackCard = () => {
    setIsFeedbackCardDismissed(true);
    void AsyncStorage.setItem(FEEDBACK_CARD_DISMISSED_KEY, '1').catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <TabSwipeView>
        <AppTopBar
        title="Setup"
        actions={[
          {
            icon: 'profile',
            accessibilityLabel: 'Open account',
            onPress: () => router.push('/account'),
          },
        ]}
      />
      <View style={styles.body}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {SETUP_ITEMS.map((item) => (
            <View
              key={item.title}
              ref={item.collection === 'farms' ? farmCardRef : undefined}
              collapsable={false}
            >
              <BouncyPressable
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
                  <AppIcon name="chevron-right-minimal" size={18} color="#171717" />
                </View>
              </BouncyPressable>
            </View>
          ))}
        </ScrollView>
        {isFeedbackCardDismissed ? null : (
          <View style={styles.feedbackWrapper}>
            <BouncyPressable
              accessibilityLabel="Open feedback and suggestions"
              accessibilityRole="button"
              onPress={() => Linking.openURL(USERJOT_URL)}
              style={({ pressed }) => [styles.feedbackCard, pressed && styles.cardPressed]}
            >
              <View style={styles.feedbackIcon}>
                <AppIcon name="alert" size={24} color="#171717" />
              </View>
              <View style={styles.feedbackCopy}>
                <Text style={styles.feedbackTitle}>Need more setup options?</Text>
                <Text style={styles.feedbackText}>Leave a suggestion on our feedback board.</Text>
              </View>
              <View style={styles.feedbackActionButton}><Text style={styles.feedbackActionButtonText}>Suggest</Text></View>
            </BouncyPressable>
            <Pressable
              accessibilityLabel="Dismiss feedback card"
              accessibilityRole="button"
              hitSlop={10}
              onPress={handleDismissFeedbackCard}
              style={({ pressed }) => [styles.promoDismissButton, pressed && styles.cardPressed]}
            >
              <AppIcon name="close" size={10} color="#8A5A55" />
            </Pressable>
          </View>
        )}
      </View>
      </TabSwipeView>
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
  feedbackWrapper: {
    position: 'relative',
    marginTop: 8,
    marginBottom: 16,
    width: '92%',
    alignSelf: 'center',
  },
  feedbackIcon: {
    marginRight: -6,
  },
  promoDismissButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  feedbackCard: {
    minHeight: 84,
    borderRadius: 18,
    // Opaque rather than rgba(231, 108, 102, 0.14): this card also sets
    // `elevation`, and Android draws the elevation shadow *through* a
    // translucent background, casting a muddy grey over the fill. #FCEAEA is
    // that same tint composited over the screen's white background, so the
    // card looks identical on both platforms and the shadow renders cleanly.
    backgroundColor: '#FCEAEA',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    minWidth: 72,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    flexShrink: 0,
    marginRight: 8,
  },
  feedbackActionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
