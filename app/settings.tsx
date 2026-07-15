import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { tokens } from '../src/theme/tokens';

const WEBSITE_URL = 'https://livestockbook.app';
const USERJOT_URL = 'https://livestockbook.userjot.com/?cursor=1&order=top&limit=10';
const FACEBOOK_GROUP_URL = 'https://www.facebook.com/groups/1353099223626390/';
const CONTACT_EMAIL = 'contact@livestockbook.app';

type SettingsAction =
  | 'account'
  | 'upgrade'
  | 'website'
  | 'contact'
  | 'feedback'
  | 'facebook'
  | 'whats-new'
  | 'about'
  | 'sign-out';

const ITEMS: Array<{
  label: string;
  icon: AppIconName;
  action: Exclude<SettingsAction, 'upgrade'>;
  accent?: 'danger';
  statusLabel?: string;
  disabled?: boolean;
}> = [
  { label: 'Account', icon: 'profile', action: 'account' },
  { label: 'Web Portal', icon: 'web_portal', action: 'website' },
  { label: 'Contact', icon: 'mail', action: 'contact' },
  { label: 'Feedback & Suggestions', icon: 'alert', action: 'feedback' },
  { label: 'Facebook Group', icon: 'group', action: 'facebook' },
  { label: "What's New", icon: 'notebook', action: 'whats-new' },
  { label: 'About', icon: 'info', action: 'about' },
  { label: 'Sign Out', icon: 'enter-arrow', action: 'sign-out', accent: 'danger' },
];

const ITEM_GROUPS = [
  ITEMS.slice(0, 2),
  ITEMS.slice(2, 5),
  ITEMS.slice(5),
] as const;

const WHATS_NEW_UPDATES = [
  'Refreshed bottom tab icons, including updated Animals, Setup, Export, and Records tab styling.',
  'Added a real About page with app information, version details, developer info, and support links.',
  'Improved the Settings screen with cleaner divider spacing and updated icons such as Web Portal and Upgrade to Pro.',
  'Updated export action buttons and support actions to feel more polished and easier to use.',
];

