import AsyncStorage from 'expo-sqlite/kv-store';
import { router } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import type { PropsWithChildren, RefObject } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { View } from 'react-native';

import type { SpotlightRect } from '../components/OnboardingSpotlight';
import { useAnimals } from './AnimalsContext';
import { useRecords } from './RecordsContext';
import { useSetup } from './SetupContext';

export type OnboardingStep = 'welcome' | 'setup' | 'animal' | 'record' | 'done';

export type SpotlightTarget = { step: OnboardingStep; rect: SpotlightRect };

type OnboardingState = {
  step: OnboardingStep;
  knownFarms: string[];
  knownAnimals: string[];
  knownRecords: string[];
};

type OnboardingContextValue = {
  isReady: boolean;
  step: OnboardingStep;
  startSetup: () => void;
  finishOnboarding: () => void;
  /** Window-coordinate rect of the element the active step's spotlight highlights. */
  spotlightTarget: SpotlightTarget | null;
  setSpotlightTarget: (target: SpotlightTarget | null) => void;
};

const ONBOARDING_STORAGE_KEY = 'livestockbook.onboarding.v1';
// Present on any install that has already run the app before onboarding shipped.
const EXISTING_INSTALL_PROBE_KEY = 'livestockbook.animals.v1';

const ONBOARDING_STEPS: OnboardingStep[] = ['welcome', 'setup', 'animal', 'record', 'done'];

const DONE_STATE: OnboardingState = {
  step: 'done',
  knownFarms: [],
  knownAnimals: [],
  knownRecords: [],
};

const WELCOME_STATE: OnboardingState = {
  step: 'welcome',
  knownFarms: [],
  knownAnimals: [],
  knownRecords: [],
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

// Read at module-import time, before any provider mounts: the other contexts
// persist their seed data as soon as they load, so a probe issued from an
// effect can mistake a brand-new install for an existing one.
const initialStateProbe: Promise<OnboardingState> = (async () => {
  try {
    const [storedOnboarding, existingInstall] = await Promise.all([
      AsyncStorage.getItem(ONBOARDING_STORAGE_KEY),
      AsyncStorage.getItem(EXISTING_INSTALL_PROBE_KEY),
    ]);

    if (storedOnboarding) {
      const parsed: unknown = JSON.parse(storedOnboarding);

      if (isStoredOnboarding(parsed)) {
        return parsed;
      }
    }

    return existingInstall !== null ? DONE_STATE : WELCOME_STATE;
  } catch (error) {
    // A virgin database has no storage table yet, so the read throws on the
    // very install that should see onboarding.
    if (error instanceof Error && error.message.includes('no such table')) {
      return WELCOME_STATE;
    }

    // Skip onboarding rather than trap the user if storage cannot be read.
    return DONE_STATE;
  }
})();

export function OnboardingProvider({ children }: PropsWithChildren) {
  const { farms } = useSetup();
  const { animals } = useAnimals();
  const { records } = useRecords();
  const posthog = usePostHog();
  const [state, setState] = useState<OnboardingState>(DONE_STATE);
  const [isReady, setIsReady] = useState(false);
  const [spotlightTarget, setSpotlightTarget] = useState<SpotlightTarget | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const queueNavigation = (navigate: () => void, delay: number) => {
    timersRef.current.push(setTimeout(navigate, delay));
  };

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    void initialStateProbe.then((initialState) => {
      if (isActive) {
        setState(initialState);
        setIsReady(true);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    // Probe fallbacks (shared constants) are re-derived on every launch, and
    // persisting one would lock in a transient storage failure as "done".
    // Only user-driven transitions, which always produce fresh objects, are saved.
    if (state === DONE_STATE || state === WELCOME_STATE) {
      return;
    }

    void AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state)).catch(() => {
      // Keep the current in-memory step; the next transition will retry persistence.
    });
  }, [isReady, state]);

  useEffect(() => {
    if (!isReady || state.step === 'welcome' || state.step === 'done') {
      return;
    }

    if (state.step === 'setup' && farms.some((name) => !state.knownFarms.includes(name))) {
      setState({
        step: 'animal',
        knownFarms: state.knownFarms,
        knownAnimals: animals.map((animal) => animal.id),
        knownRecords: state.knownRecords,
      });
      posthog?.capture('onboarding_farm_added');
      queueNavigation(() => {
        // Leave the pushed setup screen before switching tabs, otherwise
        // navigate stacks a duplicate tabs navigator on top of it.
        if (router.canDismiss()) {
          router.dismissAll();
        }
        router.navigate('/(tabs)/animals');
      }, 900);
      return;
    }

    if (state.step === 'animal' && animals.some((animal) => !state.knownAnimals.includes(animal.id))) {
      setState({
        step: 'record',
        knownFarms: state.knownFarms,
        knownAnimals: state.knownAnimals,
        knownRecords: records.map((record) => record.id),
      });
      posthog?.capture('onboarding_first_animal_added');
      queueNavigation(() => {
        if (router.canDismiss()) {
          router.dismissAll();
        }
        router.navigate('/(tabs)/records');
      }, 600);
      return;
    }

    if (state.step === 'record' && records.some((record) => !state.knownRecords.includes(record.id))) {
      setState({ ...DONE_STATE });
      posthog?.capture('onboarding_completed', { via: 'first_record' });
    }
  }, [animals, farms, isReady, posthog, records, state]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      isReady,
      step: state.step,
      startSetup: () => {
        setState({
          step: 'setup',
          knownFarms: farms,
          knownAnimals: animals.map((animal) => animal.id),
          knownRecords: records.map((record) => record.id),
        });
        posthog?.capture('onboarding_started');
        router.replace('/(tabs)/setup');
      },
      finishOnboarding: () => {
        setState({ ...DONE_STATE });
        posthog?.capture('onboarding_completed', { via: 'dismissed' });
      },
      spotlightTarget,
      setSpotlightTarget,
    }),
    [animals, farms, isReady, posthog, records, spotlightTarget, state.step],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

function isStoredOnboarding(value: unknown): value is OnboardingState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const state = value as Partial<OnboardingState>;
  return (
    typeof state.step === 'string' &&
    ONBOARDING_STEPS.includes(state.step) &&
    Array.isArray(state.knownFarms) &&
    Array.isArray(state.knownAnimals) &&
    Array.isArray(state.knownRecords)
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);

  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }

  return context;
}

/**
 * While `active`, repeatedly measures `ref` in window coordinates and publishes
 * it as the spotlight target for `step`. Re-measuring matters: a one-shot
 * measure can capture the tab scene mid-transition (translated a full screen
 * width) and pin the spotlight off-screen.
 */
export function useSpotlightTarget(step: OnboardingStep, active: boolean, ref: RefObject<View | null>) {
  const { setSpotlightTarget } = useOnboarding();

  useEffect(() => {
    if (!active) {
      return;
    }

    let last: SpotlightRect | null = null;
    const measure = () => {
      ref.current?.measureInWindow((x, y, width, height) => {
        if (width <= 0 || height <= 0) {
          return;
        }

        if (last && Math.abs(last.x - x) < 0.5 && Math.abs(last.y - y) < 0.5) {
          return;
        }

        last = { x, y, width, height };
        setSpotlightTarget({ step, rect: last });
      });
    };

    // First shot after the tab transition normally settles, then keep the
    // rect honest against late layout shifts.
    const initial = setTimeout(measure, 420);
    const interval = setInterval(measure, 350);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      setSpotlightTarget(null);
    };
  }, [active, ref, setSpotlightTarget, step]);
}
