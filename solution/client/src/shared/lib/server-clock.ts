import { useSyncExternalStore } from 'react';

/**
 * Countdowns run on the server clock: the backend sends serverTime with round data and the
 * client keeps the offset to its own clock. A wrong clock on the device does not break the game.
 */
let offsetMs = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let tick = 0;

export const serverClock = {
  sync(serverTime: Date) {
    offsetMs = serverTime.getTime() - Date.now();
  },
  now(): Date {
    return new Date(Date.now() + offsetMs);
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  timer ??= setInterval(() => {
    tick += 1;
    listeners.forEach((notify) => notify());
  }, 1000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Re-renders once a second with the server time; one shared timer for all subscribers. */
export function useServerNow(): Date {
  useSyncExternalStore(subscribe, () => tick);
  return serverClock.now();
}
