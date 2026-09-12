-- Core enum types shared by later migrations.
-- Sources: docs §3.4 (failure taxonomy), §3.7 (state machine), §7.5 (schema).

-- Endpoint / probe outcome states (docs §3.7).
-- UNKNOWN is first-class: a missing result must never read as health.
CREATE TYPE endpoint_state AS ENUM (
    'up',
    'degraded',
    'pending',
    'down',
    'maintenance',
    'paused',
    'unknown'
);

-- What a single probe concluded. Narrower than endpoint_state: a probe cannot
-- observe 'pending' or 'paused', those are properties of the endpoint's run.
CREATE TYPE probe_outcome AS ENUM (
    'up',
    'degraded',
    'down',
    'unknown'
);

-- Failure taxonomy (docs §3.4). BLOCKED_BY_POLICY is probeboard refusing to
-- probe, not the endpoint failing, and is therefore excluded from uptime.
CREATE TYPE failure_class AS ENUM (
    'dns_nxdomain',
    'dns_failure',
    'connection_refused',
    'connection_timeout',
    'connection_reset',
    'tls_expired',
    'tls_untrusted',
    'tls_hostname_mismatch',
    'tls_handshake_failed',
    'response_timeout',
    'body_timeout',
    'status_mismatch',
    'assertion_failed',
    'too_many_redirects',
    'blocked_by_policy',
    'unknown_error'
);

-- Aggregate granularity (docs §7.5).
CREATE TYPE stat_grain AS ENUM ('m1', 'h1', 'd1');
