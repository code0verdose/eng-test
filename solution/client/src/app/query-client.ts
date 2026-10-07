import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { ApiError } from '../shared/api/http';
import { ME_KEY } from '../units/auth/use-auth.hook';

/**
 * Any request answered with 401 (the session expired or was closed in another tab) drops the
 * current user; the protected layout then sends the player to the login page instead of
 * letting taps fail silently.
 */
export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 1_000, refetchOnWindowFocus: true } },
    queryCache: new QueryCache({ onError: (error) => onUnauthorized(error) }),
    mutationCache: new MutationCache({ onError: (error) => onUnauthorized(error) }),
  });
  const onUnauthorized = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) client.setQueryData(ME_KEY, null);
  };
  return client;
}

export const queryClient = createQueryClient();
