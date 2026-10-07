import { Anchor, Card, Divider, Text } from '@mantine/core';
import { Link } from 'react-router';

import { formatDateTime } from '../../../shared/lib/format';
import { STATUS_LABEL, statusAt } from '../round-status.util';
import type { Round } from '../rounds.api';

export function RoundCard({ round, now }: { round: Round; now: Date }) {
  return (
    <Card withBorder padding="md">
      <Text>
        ● Round ID:{' '}
        <Anchor component={Link} to={`/rounds/${round.id}`}>
          {round.id}
        </Anchor>
      </Text>
      <Text mt="xs">Start: {formatDateTime(round.startAt)}</Text>
      <Text>End: {formatDateTime(round.endAt)}</Text>
      <Divider my="sm" />
      <Text>Статус: {STATUS_LABEL[statusAt(round, now)]}</Text>
    </Card>
  );
}
