import AsyncStorage from 'expo-sqlite/kv-store';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../theme/text';

import { useAccount } from '../context/AccountContext';
import { useAnimals } from '../context/AnimalsContext';
import { useRecords } from '../context/RecordsContext';
import { tokens } from '../theme/tokens';
import { BouncyPressable } from './BouncyPressable';

// expo-store-review is a native module. A plain `import` throws at
// module-load time (crashing every screen that renders this component, not
// just the review flow itself) whenever the native module isn't linked into
// the running binary yet — e.g. right after `npx expo install` but before
// the next native rebuild. Deferring it behind `require` inside a try/catch
// degrades to the App Store link fallback instead of taking the app down.
let StoreReview: typeof import('expo-store-review') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  StoreReview = require('expo-store-review');
} catch {
  StoreReview = null;
}

const REVIEW_GATE_STATE_KEY = 'livestockbook.reviewGateState.v2';
// Hardcoded rather than read via StoreReview.storeUrl(): that reads from
// Constants.expoConfig, which is embedded into the native binary at build
// time — it would silently stay null until the next native rebuild even
// though app.json already has the right value. A static URL has no such gap.
const APP_STORE_URL = 'https://apps.apple.com/gb/app/livestockbook-animal-records/id6790605803';

// Shared by the prompt below and the dedicated "Rate the App" button on the
// Account screen — both end in the same place: the native in-app rating
// sheet (Apple's own StoreKit review UI) where available, else a direct App
// Store link.
export async function requestAppStoreReview() {
  try {
    if (StoreReview && (await StoreReview.isAvailableAsync())) {
      await StoreReview.requestReview();
      return;
    }
  } catch {
    // Native prompt failed (or the OS silently declined — it's throttled
    // to a few times a year) — fall through to the direct App Store link.
  }

  try {
    await Linking.openURL(`${APP_STORE_URL}?action=write-review`);
  } catch {
    // Nothing actionable left to do if even the direct link fails.
  }
}

const TENTH_RECORD_COUNT = 10;
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

type TriggerId = 'tenthRecord' | 'firstExport' | 'activeTenDays';

type ReviewGateState = {
  /** Anchors the "active use after 10 days" trigger. */
  firstSeenAt: string;
  /** Each trigger opportunity fires at most once, ever. */
  shownTriggers: TriggerId[];
  /** Set once they tap "Rate" — stops the gate for good. */
  respondedRate: boolean;
};

function isValidState(value: unknown): value is ReviewGateState {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as ReviewGateState).firstSeenAt === 'string' &&
    Array.isArray((value as ReviewGateState).shownTriggers) &&
    typeof (value as ReviewGateState).respondedRate === 'boolean'
  );
}

// Apple's guidance is explicit: don't pose questions before the rating
// prompt, and don't require a declaration of sentiment before letting
// someone rate. So this screen only ever explains why we're asking — the
// actual rating UI is Apple's own StoreKit sheet, invoked by "Rate".
//
// Three independent trigger opportunities, each shown at most once:
//  1. The user has just saved their 10th record — enough usage to have an
//     opinion, but caught in the moment of exactly recording it.
//  2. The user has just completed their first successful export — a
//     natural "this is working for me" moment.
//  3. The user has been actively using the app for 10+ days (has both
//     animals and records on file, not just an idle install).
// A tap on "Rate" cancels all remaining opportunities for good; "Maybe
// later" only dismisses the one that just fired.
export function AppReviewGate({ onVisibilityChange }: { onVisibilityChange?: (visible: boolean) => void } = {}) {
  const { animals } = useAnimals();
  const { records } = useRecords();
  const { profile } = useAccount();
  const isFocused = useIsFocused();
  const [visible, setVisible] = useState(false);
  const stateRef = useRef<ReviewGateState | null>(null);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(REVIEW_GATE_STATE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        const existingState = isValidState(parsed) ? parsed : null;

        if (existingState?.respondedRate) {
          return;
        }

        const state: ReviewGateState = existingState ?? {
          firstSeenAt: new Date().toISOString(),
          shownTriggers: [],
          respondedRate: false,
        };

        const elapsedSinceFirstSeen = Date.now() - Date.parse(state.firstSeenAt);
        const alreadyShown = (trigger: TriggerId) => state.shownTriggers.includes(trigger);

        // Priority order only matters for picking one trigger to show when
        // more than one condition happens to be true at once — each still
        // fires (at most once) on its own regardless of the others.
        const candidates: Array<{ id: TriggerId; met: boolean }> = [
          { id: 'tenthRecord', met: records.length >= TENTH_RECORD_COUNT },
          { id: 'firstExport', met: Boolean(profile.lastExportedAt) },
          {
            id: 'activeTenDays',
            met: elapsedSinceFirstSeen >= TEN_DAYS_MS && animals.length > 0 && records.length > 0,
          },
        ];

        const nextTrigger = candidates.find((candidate) => candidate.met && !alreadyShown(candidate.id))?.id ?? null;

        if (!nextTrigger) {
          // Nothing due yet — still persist the firstSeenAt stamp the first
          // time this ever runs, so the 10-day clock has an anchor.
          if (!existingState) {
            await AsyncStorage.setItem(REVIEW_GATE_STATE_KEY, JSON.stringify(state));
            stateRef.current = state;
          }
          return;
        }

        const next: ReviewGateState = { ...state, shownTriggers: [...state.shownTriggers, nextTrigger] };
        await AsyncStorage.setItem(REVIEW_GATE_STATE_KEY, JSON.stringify(next));
        stateRef.current = next;
        setVisible(true);
      } catch {
        // If storage can't be read/written, skip rather than risk showing
        // this repeatedly on every screen visit.
      }
    })();
  }, [animals.length, records.length, profile.lastExportedAt, isFocused]);

  // Lets the host screen hold back any other popup of its own while this one
  // owns the screen — two modals presenting at the same instant stack badly
  // (see PlanLimitGate, which the Records tab defers on this).
  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [onVisibilityChange, visible]);

  const handleRate = async () => {
    setVisible(false);

    if (stateRef.current) {
      const next: ReviewGateState = { ...stateRef.current, respondedRate: true };
      stateRef.current = next;
      try {
        await AsyncStorage.setItem(REVIEW_GATE_STATE_KEY, JSON.stringify(next));
      } catch {
        // Worst case this asks again on the next opportunity — not worth
        // failing the tap over.
      }
    }

    await requestAppStoreReview();
  };

  const handleMaybeLater = () => {
    setVisible(false);
  };

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={() => setVisible(false)}>
      <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <Text style={styles.title}>Enjoying LivestockBook?</Text>
          <Text style={styles.body}>
            If LivestockBook is helping you manage your animals, a quick rating on the App Store would really
            help us.
          </Text>
          <View style={styles.actions}>
            <BouncyPressable
              accessibilityLabel="Rate LivestockBook"
              accessibilityRole="button"
              containerStyle={{ flex: 1 }}
              onPress={() => void handleRate()}
              style={({ pressed }) => [styles.rateButton, pressed && styles.pressed]}
            >
              <Text style={styles.rateButtonText}>Rate</Text>
            </BouncyPressable>
            <BouncyPressable
              accessibilityLabel="Maybe later"
              accessibilityRole="button"
              containerStyle={{ flex: 1 }}
              onPress={handleMaybeLater}
              style={({ pressed }) => [styles.laterButton, pressed && styles.pressed]}
            >
              <Text style={styles.laterButtonText}>Maybe later</Text>
            </BouncyPressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

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
  rateButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.9,
  },
});
