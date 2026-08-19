import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  getCollectiveCount,
  type Collective,
  type CollectiveCountEvent,
  type CollectiveStatus,
} from '../entities/collective';

export type CreateCollectiveInput = Omit<Collective, 'uid'>;

export type CollectiveMutationResult =
  | { ok: true; collective: Collective }
  | { ok: false; message: string };

export type CollectiveDeleteResult = { ok: true } | { ok: false; message: string };

type CollectivesContextValue = {
  collectives: Collective[];
  isLoaded: boolean;
  addCollective: (collective: CreateCollectiveInput) => Promise<CollectiveMutationResult>;
  updateCollective: (
    collectiveUid: string,
    collective: CreateCollectiveInput,
  ) => Promise<CollectiveMutationResult>;
  deleteCollective: (collectiveUid: string) => Promise<CollectiveDeleteResult>;
  resetCollectives: () => Promise<CollectiveDeleteResult>;
  /** Appends a dated count change — the only way the head count moves. */
  addCountEvent: (
    collectiveUid: string,
    event: Omit<CollectiveCountEvent, 'id'>,
  ) => Promise<CollectiveMutationResult>;
  getCollectivesSnapshot: () => Collective[];
  replaceCollectivesFromTransaction: (nextCollectives: Collective[]) => void;
};

const CollectivesContext = createContext<CollectivesContextValue | null>(null);

export const COLLECTIVES_STORAGE_KEY = 'livestockbook.collectives.v1';

function createUid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isStoredCollective(value: unknown): value is Collective {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const collective = value as Partial<Collective>;
  return typeof collective.uid === 'string' && typeof collective.species === 'string';
}

export function normalizeStoredCollective(
  collective: Collective,
  usedUids: Set<string>,
): Collective {
  let uid = typeof collective.uid === 'string' && collective.uid ? collective.uid : createUid('col');

  while (usedUids.has(uid)) {
    uid = createUid('col');
  }

  usedUids.add(uid);

  const countEvents = Array.isArray(collective.countEvents)
    ? collective.countEvents
        .filter(
          (event): event is CollectiveCountEvent =>
            !!event && typeof event === 'object' && typeof event.delta === 'number',
        )
        .map((event) => ({
          id: typeof event.id === 'string' && event.id ? event.id : createUid('cev'),
          date: typeof event.date === 'string' ? event.date : '',
          delta: Number.isFinite(event.delta) ? event.delta : 0,
          reason: event.reason ?? 'Correction',
          notes: typeof event.notes === 'string' ? event.notes : '',
        }))
    : [];

  const status: CollectiveStatus = collective.status === 'Closed' ? 'Closed' : 'Active';

  return {
    ...collective,
    uid,
    id: typeof collective.id === 'string' ? collective.id : '',
    name: typeof collective.name === 'string' ? collective.name : '',
    species: typeof collective.species === 'string' ? collective.species : '',
    breed: typeof collective.breed === 'string' ? collective.breed : '',
    status,
    farm: typeof collective.farm === 'string' ? collective.farm : '',
    paddock: typeof collective.paddock === 'string' ? collective.paddock : '',
    startDate: typeof collective.startDate === 'string' ? collective.startDate : '',
    endDate: typeof collective.endDate === 'string' ? collective.endDate : '',
    purpose: typeof collective.purpose === 'string' ? collective.purpose : '',
    notes: typeof collective.notes === 'string' ? collective.notes : '',
    countEvents,
  };
}

