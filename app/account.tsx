import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../src/theme/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '../src/components/AppIcon';
import { AppTopBar } from '../src/components/AppTopBar';
import { BackupNudgeCard } from '../src/components/BackupNudgeCard';
import { PlanCard } from '../src/components/PlanCard';
import { BouncyPressable } from '../src/components/BouncyPressable';
import { FREE_EXPORT_LIMIT, FREE_RECORD_LIMIT } from '../src/constants/subscription';
import { useAccount } from '../src/context/AccountContext';
import { useAnimals } from '../src/context/AnimalsContext';
import { useRecords } from '../src/context/RecordsContext';
import { useSubscription } from '../src/context/SubscriptionContext';
import { tokens } from '../src/theme/tokens';

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
  const { isLoaded, profile } = useAccount();
  const { animals } = useAnimals();
  const { records } = useRecords();
  const { isPro, loading: subscriptionLoading } = useSubscription();
  const displayedIsPro = isPro || (__DEV__ && previewPro === '1');

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
          recordCount={records.length}
          recordLimit={FREE_RECORD_LIMIT}
          exportCount={Math.min(profile.exportsUsed ?? 0, FREE_EXPORT_LIMIT)}
          exportLimit={FREE_EXPORT_LIMIT}
          isPro={displayedIsPro}
          onUpgrade={() => router.push('/upgrade-to-pro')}
        />
        <BackupNudgeCard onBackUpNow={() => router.push('/settings')} />
        <SectionGroup items={topItems} />
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
                size={23}
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
