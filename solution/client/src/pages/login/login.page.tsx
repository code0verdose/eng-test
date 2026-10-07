import { Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState, type FormEvent } from 'react';

import { useLogin } from '../../units/auth/use-auth.hook';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ username: username.trim(), password });
  };

  return (
    <Paper withBorder p="xl" maw={400} mx="auto" mt="10vh">
      <form onSubmit={submit}>
        <Stack>
          <Title order={2} ta="center">
            ВОЙТИ
          </Title>
          <TextInput label="Имя пользователя" value={username} onChange={(e) => setUsername(e.currentTarget.value)} required autoFocus />
          <PasswordInput label="Пароль" value={password} onChange={(e) => setPassword(e.currentTarget.value)} required />
          <Button type="submit" loading={login.isPending} fullWidth>
            Войти
          </Button>
          {login.error && (
            <Text c="red" size="sm" ta="center" role="alert">
              {login.error.message}
            </Text>
          )}
        </Stack>
      </form>
    </Paper>
  );
}
