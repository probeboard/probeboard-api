-- Accounts, sessions and authentication attempt tracking.
-- Sources: docs chapter 6 epic A, FR-1..FR-4, NFR-10, NFR-14; docs/m1-plan.md.

CREATE TABLE users (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Stored normalised to lowercase. A plain unique index rather than citext:
    -- one fewer extension, and case-sensitive local parts are universally
    -- ignored in practice.
    email             text        NOT NULL,
    -- Argon2id encoded string, including its parameters and salt, so the cost
    -- can be raised later without invalidating existing hashes.
    password_hash     text        NOT NULL,
    -- Set in M7, when there is mail to verify with.
    email_verified_at timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_key ON users (email);

CREATE TABLE sessions (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- SHA-256 of the token, never the token. A database leak must not hand
    -- over live sessions, for the same reason passwords are not stored.
    -- SHA-256 rather than Argon2 because the token is 256 bits of CSPRNG
    -- output with no guessable structure, and a slow hash on every
    -- authenticated request would be a self-inflicted denial of service.
    token_hash   bytea       NOT NULL,
    issued_at    timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    -- Recorded for operators. Deliberately does not extend the session: a
    -- fixed lifetime keeps revocation reasoning simple (A-3).
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    -- Revoked rather than deleted, so "log out everywhere" is one UPDATE and
    -- the history stays inspectable.
    revoked_at   timestamptz
);

CREATE UNIQUE INDEX sessions_token_hash_key ON sessions (token_hash);
CREATE INDEX sessions_user_id_active_idx ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at) WHERE revoked_at IS NULL;

-- Rate limiting (NFR-14, A-6). Two scopes with different jobs: 'ip' throttles
-- one host hammering the endpoint, 'email' resists credential stuffing against
-- one account from many hosts, which IP throttling cannot see.
CREATE TABLE auth_attempts (
    id          bigserial   PRIMARY KEY,
    scope       text        NOT NULL CHECK (scope IN ('ip', 'email')),
    key         text        NOT NULL,
    succeeded   boolean     NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_attempts_lookup_idx ON auth_attempts (scope, key, occurred_at DESC);
