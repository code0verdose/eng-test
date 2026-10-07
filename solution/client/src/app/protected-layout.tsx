import { Container, Loader } from '@mantine/core';
import { Navigate, Outlet } from 'react-router';

import { useCurrentUser } from '../units/auth/use-auth.hook';

export function ProtectedLayout() {
  const { data: user, isPending } = useCurrentUser();
  if (isPending) return <Loader m="xl" />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Container size="md" pb="xl">
      <Outlet />
    </Container>
  );
}
