import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { formatCountdown } from '../../shared/lib/format';
import { statusAt } from './round-status.util';
import { Goose } from './ui/goose.component';

describe('statusAt', () => {
  const round = { startAt: new Date(30_000), endAt: new Date(90_000) };

  it('matches the server rule: active within [start, end)', () => {
    expect(statusAt(round, new Date(29_999))).toBe('cooldown');
    expect(statusAt(round, new Date(30_000))).toBe('active');
    expect(statusAt(round, new Date(89_999))).toBe('active');
    expect(statusAt(round, new Date(90_000))).toBe('finished');
  });
});

describe('formatCountdown', () => {
  it('shows mm:ss, rounds up, never goes negative', () => {
    expect(formatCountdown(23_000)).toBe('00:23');
    expect(formatCountdown(22_100)).toBe('00:23');
    expect(formatCountdown(-5_000)).toBe('00:00');
    expect(formatCountdown(3_661_000)).toBe('01:01:01');
  });
});

describe('Goose', () => {
  const renderGoose = (active: boolean, onTap = vi.fn()) => {
    render(<Goose active={active} onTap={onTap} />);
    return onTap;
  };

  it('passes every quick tap through, none is swallowed', async () => {
    const onTap = renderGoose(true);
    const goose = screen.getByRole('button', { name: 'Тапнуть гуся' });

    for (let index = 0; index < 5; index += 1) await userEvent.click(goose);

    expect(onTap).toHaveBeenCalledTimes(5);
  });

  it('cannot be tapped outside an active round', async () => {
    const onTap = renderGoose(false);

    await userEvent.click(screen.getByRole('button', { name: 'Гусь недоступен' }));

    expect(onTap).not.toHaveBeenCalled();
  });
});
