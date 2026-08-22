import { useEffect, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { Text } from '../theme/text';

import { AppIcon } from './AppIcon';
import { BouncyPressable } from './BouncyPressable';
import { tokens } from '../theme/tokens';
import { FAST_AMBIENT_MOTION_DURATION, FAST_MOTION_DURATION } from '../utils/motion';

const UPGRADE_SHIMMER_DURATION = FAST_AMBIENT_MOTION_DURATION * 4;
const UPGRADE_SHIMMER_FADE_DURATION = FAST_MOTION_DURATION * 3;
const UPGRADE_SHIMMER_HOLD_DURATION = UPGRADE_SHIMMER_DURATION - UPGRADE_SHIMMER_FADE_DURATION * 2;

// Lives here rather than on the Account screen because the drawer shows the
// same card — one plan card, drawn from one place.
// 'light' is the card on a white page; 'accent' is the drawer's version, where
// the card doubles as the panel's coloured header and the upgrade button
// inverts to white so it still reads as the thing to press.
export type PlanCardTone = 'light' | 'accent';

type PlanCardProps = {
  containerStyle?: StyleProp<ViewStyle>;
  tone?: PlanCardTone;
  animalCount: number;
  recordCount: number;
  recordLimit: number;
  exportCount: number;
  exportLimit: number;
  isPro: boolean;
  onUpgrade: () => void;
};

export function PlanCard({
  containerStyle,
  tone = 'light',
  animalCount,
  recordCount,
  recordLimit,
  exportCount,
  exportLimit,
  isPro,
  onUpgrade,
}: PlanCardProps) {
  if (isPro) {
    return <ProPlanCard containerStyle={containerStyle} animalCount={animalCount} recordCount={recordCount} />;
  }

  const isAccent = tone === 'accent';

  return (
    <View style={[styles.planCard, isAccent && styles.planCardAccent, containerStyle]}>
      <View style={[styles.planHeaderRow, isAccent && styles.planHeaderRowAccent]}>
        <Text style={[styles.planTitle, isAccent && styles.planTitleAccent]}>Free Plan</Text>
      </View>
      {isAccent ? null : (
        // The drawer's header says it with the button alone — the line reads as
        // sales copy in a menu.
        <Text style={styles.planSubtitle}>
          <Text style={styles.planSubtitleStar}>★</Text> Upgrade for unlimited records and exports.
        </Text>
      )}

      <PlanUsageRow label="Records" count={recordCount} limit={recordLimit} tone={tone} />
      <PlanUsageRow label="Exports" count={exportCount} limit={exportLimit} tone={tone} />

      <UpgradeButton onPress={onUpgrade} tone={tone} />
    </View>
  );
}

function ProPlanCard({
  containerStyle,
  animalCount,
  recordCount,
}: {
  containerStyle?: StyleProp<ViewStyle>;
  animalCount: number;
  recordCount: number;
}) {
  return (
    <View style={[styles.planCard, styles.proPlanCard, containerStyle]}>
      <View style={styles.proHeaderRow}>
        <View style={styles.proTitleGroup}>
          <View style={styles.proCrownWrap}>
            <AppIcon name="crown" size={17} color="#B68A24" />
          </View>
          <Text style={styles.proPlanTitle}>Pro Plan</Text>
        </View>
      </View>

      <Text style={styles.proSubtitle}>Unlimited records and exports.</Text>

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

function UpgradeButton({ onPress, tone }: { onPress: () => void; tone: PlanCardTone }) {
  const isAccent = tone === 'accent';
  const [shimmerX] = useState(() => new Animated.Value(-54));
  const [shimmerOpacity] = useState(() => new Animated.Value(0));
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
          duration: UPGRADE_SHIMMER_DURATION,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(shimmerOpacity, {
            toValue: 0.24,
            duration: UPGRADE_SHIMMER_FADE_DURATION,
            useNativeDriver: true,
          }),
          Animated.delay(UPGRADE_SHIMMER_HOLD_DURATION),
          Animated.timing(shimmerOpacity, {
            toValue: 0,
            duration: UPGRADE_SHIMMER_FADE_DURATION,
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
      style={({ pressed }) => [styles.upgradeButton, isAccent && styles.upgradeButtonAccent, pressed && styles.pressed]}
    >
      {reduceMotion === false ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.upgradeShimmer,
            isAccent && styles.upgradeShimmerAccent,
            { opacity: shimmerOpacity, transform: [{ translateX: shimmerX }, { skewX: '-18deg' }] },
          ]}
        />
      ) : null}
      <AppIcon
        name="crown"
        size={isAccent ? 23 : 17}
        color={isAccent ? tokens.colors.upgradeGold : '#fff'}
      />
      <Text style={[styles.upgradeButtonText, isAccent && styles.upgradeButtonTextAccent]}>Upgrade to Pro</Text>
    </BouncyPressable>
  );
}

function PlanUsageRow({
  label,
  count,
  limit,
  tone,
}: {
  label: string;
  count: number;
  limit: number;
  tone: PlanCardTone;
}) {
  const usageRatio = limit > 0 ? Math.min(count / limit, 1) : 0;
  const isAccent = tone === 'accent';

  return (
    <View style={styles.planUsageBlock}>
      <View style={styles.planUsageHeaderRow}>
        <Text style={[styles.planUsageLabel, isAccent && styles.planUsageLabelAccent]}>{label}</Text>
        <Text style={[styles.planUsageValue, isAccent && styles.planUsageValueAccent]}>{count} of {limit}</Text>
      </View>
      <View style={[styles.planUsageTrack, isAccent && styles.planUsageTrackAccent]}>
        <View style={[styles.planUsageFill, isAccent && styles.planUsageFillAccent, { width: `${usageRatio * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  planCardAccent: {
    backgroundColor: tokens.colors.accent,
  },
  planTitleAccent: {
    color: '#fff',
  },
  // Stands in for the spacing the subtitle used to provide.
  planHeaderRowAccent: {
    marginBottom: 14,
  },
  planSubtitleAccent: {
    color: 'rgba(255, 255, 255, 0.86)',
  },
  planSubtitleStarAccent: {
    color: '#FFD873',
  },
  planUsageLabelAccent: {
    color: '#fff',
  },
  planUsageValueAccent: {
    color: 'rgba(255, 255, 255, 0.86)',
  },
  planUsageTrackAccent: {
    backgroundColor: 'rgba(255, 255, 255, 0.32)',
  },
  planUsageFillAccent: {
    backgroundColor: '#fff',
  },
  upgradeButtonAccent: {
    backgroundColor: '#fff',
  },
  upgradeButtonTextAccent: {
    // The crown's gold, so mark and label read as one.
    color: tokens.colors.upgradeGold,
  },
  upgradeShimmerAccent: {
    backgroundColor: tokens.colors.accent,
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
  pressed: {
    opacity: 0.92,
  },
});
