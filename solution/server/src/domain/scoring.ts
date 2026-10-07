/** Every eleventh tap is worth 10 points, any other tap is worth 1. */
export const BONUS_TAP_EVERY = 11;
export const BONUS_TAP_POINTS = 10;

/** Points for the tap with this ordinal number (1-based) within one player's round. */
export function pointsForTap(tapNumber: number): number {
  return tapNumber % BONUS_TAP_EVERY === 0 ? BONUS_TAP_POINTS : 1;
}

export function scoreForTaps(taps: number): number {
  const bonusTaps = Math.floor(taps / BONUS_TAP_EVERY);
  return taps + bonusTaps * (BONUS_TAP_POINTS - 1);
}
