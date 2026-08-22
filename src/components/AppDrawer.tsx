import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Easing, Linking, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../theme/text';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from './AppIcon';
import { requestAppStoreReview } from './AppReviewGate';
import { BackupNudgeCard } from './BackupNudgeCard';
import { BouncyPressable } from './BouncyPressable';
import { PlanCard } from './PlanCard';
import { FREE_EXPORT_LIMIT, FREE_RECORD_LIMIT } from '../constants/subscription';
import { useAccount } from '../context/AccountContext';
import { useAnimals } from '../context/AnimalsContext';
import { useRecords } from '../context/RecordsContext';
import { useSubscription } from '../context/SubscriptionContext';
import { tokens } from '../theme/tokens';
import { FAST_MOTION_DURATION } from '../utils/motion';

const USERJOT_URL = 'https://livestockbook.userjot.com/?cursor=1&order=top&limit=10';
const FACEBOOK_GROUP_URL = 'https://www.facebook.com/groups/1353099223626390/';
const WEB_PORTAL_URL = 'https://livestockbook.app/';
const GUIDE_URL = 'https://livestockbook.app/guide.html';

const DRAWER_WIDTH = Math.min(340, Math.round(Dimensions.get('window').width * 0.86));
// Only a gesture that starts in this strip opens the drawer. The four tab
// screens sit inside TabSwipeView, which claims horizontal drags to move
// between tabs — anything wider than an edge gutter would eat that gesture.
const EDGE_GUTTER_WIDTH = 20;
const OPEN_TRIGGER_DISTANCE = 48;
const DRAWER_DURATION = FAST_MOTION_DURATION;

type DrawerContextValue = {
  openDrawer: () => void;
  closeDrawer: () => void;
};

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function useAppDrawer() {
  const value = useContext(DrawerContext);

  if (!value) {
    throw new Error('useAppDrawer must be used inside AppDrawerProvider');
  }

  return value;
}

type DrawerItem = {
  label: string;
  icon: AppIconName;
  statusLabel?: string;
  // Rows are neutral by default; only Rate the App carries the crown's gold,
  // tying it to the upgrade mark in the header. Tints the icon and its label
  // together — a gold glyph beside a black label reads as a mistake.
  tint?: string;
  onPress: () => void;
};

// Wraps the tab navigator so the drawer is mounted once for all four tab
// screens rather than per screen: the panel, its scrim and the edge gutter all
// have to sit above the tab bar, which only this level can reach.
export function AppDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  // Kept mounted through the close animation, so the panel slides out instead
  // of vanishing the moment state flips.
  const [isVisible, setIsVisible] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    }

    const animation = Animated.timing(progress, {
      toValue: isOpen ? 1 : 0,
      duration: DRAWER_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    animation.start(({ finished }) => {
      if (finished && !isOpen) {
        setIsVisible(false);
      }
    });

    return () => animation.stop();
  }, [isOpen, progress]);

  const edgeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dx > 8 && gesture.dx > Math.abs(gesture.dy) * 1.2,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx >= OPEN_TRIGGER_DISTANCE) {
            setIsOpen(true);
          }
        },
      }),
    [],
  );

  const value = useMemo(() => ({ openDrawer, closeDrawer }), [closeDrawer, openDrawer]);

  return (
    <DrawerContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {isVisible ? null : (
          <View
            accessible={false}
            style={[styles.edgeGutter, { width: EDGE_GUTTER_WIDTH }]}
            {...edgeResponder.panHandlers}
          />
        )}
        {isVisible ? <DrawerOverlay progress={progress} onClose={closeDrawer} /> : null}
      </View>
    </DrawerContext.Provider>
  );
}