export function CollectivesProvider({ children }: PropsWithChildren) {
  const [collectives, setCollectives] = useState<Collective[]>([]);
  const collectivesRef = useRef<Collective[]>([]);
  const hasStartedRestore = useRef(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (hasStartedRestore.current) {
      return;
    }
    hasStartedRestore.current = true;

    let isActive = true;

    const restoreCollectives = async () => {
      try {
        const stored = await AsyncStorage.getItem(COLLECTIVES_STORAGE_KEY);

        if (stored && isActive) {
          const parsed: unknown = JSON.parse(stored);

          if (Array.isArray(parsed)) {
            const usedUids = new Set<string>();
            const valid = parsed
              .filter(isStoredCollective)
              .map((collective) => normalizeStoredCollective(collective, usedUids));

            collectivesRef.current = valid;
            setCollectives(valid);
          }
        }
      } catch {
        // Keep the empty list if local storage cannot be read.
      } finally {
        if (isActive) {
          setIsLoaded(true);
        }
      }
    };

    void restoreCollectives();

    return () => {
      isActive = false;
    };
  }, []);

  const value = useMemo<CollectivesContextValue>(() => {
    const replaceCollectives = (next: Collective[]) => {
      collectivesRef.current = next;
      setCollectives(next);
    };

    const persistAndReplace = async (next: Collective[]) => {
      try {
        await AsyncStorage.setItem(COLLECTIVES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        return false;
      }

      replaceCollectives(next);
      return true;
    };

    return {
      collectives,
      isLoaded,
      addCollective: async (input) => {
        const collective: Collective = { ...input, uid: createUid('col') };
        const next = [collective, ...collectivesRef.current];

        if (!(await persistAndReplace(next))) {
          return { ok: false, message: 'Could not save this herd or flock. Please try again.' };
        }

        return { ok: true, collective };
      },
      updateCollective: async (collectiveUid, input) => {
        const existing = collectivesRef.current.find((item) => item.uid === collectiveUid);

        if (!existing) {
          return { ok: false, message: 'This herd or flock no longer exists.' };
        }

        const updated: Collective = { ...input, uid: collectiveUid };
        const next = collectivesRef.current.map((item) =>
          item.uid === collectiveUid ? updated : item,
        );

        if (!(await persistAndReplace(next))) {
          return { ok: false, message: 'Could not save your changes. Please try again.' };
        }

        return { ok: true, collective: updated };
      },
      deleteCollective: async (collectiveUid) => {
        const next = collectivesRef.current.filter((item) => item.uid !== collectiveUid);

        if (!(await persistAndReplace(next))) {
          return { ok: false, message: 'Could not delete this herd or flock. Please try again.' };
        }

        return { ok: true };
      },
      resetCollectives: async () => {
        if (!(await persistAndReplace([]))) {
          return { ok: false, message: 'Could not clear herds and flocks. Please try again.' };
        }

        return { ok: true };
      },
      addCountEvent: async (collectiveUid, event) => {
        const existing = collectivesRef.current.find((item) => item.uid === collectiveUid);

        if (!existing) {
          return { ok: false, message: 'This herd or flock no longer exists.' };
        }

        // Guard against a removal taking the head count below zero — the count
        // is derived from these events, so a bad delta would be permanent
        // until someone worked out which event to correct.
        if (event.delta < 0 && getCollectiveCount(existing) + event.delta < 0) {
          return {
            ok: false,
            message: `That would take the count below zero. There are ${getCollectiveCount(existing)} animals recorded.`,
          };
        }

        const updated: Collective = {
          ...existing,
          countEvents: [...existing.countEvents, { ...event, id: createUid('cev') }],
        };

        const next = collectivesRef.current.map((item) =>
          item.uid === collectiveUid ? updated : item,
        );

        if (!(await persistAndReplace(next))) {
          return { ok: false, message: 'Could not record that change. Please try again.' };
        }

        return { ok: true, collective: updated };
      },
      getCollectivesSnapshot: () => collectivesRef.current,
      replaceCollectivesFromTransaction: replaceCollectives,
    };
  }, [collectives, isLoaded]);

  return <CollectivesContext.Provider value={value}>{children}</CollectivesContext.Provider>;
}

export function useCollectives() {
  const context = useContext(CollectivesContext);

  if (!context) {
    throw new Error('useCollectives must be used within a CollectivesProvider');
  }

  return context;
}
