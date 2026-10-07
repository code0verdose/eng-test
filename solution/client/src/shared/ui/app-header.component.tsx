import { Button, Group, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

import { useCurrentUser, useLogout } from '../../units/auth/use-auth.hook';

export function AppHeader({ title }: { title: ReactNode }) {
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  return (
    <Group justify="space-between" py="md" mb="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
      <Title order={2}>{title}</Title>
      <Group gap="sm">
        <Text fw={500}>{user?.username}</Text>
        <Button variant="subtle" size="xs" onClick={() => logout.mutate()} loading={logout.isPending}>
          Выйти
        </Button>
      </Group>
    </Group>
  );
}
