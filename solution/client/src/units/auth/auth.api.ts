import { z } from 'zod';

import { request } from '../../shared/api/http';

export const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  role: z.enum(['admin', 'survivor', 'nikita']),
});
export type User = z.infer<typeof userSchema>;

const userResponse = z.object({ user: userSchema });

export const authApi = {
  me: () => request('/auth/me', userResponse).then((data) => data.user),
  login: (username: string, password: string) =>
    request('/auth/login', userResponse, { method: 'POST', body: { username, password } }).then((data) => data.user),
  logout: () => request('/auth/logout', z.undefined(), { method: 'POST' }),
};
