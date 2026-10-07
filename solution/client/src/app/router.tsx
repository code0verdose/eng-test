import { createBrowserRouter } from 'react-router';

import { LoginPage } from '../pages/login/login.page';
import { RoundsPage } from '../pages/rounds/rounds.page';
import { ProtectedLayout } from './protected-layout';
import { RoundRoute } from './round-route';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedLayout />,
    children: [
      { path: '/', element: <RoundsPage /> },
      { path: '/rounds/:id', element: <RoundRoute /> },
    ],
  },
]);
