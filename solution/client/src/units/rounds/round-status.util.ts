import type { RoundStatus } from './rounds.api';

/** Same rule as on the server: active within [startAt, endAt). */
export function statusAt(round: { startAt: Date; endAt: Date }, now: Date): RoundStatus {
  if (now < round.startAt) return 'cooldown';
  if (now < round.endAt) return 'active';
  return 'finished';
}

export const STATUS_LABEL: Record<RoundStatus, string> = {
  cooldown: 'Cooldown',
  active: 'Активен',
  finished: 'Завершен',
};
