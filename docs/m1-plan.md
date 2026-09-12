# M1 — Accounts: implementation plan

Delivers FR-1…FR-4, NFR-10, NFR-14 and PRD epic A. The milestone that lets a
user log in, and the milestone every later one depends on for ownership.

## 1. Scope

| In                                           | Out, and why                                                    |
| -------------------------------------------- | --------------------------------------------------------------- |
| Register, log in, log out                    | Email verification — PRD E-7, belongs with M7 where mail exists |
| Session issue, validation, expiry            | Password reset — needs mail, same reason                        |
| Argon2id hashing                             | Account deletion — FR-5 is **C**, and nothing to cascade yet    |
| Change password, invalidating other sessions | OAuth, teams — out of scope per §6.3                            |
| Rate limiting on auth                        |                                                                 |
| Ownership scoping available to M2            |                                                                 |

The `users` table gains `email_verified_at` now even though nothing sets it, so
M7 adds behaviour rather than a column to a populated table.

## 2. Investigation

Measured rather than assumed.

### Argon2 in a musl container

`argon2` (node-argon2) builds through node-gyp and publishes prebuilt binaries
for glibc only, so our `node:22-alpine` image would need `build-base` and
`python3` and a compile on every build. `@node-rs/argon2` is a napi-rs binding
with no node-gyp and ships `linux-x64-musl` and `linux-arm64-musl` prebuilts.

Verified in the actual base image:

```
docker run --rm node:22-alpine  →  npm i @node-rs/argon2
  algorithm in hash: argon2id
  verify correct: true | verify wrong: false
  hash 12ms | verify 8ms      (m=19456 KiB, t=2, p=1)
```

No build toolchain needed, and the Dockerfile's `--ignore-scripts` stays valid.

### Parameters

OWASP's current minimum for Argon2id is **m=19456 KiB, t=2, p=1**, with
m=47104/t=1/p=1 as an equivalent-strength alternative. 12 ms on this hardware is
at the fast end; the cost is a configuration value so it can be raised to match
the deployment target, with the measurement recorded rather than guessed.

### Sessions must be revocable

A-5 requires that changing a password invalidates **every other session**. A
self-contained JWT cannot do that without a revocation list checked on each
request — which is a session table wearing a different hat. The decision is
therefore forced, not preferred: opaque tokens with server-side state.

### Rate limiting has two different jobs

A-6 conflates them, and they need different mechanisms:

| Job                     | Threat                                             | Key   | Mechanism            |
| ----------------------- | -------------------------------------------------- | ----- | -------------------- |
| Request throttling      | one host hammering the endpoint                    | IP    | fixed window         |
| Failed-attempt tracking | credential stuffing from many hosts at one account | email | counter with backoff |

The second is the one that matters. An attacker with a botnet defeats IP
throttling entirely, and per-account tracking is what stops them. Both must
survive a restart, or an attacker just waits for a deploy.

`@nestjs/throttler` stores counters **in memory** by default, which is wrong on
both counts: lost on restart, and not shared if a second api instance ever runs.
Its `ThrottlerStorage` interface is pluggable, but implementing a Postgres
backend for it is about as much code as the counter itself.

## 3. Decisions

| #   | Decision                                                         | Rejected               | Because                                                                                              |
| --- | ---------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | `@node-rs/argon2`                                                | `argon2`               | glibc-only prebuilts; Alpine would need a build toolchain                                            |
| 2   | Opaque session tokens, server-side                               | JWT                    | A-5 makes revocation mandatory                                                                       |
| 3   | Store the session token's **hash**, never the token              | store the token        | a database leak would otherwise hand over live sessions, exactly as leaked passwords would           |
| 4   | `httpOnly; Secure; SameSite=Lax` cookie                          | `Authorization` header | A-3 requires surviving reload, which means persistence; `localStorage` is readable by any XSS        |
| 5   | Rate limiting in Postgres, written here                          | `@nestjs/throttler`    | in-memory storage is lost on restart and unshared; a custom backend is the same work                 |
| 6   | Email stored normalised lowercase, plain unique index            | `citext` extension     | one fewer extension; case-insensitive local parts are universally ignored in practice                |
| 7   | `core/users/` for the repository, `api/auth/` for authentication | all in `api/`          | M7's notifier needs to read a user's email from the worker; hashing and sessions never leave the api |

Each of 1–5 becomes an ADR in probeboard-docs.

## 4. Data model

```sql
CREATE TABLE users (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email            text NOT NULL,          -- normalised lowercase
    password_hash    text NOT NULL,
    email_verified_at timestamptz,           -- set in M7
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (email);

CREATE TABLE sessions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash    bytea NOT NULL,            -- SHA-256 of the token, never the token
    issued_at     timestamptz NOT NULL DEFAULT now(),
    expires_at    timestamptz NOT NULL,
    last_seen_at  timestamptz NOT NULL DEFAULT now(),
    revoked_at    timestamptz
);
CREATE UNIQUE INDEX sessions_token_hash_key ON sessions (token_hash);
CREATE INDEX sessions_user_id_idx ON sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE auth_attempts (
    id          bigserial PRIMARY KEY,
    scope       text NOT NULL,               -- 'ip' | 'email'
    key         text NOT NULL,               -- the address, or the email
    occurred_at timestamptz NOT NULL DEFAULT now(),
    succeeded   boolean NOT NULL
);
CREATE INDEX auth_attempts_lookup_idx ON auth_attempts (scope, key, occurred_at DESC);
```

