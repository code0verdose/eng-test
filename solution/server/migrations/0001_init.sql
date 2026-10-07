CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin', 'survivor', 'nikita')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Only the SHA-256 of the session token is stored: a database leak does not leak sessions.
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE rounds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  start_at    timestamptz NOT NULL,
  end_at      timestamptz NOT NULL,
  total_score integer NOT NULL DEFAULT 0,
  CHECK (start_at >= created_at),
  CHECK (end_at > start_at)
);
CREATE INDEX rounds_end_at_idx ON rounds (end_at);

CREATE TABLE round_scores (
  round_id uuid NOT NULL REFERENCES rounds (id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  taps     integer NOT NULL DEFAULT 0,
  score    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (round_id, user_id)
);
-- No index on score: it would turn every tap into a non-HOT update. The winner is read once
-- per finished round, by the primary key prefix (round_id).
