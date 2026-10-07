import { describe, expect, it } from 'vitest';

import { ApiError } from '../shared/api/http';
import { ME_KEY } from '../units/auth/use-auth.hook';
import { createQueryClient } from './query-client';

describe('createQueryClient', () => {
  it('signs the player out when a tap is answered with 401', async () => {
    const client = createQueryClient();
    client.setQueryData(ME_KEY, { id: 'u1', username: 'Вася', role: 'survivor' });

    await client
      .getMutationCache()
      .build(client, {
        mutationFn: () => Promise.reject(new ApiError(401, 'unauthorized', 'Нужно войти')),
      })
      .execute(undefined)
      .catch(() => undefined);

    expect(client.getQueryData(ME_KEY)).toBeNull();
  });

  it('keeps the player signed in on other errors', async () => {
    const client = createQueryClient();
    client.setQueryData(ME_KEY, { id: 'u1', username: 'Вася', role: 'survivor' });

    await client
      .getMutationCache()
      .build(client, {
        mutationFn: () => Promise.reject(new ApiError(409, 'round_not_active', 'Раунд сейчас не активен')),
      })
      .execute(undefined)
      .catch(() => undefined);

    expect(client.getQueryData(ME_KEY)).not.toBeNull();
  });
});
