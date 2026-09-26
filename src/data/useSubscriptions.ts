import { useEffect, useRef } from 'react';
import { generateSubscriptionOrders } from '../utils/subscriptions';
import { db } from './store';

/**
 * Keeps the coming week's subscription deliveries created.
 *
 * Runs at startup and again whenever subscriptions or skips change — including
 * changes that arrive from another phone. Generation only ever writes orders,
 * never subscriptions or skips, so this cannot retrigger itself.
 */
export function useSubscriptionGeneration() {
  const running = useRef(false);
  const rerunWanted = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (running.current) {
        // A change landed mid-run; go round once more when this pass finishes.
        rerunWanted.current = true;
        return;
      }
      running.current = true;
      try {
        do {
          rerunWanted.current = false;
          await generateSubscriptionOrders();
        } while (rerunWanted.current);
      } finally {
        running.current = false;
      }
    };

    run();
    const unsubSubs = db.subscriptions.subscribe(run);
    const unsubSkips = db.skips.subscribe(run);
    return () => {
      unsubSubs();
      unsubSkips();
    };
  }, []);
}
