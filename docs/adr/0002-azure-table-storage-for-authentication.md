# Azure Table Storage for authentication records

Memories Wall stores application-owned Users, Verification Challenges, and Sessions in Azure Table Storage rather than PostgreSQL. Azure Table Storage is the approved durable persistence boundary for the first authentication implementation; domain behavior remains independent of the storage provider so Wall authorization, User deletion, and Session lifecycle stay coherent.

## Consequences

The persistence layer must provide unique canonical Email Address ownership, atomic or idempotent User-and-Wall provisioning, single-use Verification Challenge consumption, Session revocation, and cleanup of expired records. Authentication tests should use a replaceable storage boundary rather than depending on a live Azure account, while an integration suite may verify the Azure adapter separately.