Notes that are decisions, not detail:

- `token_hash` is SHA-256, not Argon2. The token is 256 bits of CSPRNG output,
  so it has no guessable structure and needs no slow hash — and a slow hash on
  every authenticated request would be a self-inflicted denial of service.
- `revoked_at` rather than deleting the row, so "log out everywhere" is one
  `UPDATE` and the history stays inspectable.
- `auth_attempts` needs its own retention sweep, or it becomes an unbounded log.
  M5 owns retention; until then a `DELETE` on rows older than the window is
  acceptable because the volume is auth attempts, not probes.

## 5. HTTP surface

| Method | Path                  | Purpose                                                |
| ------ | --------------------- | ------------------------------------------------------ |
| `POST` | `/v1/auth/register`   | create an account, issue a session                     |
| `POST` | `/v1/auth/login`      | issue a session                                        |
| `POST` | `/v1/auth/logout`     | revoke the current session                             |
| `POST` | `/v1/auth/logout-all` | revoke every session for the user                      |
| `GET`  | `/v1/auth/me`         | the current user; how the client knows it is logged in |
| `POST` | `/v1/auth/password`   | change password, revoking other sessions               |

All bodies validated by the zod pipe from M0. All failures use the M0 error
shape: a stable `code`, never internal detail.

## 6. Security properties, and how each is proved

Every row below gets a test. A property with no failing-case test is not known
to hold — M0 shipped two guards that silently did nothing.

| Property                                             | Requirement | How it is tested                                                                                                 |
| ---------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| Passwords stored only as Argon2id                    | NFR-10      | the stored value starts `$argon2id$`; the plaintext appears nowhere in the row                                   |
| Register does not reveal existing accounts           | A-1         | duplicate registration returns the same status and body as a fresh one                                           |
| Login does not reveal which half was wrong           | A-2         | unknown email and wrong password return identical status and body                                                |
| …and does not reveal it by timing                    | A-2         | unknown-email path still runs a verification against a dummy hash; the two paths are compared over repeated runs |
| Session survives reload                              | A-3         | cookie is `httpOnly`, `Secure`, `SameSite=Lax`, with an expiry                                                   |
| Expired sessions are rejected                        | A-3         | a session whose `expires_at` has passed returns 401                                                              |
| Revoked sessions are rejected                        | A-5         | revoking then reusing the token returns 401                                                                      |
| Changing the password logs out elsewhere             | A-5         | two sessions; change with one; the other is rejected, the current one survives                                   |
| A user sees only their own data                      | A-4         | another user's resource returns **404**, not 403                                                                 |
| Auth endpoints are rate limited                      | NFR-14      | per-IP throttle and per-account lockout each trigger, and each survives a process restart                        |
| A token leak from the database is not a session leak | decision 3  | the stored value cannot be replayed as a cookie                                                                  |

## 7. Delivery

Three pull requests. M0 hardening was fourteen commits across three concerns,
which no human reviewer could usefully read.

### PR 1 — schema

Migration `0002_accounts` with the three tables, matching `types.ts`, and the
repository layer in `core/users/`. Tested against a real database in CI, which
the `migrations` job already does.

### PR 2 — authentication logic

`api/auth/`: password hashing, session issue and validation, the rate limiter.
Pure or repository-level, no HTTP. This is where the security properties live
and where most of the tests go.

### PR 3 — HTTP surface

Controllers, the session guard, cookie handling, and end-to-end tests against a
running server — the kind M0 lacked, which is how the version prefix bug
survived.

## 8. Tensions to resolve before coding

**A-1 versus usability.** Returning the same response for a duplicate
registration means a user who forgot they had an account is told they succeeded,
then cannot log in with the password they just chose. Real products close this
by sending mail either way — "you already have an account" versus "confirm your
address" — which we cannot do until M7.

Options: implement A-1 as written and carry the gap for six milestones; or
return a clear conflict now and add enumeration resistance in M7. The
requirement says the former. It is worth confirming, because it is a deliberate
trade of usability for a property the thesis does not itself argue for.

**Argon2 cost versus login latency.** 12 ms is at the fast end of acceptable.
Raising it strengthens NFR-10 and slows every login and every rate-limited
attempt, which is also a small denial-of-service surface. The parameters are
configuration; the number to record in the evaluation chapter is the measured
one on the deployment target, not this laptop's.

**Session lifetime.** Not specified anywhere in the requirements. A fixed expiry
is simplest and is what A-3 implies ("expiry forces re-login"). Sliding expiry
is friendlier and complicates revocation reasoning. Proposal: fixed 30 days,
configurable, with `last_seen_at` recorded but not extending the session.
