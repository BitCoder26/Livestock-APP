import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { FREE_ANIMAL_LIMIT, FREE_RECORD_LIMIT } from '../src/constants/subscription';
import { useAccount } from '../src/context/AccountContext';
import { useAnimals } from '../src/context/AnimalsContext';
import { useRecords } from '../src/context/RecordsContext';
import { useSubscription } from '../src/context/SubscriptionContext';
import { tokens } from '../src/theme/tokens';

const USERJOT_URL = 'https://livestockbook.userjot.com/?cursor=1&order=top&limit=10';
const FACEBOOK_GROUP_URL = 'https://www.facebook.com/groups/1353099223626390/';
const WEB_PORTAL_URL = 'https://livestockbook.app/';
type HubItem = {
  label: string;
  icon: AppIconName;
  onPress?: () => void;
  statusLabel?: string;
  accent?: 'premium' | 'danger';
};

export default function AccountScreen() {
  const router = useRouter();
  const { profile, isLoaded, signOutAllDevices } = useAccount();
  const { animals } = useAnimals();
  const { records } = useRecords();
  const { isPro } = useSubscription();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/records');
  };

  if (!isLoaded) {
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
      label: 'Analytics',
      icon: 'pie-chart',
      onPress: () => undefined,
      statusLabel: 'Coming Soon',
    },
    {
      label: 'Web Portal',
      icon: 'web_portal',
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
      label: 'Feedback & Suggestions',
      icon: 'alert',
      onPress: () => void openExternalTarget(USERJOT_URL, 'Feedback & Suggestions'),
    },
    {
      label: 'Facebook Group',
      icon: 'group',
      onPress: () => void openExternalTarget(FACEBOOK_GROUP_URL, 'Facebook Group'),
    },
  ];

  const infoItems: HubItem[] = [
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

  const signOutItems: HubItem[] = [
    {
      label: isSigningOut ? 'Signing Out...' : 'Sign Out',
      icon: 'enter-arrow',
      onPress: () => {
        if (isSigningOut) {
          return;
        }

        Alert.alert('Sign Out', 'Sign out of all devices?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign Out',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setIsSigningOut(true);

                try {
                  const result = await signOutAllDevices();
                  Alert.alert('Sign Out', result.message);
                } finally {
                  setIsSigningOut(false);
                }
              })();
            },
          },
        ]);
      },
      accent: 'danger',
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
          isPro={isPro}
          onUpgrade={() => router.push('/upgrade-to-pro')}
        />
        <SectionGroup items={topItems} />
        <SectionDivider />
        <SectionGroup items={settingsItems} />
        <SectionDivider />
        <SectionGroup items={communityItems} />
        <SectionDivider />
        <SectionGroup items={infoItems} />
        <SectionDivider />
        <SectionGroup items={signOutItems} />
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

type PlanCardProps = {
  animalCount: number;
  animalLimit: number;
  recordCount: number;
  recordLimit: number;
  isPro: boolean;
  onUpgrade: () => void;
};

function PlanCard({ animalCount, animalLimit, recordCount, recordLimit, isPro, onUpgrade }: PlanCardProps) {
  return (
    <View style={styles.planCard}>
      <View style={styles.planHeaderRow}>
        <Text style={styles.planTitle}>{isPro ? 'Pro Plan' : 'Basic Plan'}</Text>
      </View>
      <Text style={styles.planSubtitle}>
        <Text style={styles.planSubtitleStar}>★</Text>{' '}
        {isPro ? 'Unlimited animals and records are active.' : 'Upgrade for unlimited animals and records.'}
      </Text>

      <PlanUsageRow label="Records" count={recordCount} limit={recordLimit} isUnlimited={isPro} />
      <PlanUsageRow label="Animals" count={animalCount} limit={animalLimit} isUnlimited={isPro} />

      {!isPro ? (
        <BouncyPressable
          accessibilityLabel="Upgrade to Pro"
          accessibilityRole="button"
          onPress={onUpgrade}
          style={({ pressed }) => [styles.upgradeButton, pressed && styles.pressed]}
        >
          <AppIcon name="crown" size={17} color="#fff" />
          <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
        </BouncyPressable>
      ) : null}
    </View>
  );
}

function PlanUsageRow({ label, count, limit, isUnlimited }: { label: string; count: number; limit: number; isUnlimited: boolean }) {
  const usageRatio = limit > 0 ? Math.min(count / limit, 1) : 0;

  return (
    <View style={styles.planUsageBlock}>
      <View style={styles.planUsageHeaderRow}>
        <Text style={styles.planUsageLabel}>{label}</Text>
        <Text style={styles.planUsageValue}>{isUnlimited ? `${count} total` : `${count} of ${limit}`}</Text>
      </View>
      <View style={styles.planUsageTrack}>
        <View style={[styles.planUsageFill, { width: `${isUnlimited ? 100 : usageRatio * 100}%` }]} />
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
