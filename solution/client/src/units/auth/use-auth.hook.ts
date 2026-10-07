import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { ApiError } from '../../shared/api/http';
import { authApi } from './auth.api';

export const ME_KEY = ['auth', 'me'] as const;

/** The signed-in user; null when there is no session (401 is an answer, not an error). */
export function useCurrentUser() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () =>
      authApi.me().catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }),
    staleTime: Infinity,
  });
}

export function useLogin() {
  const client = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) => authApi.login(username, password),
    onSuccess: (user) => {
      client.setQueryData(ME_KEY, user);
      navigate('/', { replace: true });
    },
  });
}

export function useLogout() {
  const client = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      client.clear();
      client.setQueryData(ME_KEY, null);
      navigate('/login', { replace: true });
    },
  });
}
