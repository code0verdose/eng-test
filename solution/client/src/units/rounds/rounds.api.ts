import { z } from 'zod';

import { request } from '../../shared/api/http';

const date = z.coerce.date();

export const roundSchema = z.object({
  id: z.uuid(),
  startAt: date,
  endAt: date,
  status: z.enum(['cooldown', 'active', 'finished']),
});
export type Round = z.infer<typeof roundSchema>;
export type RoundStatus = Round['status'];

const roundsResponse = z.object({ rounds: z.array(roundSchema), serverTime: date });
const createdResponse = z.object({ round: roundSchema, serverTime: date });
const roundResponse = z.object({
  round: roundSchema,
  myScore: z.number(),
  summary: z
    .object({
      totalScore: z.number(),
      winner: z.object({ username: z.string(), score: z.number() }).nullable(),
    })
    .nullable(),
  serverTime: date,
});
export type RoundDetails = z.infer<typeof roundResponse>;

export const roundsApi = {
  list: () => request('/rounds', roundsResponse).then((data) => data.rounds),
  create: () => request('/rounds', createdResponse, { method: 'POST' }).then((data) => data.round),
  get: (id: string) => request(`/rounds/${id}`, roundResponse),
  tap: (id: string) => request(`/rounds/${id}/taps`, z.object({ score: z.number() }), { method: 'POST' }),
};
