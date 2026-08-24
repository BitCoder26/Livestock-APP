import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { AppIcon } from './AppIcon';
import type { AppDateFormat } from '../entities/account';
import { Text } from '../theme/text';
import { tokens } from '../theme/tokens';
import { formatWithdrawalLine, type ActiveWithdrawal } from '../utils/withdrawal';

// Amber rather than the app's danger red: an animal inside its withdrawal is
// not an error to be fixed, it is a date to wait out.
const WITHDRAWAL_BACKGROUND = '#FBF0CE';
const WITHDRAWAL_TEXT = '#6E5510';

/**
 * Card-sized marker. Says only that a period is running, not which or until
 * when — a list row has no space for a date, and the animal's own screen is
 * one tap away for the detail.
 */
export function WithdrawalPill({
  withdrawals,
  style,
}: {
  withdrawals: ActiveWithdrawal[];
  style?: StyleProp<ViewStyle>;
}) {
  if (withdrawals.length === 0) {
    return null;
  }

  return (
    <View accessibilityLabel="In withdrawal" style={[styles.pill, style]}>
      <AppIcon name="medicine" size={12} color={WITHDRAWAL_TEXT} />
      <Text style={styles.pillText}>In withdrawal</Text>
    </View>
  );
}

/**
 * Detail-screen form: one line per kind, each naming the day it comes clear.
 * Meat and milk are separate rules and can run to different dates, so they are
 * never collapsed into a single "in withdrawal until".
 */
export function WithdrawalBanner({
  withdrawals,
  dateFormat,
  style,
}: {
  withdrawals: ActiveWithdrawal[];
  dateFormat: AppDateFormat;
  style?: StyleProp<ViewStyle>;
}) {
  if (withdrawals.length === 0) {
    return null;
  }

  return (
    <View style={[styles.banner, style]}>
      <AppIcon name="medicine" size={18} color={WITHDRAWAL_TEXT} />
      <View style={styles.bannerCopy}>
        {withdrawals.map((withdrawal) => (
          <Text key={withdrawal.kind} style={styles.bannerText}>
            {formatWithdrawalLine(withdrawal, dateFormat)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: WITHDRAWAL_BACKGROUND,
  },
  pillText: {
    color: WITHDRAWAL_TEXT,
    fontSize: 12,
    fontWeight: '700',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: tokens.radius.sm,
    backgroundColor: WITHDRAWAL_BACKGROUND,
  },
  bannerCopy: {
    flex: 1,
    gap: 2,
  },
  bannerText: {
    color: WITHDRAWAL_TEXT,
    fontSize: 13,
    fontWeight: '600',
  },
});
