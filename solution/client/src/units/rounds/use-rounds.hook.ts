import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { roundsApi } from './rounds.api';

export const roundsKeys = {
  list: ['rounds'] as const,
  detail: (id: string) => ['rounds', id] as const,
};

/** Polls so that rounds created by other admins appear without a reload. */
export function useRoundsList() {
  return useQuery({ queryKey: roundsKeys.list, queryFn: roundsApi.list, refetchInterval: 5_000 });
}

export function useCreateRound() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: roundsApi.create,
    onSuccess: (round) => navigate(`/rounds/${round.id}`),
  });
}
