import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { requestAppStoreReview } from '../src/components/AppReviewGate';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { FREE_ANIMAL_LIMIT, FREE_RECORD_LIMIT } from '../src/constants/subscription';
import { useAccount } from '../src/context/AccountContext';
import type { AccountProfile } from '../src/entities/account';
import { useAnimals } from '../src/context/AnimalsContext';
import { useRecords } from '../src/context/RecordsContext';
import { useSubscription } from '../src/context/SubscriptionContext';
import { tokens } from '../src/theme/tokens';

const USERJOT_URL = 'https://livestockbook.userjot.com/?cursor=1&order=top&limit=10';
const FACEBOOK_GROUP_URL = 'https://www.facebook.com/groups/1353099223626390/';
const WEB_PORTAL_URL = 'https://livestockbook.app/';
// How long the backup reminder stays hidden after the user's last export,
// or after they dismiss it with "Remind me later".
const BACKUP_NUDGE_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

function shouldShowBackupNudge(profile: AccountProfile, recordCount: number) {
  if (recordCount === 0) {
    return false;
  }

  const now = Date.now();

  if (profile.backupNudgeSnoozedUntil) {
    const snoozedUntil = Date.parse(profile.backupNudgeSnoozedUntil);
    if (!Number.isNaN(snoozedUntil) && snoozedUntil > now) {
      return false;
    }
  }

  if (!profile.lastExportedAt) {
    return true;
  }

  const lastExportedAt = Date.parse(profile.lastExportedAt);
  return Number.isNaN(lastExportedAt) || now - lastExportedAt >= BACKUP_NUDGE_INTERVAL_MS;
}
type HubItem = {
  label: string;
  icon: AppIconName;
  onPress?: () => void;
  statusLabel?: string;
  accent?: 'premium' | 'danger';
};

