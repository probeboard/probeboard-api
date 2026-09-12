# M0 verification record

What was actually executed to accept M0, and what it produced. Kept because
"it compiles" is not evidence that a system runs, and because two real defects
were only visible end to end.

Date: 2026-09-12 · Postgres 17-alpine · Node 22-alpine · NestJS 12 · Docker 29.7.2

## Results

| Check                                                   | Result                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| `docker compose up -d --build` from an empty volume     | api, postgres, worker running                                        |
| Migration applied automatically before api/worker start | `0001_init`                                                          |
| Enum types created                                      | 4 (`endpoint_state`, `probe_outcome`, `failure_class`, `stat_grain`) |
| `failure_class` values                                  | 16, matching docs §3.4                                               |
| Migration re-run                                        | no-op                                                                |
| Migration rollback                                      | all 4 types dropped                                                  |
| Migration re-apply                                      | all 4 types restored                                                 |
| `GET /healthz`                                          | `200 {"status":"ok"}`                                                |
| `GET /readyz`                                           | `200 {"status":"ok","database":"ok"}`                                |
| `GET /healthz` with database stopped                    | `200` — liveness correctly unaffected                                |
| `GET /readyz` with database stopped                     | `503 {"code":"DATABASE_UNAVAILABLE"}`                                |
| `GET /readyz` after database restart, no api restart    | `200` — pool recovers                                                |
| Worker SIGTERM                                          | stops in 0 s, exit code 0                                            |
| `--scale worker=3`                                      | 3 containers, 3 distinct worker ids                                  |
| Unit tests                                              | 13 passed                                                            |
| `tsc --noEmit`                                          | clean                                                                |
| `npm audit`                                             | 0 vulnerabilities                                                    |

## Defects found by running it, not by compiling it

### 1. Worker exited immediately (exit 0)

The worker container started, logged `worker started`, and exited. A container
that exits is indistinguishable from a crash loop.

Cause: `NestFactory.createApplicationContext()` holds nothing open, unlike an
HTTP server. The first fix — awaiting a promise resolved by a signal handler —
did not work either, because **registering a signal listener does not keep
Node's event loop alive**. This was verified directly rather than assumed: a
script whose only content is `process.once('SIGTERM', …)` exits immediately.

Fix: hold an explicit ref'd `setInterval`, cleared on shutdown. From M4 the
scheduler's own timers will also hold the loop open, but the worker must not
depend on a later milestone to stay running.

### 2. Every worker reported the same identity

With `--scale worker=3`, all three logged `workerId: worker-1`.

Cause: the default was `worker-${process.pid}`, and every container runs its
process as PID 1.

Why it matters: `WORKER_ID` is written to `leased_by` when a worker claims an
endpoint. Identical ids would make it impossible to tell which worker holds a
claim or which one died — directly undermining the diagnosis of NFR-3 and
NFR-4 in M4.

Fix: default to `<hostname>-<pid>`, which is unique per container and per local
process. Covered by a test.

### 3. Readiness failure detail was lost, and never logged

`GET /readyz` returned `"cause": ""` — empty — and nothing was written to the
log, despite a code comment claiming the detail went there.

Cause: Node reports a failed connection to a host resolving to several
addresses as an `AggregateError`, whose own `.message` is empty. Reading
`err.message` therefore produced an empty string.

Fix: `describeError()` unwraps `AggregateError`, prefixes the errno code, and
collapses duplicate causes. The detail is now logged; the response carries only
a stable code, since the cause is for an operator and not for an
unauthenticated caller. Six tests cover it.

### 4. A database restart killed the api and every worker

`docker compose stop postgres` terminated the api container with exit code 1,
and the three workers with it. This was found only after the restructure, when
the containerised stack was re-tested end to end.

Cause: `pg.Pool` emits an `error` event when an **idle** pooled connection dies
-- a database restart, failover, or dropped link. Node escalates an unhandled
`error` event on an EventEmitter into a fatal uncaught exception. With no
listener attached, every database blip took down the whole system at once.

Why it matters more than it looks: NFR-4 is about one worker dying and its work
being reclaimed. A database restart killing _every_ worker simultaneously is a
strictly worse failure mode, and it would have appeared in M10's fault-injection
test as an unexplained total outage.

Fix: attach a pool `error` listener that records the cause and lets the pool
discard the broken client; later queries open a fresh connection. Verified by
`docker compose restart postgres` with the stack running -- api up, all three
workers up, `/readyz` back to 200, one log line recorded. Three tests cover it,
including one asserting the listener exists at all.

## Re-verification after restructuring

The repository was reorganised into `core/`, `api/` and `worker/` layers
(ADR-0006) after the first acceptance run, so the whole suite was executed
again from a clean volume. All results above are from that second run.

An automated boundary test was added at the same time. It was validated by
introducing a deliberate violation -- and **the first version passed anyway**,
because its regex matched only `from '...'` and missed bare side-effect imports
such as `import '../api/api.module'`. After widening it to cover bare imports
and `require()`, the same violation failed the test with the offending edge
named. A guard that has never been seen to fail is not known to work.

## Not yet proven

- The `Dockerfile` runs as the `node` user but this was not tested against a
  read-only filesystem.
- No load, concurrency or failure-injection testing — that is M10, and it
  requires the scheduler (M4) to exist first.
- `SSRF_GUARD_ENABLED` is read but nothing consumes it yet; the guard arrives
  in M3.
