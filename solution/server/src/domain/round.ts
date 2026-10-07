export type RoundStatus = 'cooldown' | 'active' | 'finished';

export interface RoundWindow {
  startAt: Date;
  endAt: Date;
}

/** Active means started and not yet ended: [startAt, endAt). */
export function roundStatus(round: RoundWindow, now: Date): RoundStatus {
  if (now < round.startAt) return 'cooldown';
  if (now < round.endAt) return 'active';
  return 'finished';
}