export default function AccountScreen() {
  const router = useRouter();
  const { previewPro } = useLocalSearchParams<{ previewPro?: string }>();
  const { isLoaded, profile, updateField } = useAccount();
  const { animals } = useAnimals();
  const { records } = useRecords();
  const { isPro, loading: subscriptionLoading } = useSubscription();
  const displayedIsPro = isPro || (__DEV__ && previewPro === '1');
  const showBackupNudge = shouldShowBackupNudge(profile, records.length);

  const handleBackupSnooze = () => {
    updateField('backupNudgeSnoozedUntil', new Date(Date.now() + BACKUP_NUDGE_INTERVAL_MS).toISOString());
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/records');
  };

  if (!isLoaded || subscriptionLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <AppTopBar
          title="Account"
          leftAction={{
            icon: 'back',
            accessibilityLabel: 'Back',
            onPress: handleBack,
          }}
        />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={tokens.colors.accent} size="small" />
          <Text style={styles.loadingText}>Loading account</Text>
        </View>
      </SafeAreaView>
    );
  }

  const topItems: HubItem[] = [
    {
      label: 'Profile',
      icon: 'profile',
      onPress: () => router.push('/profile'),
    },
  ];

  const settingsItems: HubItem[] = [
    {
      label: 'Settings',
      icon: 'settings',
      onPress: () => router.push('/settings'),
    },
    {
      label: 'Reports',
      icon: 'bar-chart',
      onPress: () => router.push('/reports'),
    },
    {
      label: 'Web Portal',
      icon: 'web_portal',
      statusLabel: 'Coming soon',
      onPress: () => void openExternalTarget(WEB_PORTAL_URL, 'Web Portal'),
    },
  ];

  const communityItems: HubItem[] = [
    {
      label: 'Contact',
      icon: 'mail',
      onPress: () => router.push('/contact'),
    },
    {
      label: 'Feedback & Support',
      icon: 'alert',
      onPress: () => void openExternalTarget(USERJOT_URL, 'Feedback & Support'),
    },
    {
      label: 'Facebook Group',
      icon: 'group',
      onPress: () => void openExternalTarget(FACEBOOK_GROUP_URL, 'Facebook Group'),
    },
  ];

  const infoItems: HubItem[] = [
    {
      label: 'Rate the App',
      icon: 'star',
      onPress: () => void requestAppStoreReview(),
    },
    {
      label: "What's New",
      icon: 'notebook',
      onPress: () => router.push('/whats-new'),
    },
    {
      label: 'About',
      icon: 'info',
      onPress: () => router.push('/about'),
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <AppTopBar
        title="Account"
        leftAction={{
          icon: 'back',
          accessibilityLabel: 'Back',
          onPress: handleBack,
        }}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PlanCard
          animalCount={animals.length}
          animalLimit={FREE_ANIMAL_LIMIT}
          recordCount={records.length}
          recordLimit={FREE_RECORD_LIMIT}
          isPro={displayedIsPro}
          onUpgrade={() => router.push('/upgrade-to-pro')}
        />
        {showBackupNudge ? (
          <BackupNudgeCard
            onBackUpNow={() => router.push('/settings')}
            onSnooze={handleBackupSnooze}
          />
        ) : null}
        <SectionGroup items={topItems} />
        <SectionDivider />
        <SectionGroup items={settingsItems} />
        <SectionDivider />
        <SectionGroup items={communityItems} />
        <SectionDivider />
        <SectionGroup items={infoItems} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionGroup({ items }: { items: HubItem[] }) {
  return (
    <View style={styles.group}>
      {items.map((item) => {
        const isDisabled = !item.onPress;
        const isDanger = item.accent === 'danger';
        const isPremium = item.accent === 'premium';

        return (
          <BouncyPressable
            key={item.label}
            accessibilityLabel={item.label}
            accessibilityRole="button"
            disabled={isDisabled}
            onPress={item.onPress}
            style={({ pressed }) => [styles.row, pressed && !isDisabled && styles.pressed]}
          >
            <View style={styles.leftGroup}>
              <AppIcon
                name={item.icon}
                size={20}
                color={isDanger ? '#B64949' : isPremium ? '#C8A24A' : '#171717'}
              />
              <Text
                style={[
                  styles.label,
                  isDanger && styles.labelDanger,
                  isPremium && styles.labelPremium,
                ]}
              >
                {item.label}
              </Text>
            </View>
            {item.statusLabel ? <Text style={styles.status}>{item.statusLabel}</Text> : null}
          </BouncyPressable>
        );
      })}
    </View>
  );
}

function SectionDivider() {
  return <View style={styles.divider} />;
}

function BackupNudgeCard({ onBackUpNow, onSnooze }: { onBackUpNow: () => void; onSnooze: () => void }) {
  return (
    <View style={styles.backupCard}>
      <View style={styles.backupHeaderRow}>
        <AppIcon name="save" size={20} color={tokens.colors.text} />
        <Text style={styles.backupTitle}>Back up your farm data</Text>
      </View>
      <Text style={styles.backupSubtitle}>
        Your records live only on this device. Back up a copy so it can be restored later or moved to another device.
      </Text>
      <View style={styles.backupActionsRow}>
        <BouncyPressable
          accessibilityLabel="Back up now"
          accessibilityRole="button"
          containerStyle={styles.backupPrimaryButtonWrap}
          onPress={onBackUpNow}
          style={({ pressed }) => [styles.backupPrimaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.backupPrimaryButtonText}>Back Up Now</Text>
        </BouncyPressable>
        <BouncyPressable
          accessibilityLabel="Remind me later"
          accessibilityRole="button"
          onPress={onSnooze}
          style={({ pressed }) => [styles.backupSecondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.backupSecondaryButtonText}>Remind Me Later</Text>
        </BouncyPressable>
      </View>
    </View>
  );
}

type PlanCardProps = {
  animalCount: number;
  animalLimit: number;
  recordCount: number;
  recordLimit: number;
  isPro: boolean;
  onUpgrade: () => void;
};

function PlanCard({ animalCount, animalLimit, recordCount, recordLimit, isPro, onUpgrade }: PlanCardProps) {
  if (isPro) {
    return <ProPlanCard animalCount={animalCount} recordCount={recordCount} />;
  }

  return (
    <View style={styles.planCard}>
      <View style={styles.planHeaderRow}>
        <Text style={styles.planTitle}>Basic Plan</Text>
      </View>
      <Text style={styles.planSubtitle}>
        <Text style={styles.planSubtitleStar}>★</Text> Upgrade for unlimited animals and records.
      </Text>

      <PlanUsageRow label="Records" count={recordCount} limit={recordLimit} />
      <PlanUsageRow label="Animals" count={animalCount} limit={animalLimit} />

      <UpgradeButton onPress={onUpgrade} />
    </View>
  );
}

function ProPlanCard({ animalCount, recordCount }: { animalCount: number; recordCount: number }) {
  return (
    <View style={[styles.planCard, styles.proPlanCard]}>
      <View style={styles.proHeaderRow}>
        <View style={styles.proTitleGroup}>
          <View style={styles.proCrownWrap}>
            <AppIcon name="crown" size={17} color="#B68A24" />
          </View>
          <Text style={styles.proPlanTitle}>Pro Plan</Text>
        </View>
      </View>

      <Text style={styles.proSubtitle}>Unlimited animals and records.</Text>

      <View style={styles.proStatsRow}>
        <View style={styles.proStatBlock}>
          <Text style={styles.proStatValue}>{recordCount}</Text>
          <Text style={styles.proStatLabel}>Records</Text>
        </View>
        <View style={styles.proStatsDivider} />
        <View style={styles.proStatBlock}>
          <Text style={styles.proStatValue}>{animalCount}</Text>
          <Text style={styles.proStatLabel}>Animals</Text>
        </View>
      </View>
    </View>
  );
}

function UpgradeButton({ onPress }: { onPress: () => void }) {
  const shimmerX = useRef(new Animated.Value(-54)).current;
  const shimmerOpacity = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setReduceMotion(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion !== false) {
      shimmerX.stopAnimation();
      shimmerOpacity.stopAnimation();
      shimmerOpacity.setValue(0);
      return;
    }

    const runShimmer = () => {
      shimmerX.setValue(-54);
      shimmerOpacity.setValue(0);

      return Animated.parallel([
        Animated.timing(shimmerX, {
          toValue: 270,
          duration: 1050,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(shimmerOpacity, {
            toValue: 0.24,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.delay(560),
          Animated.timing(shimmerOpacity, {
            toValue: 0,
            duration: 270,
            useNativeDriver: true,
          }),
        ]),
      ]);
    };

    const firstPass = runShimmer();
    firstPass.start();

    return () => {
      firstPass.stop();
      shimmerX.stopAnimation();
      shimmerOpacity.stopAnimation();
    };
  }, [reduceMotion, shimmerOpacity, shimmerX]);

  return (
    <BouncyPressable
      accessibilityLabel="Upgrade to Pro"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.upgradeButton, pressed && styles.pressed]}
    >
      {reduceMotion === false ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.upgradeShimmer,
            { opacity: shimmerOpacity, transform: [{ translateX: shimmerX }, { skewX: '-18deg' }] },
          ]}
        />
      ) : null}
      <AppIcon name="crown" size={17} color="#fff" />
      <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
    </BouncyPressable>
  );
}

