import { Alert, Anchor, Loader, Stack, Text } from '@mantine/core';
import { Link, useParams } from 'react-router';

import { formatCountdown } from '../../shared/lib/format';
import { AppHeader } from '../../shared/ui/app-header.component';
import { Goose } from '../../units/rounds/ui/goose.component';
import { RoundSummary } from '../../units/rounds/ui/round-summary.component';
import { useRoundGame } from '../../units/rounds/use-round-game.hook';

const TITLE = { cooldown: 'Cooldown', active: 'Раунды', finished: 'Раунд завершен' } as const;

/** Keyed by round id in the router, so switching rounds starts from a clean state. */
export function RoundPage() {
  const { id = '' } = useParams();
  const game = useRoundGame(id);

  return (
    <>
      <AppHeader title={game.status ? TITLE[game.status] : 'Раунд'} />
      <Anchor component={Link} to="/" size="sm">
        ← К списку раундов
      </Anchor>
      {game.query.isPending && <Loader mt="xl" />}
      {game.query.error && <Alert color="red" mt="md">{game.query.error.message}</Alert>}
      {game.status && (
        <Stack align="center" gap={4} mt="md">
          <Goose active={game.status === 'active'} onTap={game.tap} />
          {game.status === 'active' && (
            <>
              <Text fw={600}>Раунд активен!</Text>
              <Text>До конца осталось: {formatCountdown(game.msLeft)}</Text>
              <Text>Мои очки - {game.myScore}</Text>
              {game.tapError && (
                <Text c="red" size="sm" role="alert">
                  Тап не дошёл до сервера: {game.tapError}
                </Text>
              )}
            </>
          )}
          {game.status === 'cooldown' && (
            <>
              <Text fw={600}>Cooldown</Text>
              <Text>до начала раунда {formatCountdown(game.msLeft)}</Text>
            </>
          )}
          {game.status === 'finished' && game.summary && <RoundSummary summary={game.summary} myScore={game.myScore} />}
        </Stack>
      )}
    </>
  );
}
