import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiError } from '../../shared/api/http';
import { serverClock, useServerNow } from '../../shared/lib/server-clock';
import { statusAt } from './round-status.util';
import { roundsApi, type RoundDetails } from './rounds.api';
import { roundsKeys } from './use-rounds.hook';

/** Refetch right after the next status change (the server then adds the summary); stop once it is there. */
function untilNextChange(details: RoundDetails | undefined): number | false {
  if (!details) return false;
  const now = serverClock.now();
  const status = statusAt(details.round, now);
  if (status === 'finished') return details.summary ? false : 250;
  const boundary = status === 'cooldown' ? details.round.startAt : details.round.endAt;
  return Math.max(250, boundary.getTime() - now.getTime() + 250);
}

/**
 * Everything the round page needs. The status is recomputed every second on the server clock.
 * Taps are never blocked by a pending request; the shown score only grows, so a late answer
 * to an earlier tap cannot roll it back.
 */
export function useRoundGame(roundId: string) {
  const now = useServerNow();
  const [tapScore, setTapScore] = useState(0);

  const query = useQuery({
    queryKey: roundsKeys.detail(roundId),
    queryFn: () => roundsApi.get(roundId),
    refetchInterval: (current) => untilNextChange(current.state.data),
  });

  const tapMutation = useMutation({
    mutationFn: () => roundsApi.tap(roundId),
    onSuccess: ({ score }) => setTapScore((best) => Math.max(best, score)),
  });

  const details = query.data;
  const status = details ? statusAt(details.round, now) : null;
  const boundary = details && (status === 'cooldown' ? details.round.startAt : details.round.endAt);

  return {
    query,
    round: details?.round,
    summary: details?.summary ?? null,
    status,
    myScore: Math.max(details?.myScore ?? 0, tapScore),
    msLeft: boundary ? boundary.getTime() - now.getTime() : 0,
    tap: () => tapMutation.mutate(),
    /** A failed tap other than "round is over" (that one is shown by the status itself). */
    tapError:
      tapMutation.error && !(tapMutation.error instanceof ApiError && tapMutation.error.status === 409)
        ? tapMutation.error.message
        : null,
  };
}
