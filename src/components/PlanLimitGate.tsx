import AsyncStorage from 'expo-sqlite/kv-store';
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../theme/text';

import {
  FREE_EXPORT_LIMIT,
  FREE_EXPORT_NUDGE_AT,
  FREE_RECORD_LIMIT,
  FREE_RECORD_NUDGE_AT,
} from '../constants/subscription';
import { useAccount } from '../context/AccountContext';
import { useRecords } from '../context/RecordsContext';
import { useSubscription } from '../context/SubscriptionContext';
import { tokens } from '../theme/tokens';
import { BouncyPressable } from './BouncyPressable';

const PLAN_LIMIT_NUDGE_KEY = 'livestockbook.planLimitNudge.v1';

type NudgeId = 'records' | 'exports';

type PlanLimitNudgeState = {
  /** Each nudge fires at most once, ever — a cap you already know about is
   * not news, and a modal that reappears on every visit reads as a fault. */
  shownNudges: NudgeId[];
};

function isValidState(value: unknown): value is PlanLimitNudgeState {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray((value as PlanLimitNudgeState).shownNudges)
  );
}

const NUDGE_COPY: Record<NudgeId, { title: string; body: (used: number, limit: number) => string }> = {
  records: {
    title: 'Running low on records',
    body: (used, limit) =>
      `You've saved ${used} of the ${limit} records included with the free plan. LivestockBook Pro removes the cap, so you can keep logging without ever stopping to make room.`,
  },
  exports: {
    title: 'Running low on exports',
    body: (used, limit) =>
      `You've used ${used} of the ${limit} exports included with the free plan. LivestockBook Pro removes the cap, so your PDFs and spreadsheets are there whenever an inspection or a vet asks for them.`,
  },
};

// Warns a Basic user before they hit a wall rather than at it — the paywall
// in add-record.tsx and the Export tab is the hard stop, and arriving there
// with no warning reads as the app breaking. Deliberately shown at most once
// per cap, and never to a Pro subscriber, who has no cap to run out of.
export function PlanLimitGate() {
  const router = useRouter();
  const { records } = useRecords();
  const { profile } = useAccount();
  const { isPro } = useSubscription();
  const isFocused = useIsFocused();
  const [nudge, setNudge] = useState<NudgeId | null>(null);
  const stateRef = useRef<PlanLimitNudgeState | null>(null);

  const recordCount = records.length;
  const exportCount = profile.exportsUsed ?? 0;

  useEffect(() => {
    if (!isFocused || isPro) {
      return;
    }

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PLAN_LIMIT_NUDGE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        const state: PlanLimitNudgeState = isValidState(parsed) ? parsed : { shownNudges: [] };

        // Exports first when both are due: it is the smaller allowance, so
        // it is the one about to bite.
        const candidates: { id: NudgeId; met: boolean }[] = [
          { id: 'exports', met: exportCount >= FREE_EXPORT_NUDGE_AT },
          { id: 'records', met: recordCount >= FREE_RECORD_NUDGE_AT },
        ];

        const next = candidates.find(
          (candidate) => candidate.met && !state.shownNudges.includes(candidate.id),
        )?.id;

        if (!next) {
          return;
        }

        const updated: PlanLimitNudgeState = { shownNudges: [...state.shownNudges, next] };
        await AsyncStorage.setItem(PLAN_LIMIT_NUDGE_KEY, JSON.stringify(updated));
        stateRef.current = updated;
        setNudge(next);
      } catch {
        // If storage can't be read or written, skip the nudge rather than
        // risk showing it again on every single screen visit.
      }
    })();
  }, [exportCount, isFocused, isPro, recordCount]);

  const handleUpgrade = () => {
    const limitType = nudge;
    setNudge(null);

    if (limitType) {
      router.push({ pathname: '/upgrade-to-pro', params: { limitType } });
    }
  };

  const copy = nudge ? NUDGE_COPY[nudge] : null;
  const used = nudge === 'exports' ? exportCount : recordCount;
  const limit = nudge === 'exports' ? FREE_EXPORT_LIMIT : FREE_RECORD_LIMIT;

  return (
    <Modal
      transparent
      animationType="none"
      visible={Boolean(nudge)}
      onRequestClose={() => setNudge(null)}
    >
      <Pressable style={styles.backdrop} onPress={() => setNudge(null)}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <Text style={styles.title}>{copy?.title ?? ''}</Text>
          <Text style={styles.body}>{copy ? copy.body(Math.min(used, limit), limit) : ''}</Text>
          <View style={styles.actions}>
            <BouncyPressable
              accessibilityLabel="Upgrade to Pro"
              accessibilityRole="button"
              containerStyle={{ flex: 1 }}
              onPress={handleUpgrade}
              style={({ pressed }) => [styles.upgradeButton, pressed && styles.pressed]}
            >
              <Text style={styles.upgradeButtonText}>Upgrade</Text>
            </BouncyPressable>
            <BouncyPressable
              accessibilityLabel="Not now"
              accessibilityRole="button"
              containerStyle={{ flex: 1 }}
              onPress={() => setNudge(null)}
              style={({ pressed }) => [styles.laterButton, pressed && styles.pressed]}
            >
              <Text style={styles.laterButtonText}>Not now</Text>
            </BouncyPressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Matches AppReviewGate's card exactly — same backdrop, radius, shadow and
// button pair. Two different popups in two different shapes would read as two
// different apps.
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.46)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 26,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  title: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    marginTop: 8,
    color: tokens.colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    width: '100%',
  },
  laterButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#E5E0E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterButtonText: {
    color: '#544F49',
    fontSize: 15,
    fontWeight: '700',
  },
  upgradeButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.9,
  },
});
