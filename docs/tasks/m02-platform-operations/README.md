# Milestone 02: Platform operations

## Objective

Deliver a safe self-hosted shell: locked first-run installation, validated production configuration, PostgreSQL-backed jobs, useful diagnostics, proven backups, and VPS deployment artifacts.

## Dependency state

M01 is accepted locally. The 2026-08-11 baseline replay passes format, lint, type-check and unit checks; database-backed checks require an explicit test environment because `.env` is intentionally absent. There is no Git repository or remote authority.

## Included scope and order

1. Central production configuration and proxy/cookie safety.
2. Locked first-run owner/site setup plus operator recovery.
3. Payload PostgreSQL jobs with scheduling, retry evidence and admin visibility.
4. Public health and authenticated system diagnostics.
5. Backup/restore drill, retention and migration/update conventions.
6. Production Docker/VPS proof and milestone acceptance.

## Non-goals

Content models, provider marketplace, social scheduling, newsletters, object-storage adapters, and a polished monitoring dashboard.

## Proof gate

A clean operator install stays locked after restart; unsafe production config is rejected; scheduled and retrying jobs persist and are visible; a backup restores into a disposable database; production artifacts document proxy, worker, storage, migrations, rollback boundaries and disaster recovery.