export default function SettingsScreen() {
  const router = useRouter();
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const whatsNewEntrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!showWhatsNew) {
      whatsNewEntrance.setValue(0);
      return;
    }

    Animated.timing(whatsNewEntrance, {
      toValue: 1,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showWhatsNew, whatsNewEntrance]);

  function handleAction(action: SettingsAction) {
    if (action === 'website') {
      return openExternalTarget(WEBSITE_URL, 'Web Portal');
    }

    if (action === 'feedback') {
      return openExternalTarget(USERJOT_URL, 'Feedback & Suggestions');
    }

    if (action === 'facebook') {
      return openExternalTarget(FACEBOOK_GROUP_URL, 'Facebook Group');
    }

    if (action === 'contact') {
      return router.push('/contact');
    }

    if (action === 'account') {
      return router.push('/account');
    }

    if (action === 'upgrade') {
      return Alert.alert('Upgrade to Pro', 'Add your upgrade flow here.');
    }

    if (action === 'whats-new') {
      return setShowWhatsNew(true);
    }

    if (action === 'about') {
      return router.push('/about');
    }

    if (action === 'sign-out') {
      return Alert.alert('Sign Out', 'Add your sign-out flow here.');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.contentWrap}>
        <AppTopBar
          title="Settings"
          leftAction={{
            icon: 'back',
            accessibilityLabel: 'Back',
            onPress: () => router.back(),
          }}
        />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <BouncyPressable
            accessibilityLabel="Upgrade to Pro"
            accessibilityRole="button"
            onPress={() => handleAction('upgrade')}
            style={({ pressed }) => [styles.upgradeRow, pressed && styles.itemPressed]}
          >
            <AppIcon name="medal" size={30} color="#171717" />
            <View style={styles.upgradeTextWrap}>
              <Text style={styles.upgradeTitle}>Upgrade to Pro</Text>
              <Text style={styles.upgradeSubtitle}>Unlock all features</Text>
            </View>
            <View style={styles.upgradeActionButton}><Text style={styles.upgradeActionButtonText}>Upgrade</Text></View>
          </BouncyPressable>

          {ITEM_GROUPS.map((group, groupIndex) => (
            <View key={`group-${groupIndex}`}>
              <View style={styles.groupBlock}>
                {group.map((item) => (
                  <Pressable
                    key={item.label}
                    accessibilityLabel={item.label}
                    accessibilityRole="button"
                    accessibilityState={item.disabled ? { disabled: true } : undefined}
                    onPress={item.disabled ? undefined : () => handleAction(item.action)}
                    style={({ pressed }) => [styles.itemRow, pressed && styles.itemPressed]}
                  >
                    <View style={styles.leftGroup}>
                      <AppIcon name={item.icon} size={20} color="#171717" />
                      <Text
                        style={[
                          styles.itemText,
                          item.accent === 'danger' && styles.itemTextDanger,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </View>
                    {item.statusLabel ? <Text style={styles.itemStatusText}>{item.statusLabel}</Text> : null}
                  </Pressable>
                ))}
              </View>
              {groupIndex < ITEM_GROUPS.length - 1 ? <View style={styles.groupDivider} /> : null}
            </View>
          ))}
        </ScrollView>
      </View>

      <Modal transparent animationType="none" visible={showWhatsNew} onRequestClose={() => setShowWhatsNew(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowWhatsNew(false)}>
          <Animated.View
            pointerEvents="none"
            style={[styles.modalBackdrop, { opacity: whatsNewEntrance }]}
          />
          <Animated.View
            style={[
              styles.sheet,
              {
                opacity: whatsNewEntrance.interpolate({
                  inputRange: [0, 0.28, 1],
                  outputRange: [0, 1, 1],
                }),
                transform: [
                  {
                    translateY: whatsNewEntrance.interpolate({
                      inputRange: [0, 1],
                      outputRange: [140, 0],
                    }),
                  },
                  {
                    scale: whatsNewEntrance.interpolate({
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
              <Text style={styles.sheetTitle}>What&apos;s New</Text>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
              {WHATS_NEW_UPDATES.map((item, index) => (
                <View key={item} style={styles.featureBlock}>
                  <Text style={styles.featureLabel}>Update {index + 1}</Text>
                  <Text style={styles.featureText}>{item}</Text>
                </View>
              ))}
            </ScrollView>
          </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

async function openExternalTarget(url: string, label: string) {
  if (url.includes('your-')) {
    Alert.alert(label, `Replace the placeholder ${label.toUpperCase()} link in settings.tsx.`);
    return;
  }

  try {
    const supported = await Linking.canOpenURL(url);

    if (!supported) {
      Alert.alert(label, `Unable to open ${label} right now.`);
      return;
    }

    await Linking.openURL(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Unable to open ${label} right now.`;
    Alert.alert(label, message);
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  contentWrap: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 26,
    paddingTop: 18,
    paddingBottom: 120,
  },
  upgradeRow: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 18,
    backgroundColor: 'rgba(231, 108, 102, 0.14)',
    gap: 16,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  upgradeTextWrap: {
    gap: 2,
    flex: 1,
  },
  upgradeTitle: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  upgradeSubtitle: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '500',
  },
  upgradeActionButton: {
    minWidth: 82,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    flexShrink: 0,
  },
  upgradeActionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  itemRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupBlock: {
    gap: 10,
  },
  groupDivider: {
    height: 1,
    backgroundColor: 'rgba(23, 23, 23, 0.12)',
    marginTop: 8,
    marginBottom: 8,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemText: {
    color: '#262626',
    fontSize: 14,
    fontWeight: '500',
  },
  itemTextDanger: {
    color: tokens.colors.danger,
  },
  itemStatusText: {
    color: 'rgba(38, 38, 38, 0.45)',
    fontSize: 11,
    fontWeight: '500',
  },
  itemPressed: {
    opacity: 0.86,
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 26,
    maxHeight: '86%',
  },
  sheetHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  sheetTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  sheetContent: {
    gap: 16,
    paddingBottom: 24,
  },
  featureBlock: {
    gap: 6,
  },
  featureLabel: {
    color: tokens.colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  featureText: {
    color: '#383838',
    fontSize: 14,
    lineHeight: 23,
    fontWeight: '500',
  },
});
