# Passwordless email-code authentication

Memories Wall authenticates Users through short-lived, single-use Verification Challenges sent to their verified Email Address, rather than passwords or delegated authentication. Users, Verification Challenges, and fixed 30-day revocable Sessions are owned by the application and persisted in Azure Storage Table, so Wall authorization, User deletion, and future access rules share one model; email delivery remains an interchangeable infrastructure boundary.

## Considered Options

- Password authentication, rejected to avoid password storage and recovery complexity.
- Self-contained stateless tokens, rejected because revocation, sign-out everywhere, and deletion are clearer with server-stored Sessions.
- Delegated authentication, rejected because the application must own User and Wall lifecycle semantics.

## Consequences

Verification Challenges require secure code generation, one-way code storage, expiration, single-use enforcement, and email/IP rate limits. Protected User-owned reads and writes must require a valid Session, while the demo showcase remains separate from User identity.