function PlanUsageRow({ label, count, limit }: { label: string; count: number; limit: number }) {
  const usageRatio = limit > 0 ? Math.min(count / limit, 1) : 0;

  return (
    <View style={styles.planUsageBlock}>
      <View style={styles.planUsageHeaderRow}>
        <Text style={styles.planUsageLabel}>{label}</Text>
        <Text style={styles.planUsageValue}>{count} of {limit}</Text>
      </View>
      <View style={styles.planUsageTrack}>
        <View style={[styles.planUsageFill, { width: `${usageRatio * 100}%` }]} />
      </View>
    </View>
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
  safeArea: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  content: {
    paddingTop: 18,
    paddingBottom: 120,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: tokens.colors.textSoft,
    fontSize: 14,
  },
  group: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  row: {
    minHeight: 52,
    paddingHorizontal: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexShrink: 1,
  },
  label: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '400',
  },
  labelPremium: {
    color: '#C8A24A',
  },
  labelDanger: {
    color: '#B64949',
  },
  status: {
    color: tokens.colors.muted,
    fontSize: 13,
    fontWeight: '400',
    marginLeft: 12,
  },
  planCard: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 20,
    marginHorizontal: 26,
    marginBottom: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  backupCard: {
    backgroundColor: 'rgba(182, 73, 73, 0.12)',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(182, 73, 73, 0.35)',
    marginHorizontal: 26,
    marginTop: 14,
    padding: 16,
  },
  backupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backupTitle: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  backupSubtitle: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  backupActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
  },
  backupPrimaryButtonWrap: {
    flex: 1,
  },
  backupPrimaryButton: {
    minHeight: 42,
    borderRadius: 21,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  backupPrimaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  backupSecondaryButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  backupSecondaryButtonText: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  proPlanCard: {
    position: 'relative',
    backgroundColor: '#FFF9EC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EADDBB',
    padding: 18,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  proHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  proTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  proCrownWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7E9BD',
  },
  proPlanTitle: {
    color: '#312817',
    fontSize: 18,
    fontWeight: '700',
  },
  proSubtitle: {
    color: '#74694F',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  proStatsRow: {
    minHeight: 76,
    borderRadius: 16,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E9D9AD',
  },
  proStatBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  proStatsDivider: {
    width: StyleSheet.hairlineWidth,
    height: 38,
    backgroundColor: '#DED0A9',
  },
  proStatValue: {
    color: '#312817',
    fontSize: 22,
    fontWeight: '700',
  },
  proStatLabel: {
    color: '#7A6D50',
    fontSize: 12,
    fontWeight: '500',
  },
  planHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planTitle: {
    color: tokens.colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  planSubtitle: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 14,
  },
  planSubtitleStar: {
    color: '#ffbb0d',
  },
  planUsageBlock: {
    marginBottom: 10,
  },
  planUsageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  planUsageLabel: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '400',
  },
  planUsageValue: {
    color: tokens.colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  planUsageTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: tokens.colors.surfaceMuted,
    overflow: 'hidden',
  },
  planUsageFill: {
    height: '100%',
    borderRadius: 1.5,
    backgroundColor: tokens.colors.accent,
  },
  upgradeButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 180,
    height: 52,
    borderRadius: 26,
    backgroundColor: tokens.colors.accent,
    paddingHorizontal: 32,
    marginTop: 18,
    overflow: 'hidden',
  },
  upgradeShimmer: {
    position: 'absolute',
    top: -12,
    bottom: -12,
    left: 0,
    width: 34,
    backgroundColor: '#FFFFFF',
  },
  upgradeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 26,
    marginVertical: 3,
    backgroundColor: '#CCCACC',
  },
  pressed: {
    opacity: 0.92,
  },
});
