import { Alert, Button, Loader, Stack, Text } from '@mantine/core';

import { AppHeader } from '../../shared/ui/app-header.component';
import { useServerNow } from '../../shared/lib/server-clock';
import { useCurrentUser } from '../../units/auth/use-auth.hook';
import { RoundCard } from '../../units/rounds/ui/round-card.component';
import { useCreateRound, useRoundsList } from '../../units/rounds/use-rounds.hook';

export function RoundsPage() {
  const { data: user } = useCurrentUser();
  const rounds = useRoundsList();
  const create = useCreateRound();
  const now = useServerNow();

  return (
    <>
      <AppHeader title="Список РАУНДОВ" />
      {user?.role === 'admin' && (
        <Button mb="md" onClick={() => create.mutate()} loading={create.isPending}>
          Создать раунд
        </Button>
      )}
      {create.error && <Alert color="red" mb="md">{create.error.message}</Alert>}
      {rounds.isPending && <Loader />}
      {rounds.error && <Alert color="red">{rounds.error.message}</Alert>}
      {rounds.data?.length === 0 && <Text c="dimmed">Активных и запланированных раундов нет</Text>}
      <Stack>
        {rounds.data?.map((round) => (
          <RoundCard key={round.id} round={round} now={now} />
        ))}
      </Stack>
    </>
  );
}
