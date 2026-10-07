import { Divider, Group, Stack, Text } from '@mantine/core';

import type { RoundDetails } from '../rounds.api';

interface RoundSummaryProps {
  summary: NonNullable<RoundDetails['summary']>;
  myScore: number;
}

export function RoundSummary({ summary, myScore }: RoundSummaryProps) {
  return (
    <Stack gap={4} mt="md" maw={320} mx="auto">
      <Divider mb="xs" />
      <Group justify="space-between">
        <Text>Всего</Text>
        <Text fw={600}>{summary.totalScore}</Text>
      </Group>
      <Group justify="space-between">
        <Text>Победитель{summary.winner ? ` - ${summary.winner.username}` : ''}</Text>
        <Text fw={600}>{summary.winner?.score ?? 'нет'}</Text>
      </Group>
      <Group justify="space-between">
        <Text>Мои очки</Text>
        <Text fw={600}>{myScore}</Text>
      </Group>
    </Stack>
  );
}
