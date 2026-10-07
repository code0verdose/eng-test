import { roundStatus, type RoundStatus } from '../domain/round.js';
import { tapsCount } from '../domain/role.js';
import { AppError } from './errors.js';
import type { Round, RoundRepository, RoundSummary, User } from './ports.js';

export interface RoundsDeps {
  rounds: RoundRepository;
  cooldownSeconds: number;
  durationSeconds: number;
}

export interface RoundView extends Round {
  status: RoundStatus;
}

const view = (round: Round, now: Date): RoundView => ({ ...round, status: roundStatus(round, now) });

export async function createRound(deps: RoundsDeps, actor: User): Promise<{ round: RoundView; now: Date }> {
  if (actor.role !== 'admin') throw new AppError('forbidden', 'Создавать раунды может только администратор');
  const { round, now } = await deps.rounds.create({
    cooldownSeconds: deps.cooldownSeconds,
    durationSeconds: deps.durationSeconds,
  });
  return { round: view(round, now), now };
}

/** Active and scheduled rounds, soonest first. */
export async function listRounds(deps: RoundsDeps): Promise<{ rounds: RoundView[]; now: Date }> {
  const { rounds, now } = await deps.rounds.listNotFinished();
  return { rounds: rounds.map((round) => view(round, now)), now };
}

export interface RoundDetails {
  round: RoundView;
  now: Date;
  myScore: number;
  /** Present once the round is finished. */
  summary: RoundSummary | null;
}

export async function getRound(deps: RoundsDeps, actor: User, roundId: string): Promise<RoundDetails> {
  const found = await deps.rounds.find(roundId);
  if (!found) throw new AppError('round_not_found', 'Раунд не найден');
  const round = view(found.round, found.now);
  const myScore = tapsCount(actor.role) ? await deps.rounds.scoreOf(roundId, actor.id) : 0;
  const summary = round.status === 'finished' ? await deps.rounds.summary(roundId) : null;
  return { round, now: found.now, myScore, summary };
}

/**
 * One tap. Никита gets the same answer as everyone else, but nothing is counted for him.
 */
export async function tap(deps: RoundsDeps, actor: User, roundId: string): Promise<{ score: number }> {
  if (!tapsCount(actor.role)) {
    const found = await deps.rounds.find(roundId);
    if (!found) throw new AppError('round_not_found', 'Раунд не найден');
    if (roundStatus(found.round, found.now) !== 'active') throw notActive();
    return { score: 0 };
  }

  const result = await deps.rounds.tap(roundId, actor.id);
  if (result.ok) return { score: result.score };
  if (result.reason === 'not_found') throw new AppError('round_not_found', 'Раунд не найден');
  throw notActive();
}

const notActive = () => new AppError('round_not_active', 'Раунд сейчас не активен');
