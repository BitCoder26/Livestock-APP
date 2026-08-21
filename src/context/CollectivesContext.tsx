import AsyncStorage from 'expo-sqlite/kv-store';
// The store collectives used to live in, kept only to move them across. Every
// other context is on kv-store, and AccountContext's restore writes animals,
// records and setup in one kv-store multiSet — collectives sitting in a second
// engine could never join that transaction.
import LegacyAsyncStorage from '@react-native-async-storage/async-storage';
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
  type CollectiveStatusChange,
} from '../entities/collective';
import { filterAccessibleImageUris } from '../utils/imageStorage';

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
  /**
   * Makes the count events owned by one record match `event` exactly: any
   * existing event carrying this `recordId` is dropped from every collective
   * first, so re-pointing a record at a different herd or flock moves its
   * count change with it. Pass `null` to remove the change entirely, which is
   * what deleting the record does.
   */
  syncRecordCountEvent: (
    recordId: string,
    event: (Omit<CollectiveCountEvent, 'id' | 'recordId'> & { collectiveUid: string }) | null,
  ) => Promise<CollectiveMutationResult | { ok: true }>;
  /**
   * The only way a group's status ever moves. Records never touch it: a flock
   * is not sold or lost the way one animal is, and an emptied one is as often
   * between batches as finished. The keeper is the one who knows which, so
   * they say so, and the change is dated onto the group's timeline.
   */
  setCollectiveStatusManually: (
    collectiveUid: string,
    status: CollectiveStatus,
  ) => Promise<CollectiveMutationResult>;
  /**
   * Drops one dated line from the group's status history. The group's current
   * `status` is deliberately left alone — this removes a line from the record
   * of what happened, not the state itself, which the status dropdown owns.
   */
  removeCollectiveStatusChange: (
    collectiveUid: string,
    changeId: string,
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
          ...(typeof event.recordId === 'string' && event.recordId
            ? { recordId: event.recordId }
            : {}),
        }))
    : [];

  // 'Closed' was the word before this status became a plain Active/Inactive
  // switch, so anything stored under the old name reads forward rather than
  // silently reverting a group the keeper had already put away.
  const storedStatus = collective.status as string;
  const status: CollectiveStatus =
    storedStatus === 'Inactive' || storedStatus === 'Closed' ? 'Inactive' : 'Active';

  const statusHistory = Array.isArray(collective.statusHistory)
    ? collective.statusHistory
        .filter((change): change is CollectiveStatusChange => !!change && typeof change === 'object')
        .map((change) => ({
          id: typeof change.id === 'string' && change.id ? change.id : createUid('cst'),
          date: typeof change.date === 'string' ? change.date : '',
          status: (change.status as string) === 'Inactive' || (change.status as string) === 'Closed'
            ? ('Inactive' as const)
            : ('Active' as const),
        }))
    : [];

  // Same treatment the animal path gives its profile picture: a stored file://
  // that no longer exists is dropped here rather than left to fail at render,
  // and the card preference can never outlive the photo it refers to.
  const imageUris = filterAccessibleImageUris(collective.imageUris);

  // Renamed from `paddock`/`paddockUid`; older groups keep where they are kept.
  const legacyKeys = collective as unknown as { paddock?: unknown; paddockUid?: unknown };
  const legacyLocation = typeof legacyKeys.paddock === 'string' ? legacyKeys.paddock : '';
  const legacyLocationUid = typeof legacyKeys.paddockUid === 'string' ? legacyKeys.paddockUid : undefined;

  // Groups written before labels existed have neither key; both default to
  // empty rather than being treated as malformed.
  const labels = Array.isArray(collective.labels)
    ? collective.labels.filter((entry): entry is string => typeof entry === 'string' && !!entry.trim())
    : [];
  const labelUids = Array.isArray(collective.labelUids)
    ? collective.labelUids.filter((entry): entry is string => typeof entry === 'string' && !!entry.trim())
    : [];

  return {
    ...collective,
    uid,
    id: typeof collective.id === 'string' ? collective.id : '',
    name: typeof collective.name === 'string' ? collective.name : '',
    species: typeof collective.species === 'string' ? collective.species : '',
    breed: typeof collective.breed === 'string' ? collective.breed : '',
    status,
    farm: typeof collective.farm === 'string' ? collective.farm : '',
    // Renamed from `paddock`; older groups keep their value.
    location: typeof collective.location === 'string' ? collective.location : legacyLocation,
    locationUid: collective.locationUid ?? legacyLocationUid,
    startDate: typeof collective.startDate === 'string' ? collective.startDate : '',
    birthDate: typeof collective.birthDate === 'string' ? collective.birthDate : '',
    supplier: typeof collective.supplier === 'string' ? collective.supplier : '',
    cost: typeof collective.cost === 'string' ? collective.cost : '',
    averageWeight: typeof collective.averageWeight === 'string' ? collective.averageWeight : '',
    weightUnit: collective.weightUnit ?? 'kg',
    endDate: typeof collective.endDate === 'string' ? collective.endDate : '',
    purpose: typeof collective.purpose === 'string' ? collective.purpose : '',
    notes: typeof collective.notes === 'string' ? collective.notes : '',
    labels,
    labelUids,
    imageUris,
    showImageOnCard: imageUris.length > 0 && collective.showImageOnCard === true,
    countEvents,
    statusHistory,
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
        let stored = await AsyncStorage.getItem(COLLECTIVES_STORAGE_KEY);

        // Nothing in kv-store means either a fresh install or one whose
        // collectives were written before the move. Reading the old store
        // settles which, and anything found is copied across so the next
        // launch takes the line above. The legacy copy is left alone rather
        // than deleted — a downgrade should still find its data.
        if (!stored) {
          const legacy = await LegacyAsyncStorage.getItem(COLLECTIVES_STORAGE_KEY);

          if (legacy) {
            await AsyncStorage.setItem(COLLECTIVES_STORAGE_KEY, legacy);
            stored = legacy;
          }
        }

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
      setCollectiveStatusManually: async (collectiveUid, status) => {
        const existing = collectivesRef.current.find((item) => item.uid === collectiveUid);

        if (!existing) {
          return { ok: false, message: 'This herd or flock no longer exists.' };
        }

        // Picking the status it already has is a no-op, not an event — it
        // should not leave a "Marked Active" line on the timeline.
        if (existing.status === status) {
          return { ok: true, collective: existing };
        }

        const updated: Collective = {
          ...existing,
          status,
          statusHistory: [
            ...(existing.statusHistory ?? []),
            {
              id: createUid('cst'),
              date: new Date().toISOString().slice(0, 10),
              status,
            },
          ],
        };
        const next = collectivesRef.current.map((item) =>
          item.uid === collectiveUid ? updated : item,
        );

        if (!(await persistAndReplace(next))) {
          return { ok: false, message: 'Could not update the status. Please try again.' };
        }

        return { ok: true, collective: updated };
      },
      removeCollectiveStatusChange: async (collectiveUid, changeId) => {
        const existing = collectivesRef.current.find((item) => item.uid === collectiveUid);

        if (!existing) {
          return { ok: false, message: 'This herd or flock no longer exists.' };
        }

        const statusHistory = (existing.statusHistory ?? []).filter(
          (change) => change.id !== changeId,
        );

        if (statusHistory.length === (existing.statusHistory ?? []).length) {
          return { ok: true, collective: existing };
        }

        const updated: Collective = { ...existing, statusHistory };
        const next = collectivesRef.current.map((item) =>
          item.uid === collectiveUid ? updated : item,
        );

        if (!(await persistAndReplace(next))) {
          return { ok: false, message: 'Could not remove that status change. Please try again.' };
        }

        return { ok: true, collective: updated };
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
      syncRecordCountEvent: async (recordId, event) => {
        // Strip this record's previous event everywhere before adding the new
        // one — the record may have been moved to a different collective, in
        // which case the old group must give the animals back.
        const stripped = collectivesRef.current.map((collective) => {
          const countEvents = collective.countEvents.filter(
            (existing) => existing.recordId !== recordId,
          );

          return countEvents.length === collective.countEvents.length
            ? collective
            : { ...collective, countEvents };
        });

        if (!event) {
          if (!(await persistAndReplace(stripped))) {
            return { ok: false, message: 'Could not update the head count. Please try again.' };
          }

          return { ok: true };
        }

        const target = stripped.find((item) => item.uid === event.collectiveUid);

        if (!target) {
          return { ok: false, message: 'This herd or flock no longer exists.' };
        }

        if (event.delta < 0 && getCollectiveCount(target) + event.delta < 0) {
          return {
            ok: false,
            message: `That would take the count below zero. There are ${getCollectiveCount(target)} animals recorded.`,
          };
        }

        const { collectiveUid, ...countEvent } = event;
        const updated: Collective = {
          ...target,
          countEvents: [...target.countEvents, { ...countEvent, id: createUid('cev'), recordId }],
        };
        const next = stripped.map((item) => (item.uid === collectiveUid ? updated : item));

        if (!(await persistAndReplace(next))) {
          return { ok: false, message: 'Could not update the head count. Please try again.' };
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
