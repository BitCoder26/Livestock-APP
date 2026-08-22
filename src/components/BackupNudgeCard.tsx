import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { Text } from '../theme/text';

import { AppIcon } from './AppIcon';
import { BouncyPressable } from './BouncyPressable';
import { useAccount } from '../context/AccountContext';
import { useRecords } from '../context/RecordsContext';
import type { AccountProfile } from '../entities/account';
import { tokens } from '../theme/tokens';

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

// Decides for itself whether it is due, so the surface showing it only has to
// place it. Renders nothing when the reminder is snoozed or not yet earned.
export function BackupNudgeCard({
  containerStyle,
  onBackUpNow,
}: {
  containerStyle?: StyleProp<ViewStyle>;
  onBackUpNow: () => void;
}) {
  const { profile, updateField } = useAccount();
  const { records } = useRecords();

  if (!shouldShowBackupNudge(profile, records.length)) {
    return null;
  }

  const handleSnooze = () => {
    updateField('backupNudgeSnoozedUntil', new Date(Date.now() + BACKUP_NUDGE_INTERVAL_MS).toISOString());
  };

  return (
    <View style={[styles.backupCard, containerStyle]}>
      <View style={styles.backupHeaderRow}>
        <AppIcon name="save" size={23} color={tokens.colors.text} />
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
          onPress={handleSnooze}
          style={({ pressed }) => [styles.backupSecondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.backupSecondaryButtonText}>Remind Me Later</Text>
        </BouncyPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  pressed: {
    opacity: 0.92,
  },
});
