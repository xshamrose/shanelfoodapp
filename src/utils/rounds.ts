import { db } from '../data/store';
import { MealRound } from '../types';

/** Active rounds in the order they happen during the day. */
export function activeRounds(): MealRound[] {
  return [...db.rounds.getAll().filter((r) => r.active)].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  );
}

export function sortRounds(rounds: MealRound[]): MealRound[] {
  return [...rounds].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function roundName(roundId?: string): string {
  if (!roundId) return 'Unassigned';
  return db.rounds.get(roundId)?.name ?? 'Unknown round';
}

/**
 * Where an order belongs when its round is missing.
 *
 * Orders created before rounds existed have no round, and hiding them would be
 * worse than putting them in the first round of the day — the kitchen still has
 * to cook them.
 */
export function effectiveRoundId(orderRoundId: string | undefined, rounds: MealRound[]): string | undefined {
  if (orderRoundId) return orderRoundId;
  return rounds[0]?.id;
}
