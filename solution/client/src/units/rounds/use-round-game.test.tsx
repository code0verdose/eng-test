import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../shared/api/http';
import { roundsApi, type RoundDetails } from './rounds.api';
import { useRoundGame } from './use-round-game.hook';

vi.mock('./rounds.api', () => ({ roundsApi: { get: vi.fn(), tap: vi.fn() } }));

const get = vi.mocked(roundsApi.get);
const tap = vi.mocked(roundsApi.tap);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const details = (startOffsetMs: number, endOffsetMs: number, myScore = 0): RoundDetails => ({
  round: {
    id: '11111111-1111-4111-8111-111111111111',
    startAt: new Date(Date.now() + startOffsetMs),
    endAt: new Date(Date.now() + endOffsetMs),
    status: startOffsetMs > 0 ? 'cooldown' : 'active',
  },
  myScore,
  summary: null,
  serverTime: new Date(),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe('useRoundGame', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockReset();
    tap.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('sends every tap without waiting and never lets a late answer lower the score', async () => {
    get.mockResolvedValue(details(-1_000, 60_000, 5));
    const first = deferred<{ score: number }>();
    const second = deferred<{ score: number }>();
    tap.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useRoundGame('r1'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('active'));

    act(() => result.current.tap());
    await waitFor(() => expect(tap).toHaveBeenCalledTimes(1));
    // The first request is still in flight: the second tap must not wait for it.
    act(() => result.current.tap());
    await waitFor(() => expect(tap).toHaveBeenCalledTimes(2));

    await act(async () => second.resolve({ score: 7 }));
    await act(async () => first.resolve({ score: 6 }));

    expect(result.current.myScore).toBe(7);
  });

  it('fetches the round again right after the cooldown ends', async () => {
    get.mockResolvedValue(details(1_000, 60_000));
    const { result } = renderHook(() => useRoundGame('r1'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('cooldown'));
    expect(get).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });

    expect(get).toHaveBeenCalledTimes(2);
  });

  it('reports a failed tap, but not the refusal that comes when the round has just ended', async () => {
    get.mockResolvedValue(details(-1_000, 60_000));
    tap.mockRejectedValueOnce(new ApiError(409, 'round_not_active', 'Раунд сейчас не активен'));
    tap.mockRejectedValueOnce(new ApiError(500, 'internal', 'Internal error'));
    const { result } = renderHook(() => useRoundGame('r1'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('active'));

    act(() => result.current.tap());
    await waitFor(() => expect(tap).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.tapError).toBeNull());

    act(() => result.current.tap());
    await waitFor(() => expect(result.current.tapError).toBe('Internal error'));
  });
});