function DrawerOverlay({ progress, onClose }: { progress: Animated.Value; onClose: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAccount();
  const { animals } = useAnimals();
  const { records } = useRecords();
  const { isPro } = useSubscription();

  const go = (path: string) => {
    // Keep the drawer open behind internal routes. The pushed page covers it,
    // and Back then reveals the menu in the exact state the user left it.
    router.push(path);
  };

  const closeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dx < -8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx <= -OPEN_TRIGGER_DISTANCE) {
            onClose();
          }
        },
      }),
    [onClose],
  );

  const destinations: DrawerItem[] = [
    { label: 'Profile', icon: 'profile', onPress: () => go('/profile') },
    { label: 'Reports', icon: 'bar-chart', onPress: () => go('/reports') },
    { label: 'Settings', icon: 'settings', onPress: () => go('/settings') },
    {
      label: 'Web Portal',
      icon: 'web_portal',
      statusLabel: 'Coming soon',
      onPress: () => void openExternalTarget(WEB_PORTAL_URL, 'Web Portal'),
    },
  ];

  const support: DrawerItem[] = [
    { label: 'Contact', icon: 'mail', onPress: () => go('/contact') },
    {
      label: 'Feedback & Support',
      icon: 'alert',
      onPress: () => void openExternalTarget(USERJOT_URL, 'Feedback & Support'),
    },
    {
      label: 'Facebook Group',
      icon: 'facebook',
      onPress: () => void openExternalTarget(FACEBOOK_GROUP_URL, 'Facebook Group'),
    },
    { label: 'Guide', icon: 'help-circle', onPress: () => void openExternalTarget(GUIDE_URL, 'Guide') },
  ];

  const about: DrawerItem[] = [
    {
      label: 'Rate the App',
      icon: 'star',
      tint: tokens.colors.upgradeGold,
      onPress: () => void requestAppStoreReview(),
    },
    { label: "What's New", icon: 'notebook', onPress: () => go('/whats-new') },
    { label: 'About', icon: 'info', onPress: () => go('/about') },
  ];

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.scrim, { opacity: progress }]}>
        <Pressable
          accessibilityLabel="Close menu"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.panel,
          {
            width: DRAWER_WIDTH,
            paddingBottom: insets.bottom + 16,
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-DRAWER_WIDTH, 0],
                }),
              },
            ],
          },
        ]}
        {...closeResponder.panHandlers}
      >
        <ScrollView contentContainerStyle={styles.panelContent} showsVerticalScrollIndicator={false}>
          {/* Sits above the content so a rubber-band pull past the top reveals
              the header's red rather than the panel's white. */}
          <View accessible={false} pointerEvents="none" style={styles.overscroll} />
          <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
            <PlanCard
              containerStyle={styles.headerPlan}
              tone="accent"
              animalCount={animals.length}
              recordCount={records.length}
              recordLimit={FREE_RECORD_LIMIT}
              exportCount={Math.min(profile.exportsUsed ?? 0, FREE_EXPORT_LIMIT)}
              exportLimit={FREE_EXPORT_LIMIT}
              isPro={isPro}
              onUpgrade={() => go('/upgrade-to-pro')}
            />
          </View>

          <View style={styles.list}>
            <BackupNudgeCard containerStyle={styles.card} onBackUpNow={() => go('/settings')} />

            {destinations.map((item) => (
              <DrawerRow key={item.label} item={item} />
            ))}
            <View style={styles.divider} />
            {support.map((item) => (
              <DrawerRow key={item.label} item={item} />
            ))}
            <View style={styles.divider} />
            {about.map((item) => (
              <DrawerRow key={item.label} item={item} />
            ))}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function DrawerRow({ item }: { item: DrawerItem }) {
  return (
    <BouncyPressable
      accessibilityLabel={item.label}
      accessibilityRole="button"
      onPress={item.onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <AppIcon name={item.icon} size={23} color={item.tint ?? tokens.colors.text} />
      <Text style={[styles.rowLabel, item.tint ? { color: item.tint } : null]}>{item.label}</Text>
      {item.statusLabel ? <Text style={styles.rowStatus}>{item.statusLabel}</Text> : null}
    </BouncyPressable>
  );
}

async function openExternalTarget(url: string, label: string) {
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
  root: {
    flex: 1,
  },
  edgeGutter: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(23, 23, 23, 0.34)',
  },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: tokens.colors.surface,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    // Keeps the full-bleed header inside the panel's rounded corner.
    overflow: 'hidden',
  },
  // The plan runs edge to edge as the panel's own header, mirroring the red
  // top bar the drawer slides out from — so it carries no card chrome.
  header: {
    backgroundColor: tokens.colors.accent,
    paddingHorizontal: 18,
    paddingBottom: 20,
  },
  headerPlan: {
    marginHorizontal: 0,
    marginBottom: 0,
    padding: 0,
    backgroundColor: 'transparent',
    borderRadius: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  // No horizontal padding here: the header runs edge to edge, so the side
  // margin belongs to the list below it rather than to the whole scroll.
  panelContent: {
    paddingBottom: 24,
  },
  list: {
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  overscroll: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -600,
    height: 600,
    backgroundColor: tokens.colors.accent,
  },
  card: {
    marginHorizontal: 0,
    marginBottom: 16,
    // A little deeper than the card carries by default: on the panel's flat
    // white it is the only thing lifting it off the background.
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#D9D2D5',
    marginVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  rowLabel: {
    flex: 1,
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  rowStatus: {
    color: '#8A7F87',
    fontSize: 13,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.82,
  },
});
