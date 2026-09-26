import NetInfo from '@react-native-community/netinfo';
import { useEffect, useReducer } from 'react';
import { cloudEnabled } from './remote';
import { sync, SyncState } from './sync';

export interface SyncStatus {
  state: SyncState;
  pending: number;
  error: string | null;
  cloudEnabled: boolean;
}

/** Live cloud status for display. */
export function useSyncStatus(): SyncStatus {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => sync.subscribe(force), []);
  return {
    state: sync.getState(),
    pending: sync.getPendingCount(),
    error: sync.getLastError(),
    cloudEnabled,
  };
}

/**
 * Retry queued writes as soon as the phone has a connection again — a rider who
 * marked deliveries in a basement should not have to remember to do anything.
 */
export function useAutoFlush() {
  useEffect(() => {
    if (!cloudEnabled) return;
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) sync.flush();
    });
    return unsubscribe;
  }, []);
}
