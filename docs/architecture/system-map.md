# System Map

Renegade CMS is a modular monolith: one TypeScript/Next.js deployable owns the product surface while domain boundaries remain explicit. Extraction into separate services is deferred until a measured scaling, security, or operational reason exists.

## Runtime Shape

```text
Browser / clients
  |
  | public pages, admin UI, API requests
  v
Next.js application
  |
  | route handlers and rendering edges
  v
Payload composition root
  |
  | collections, hooks, access rules, migrations
  v
PostgreSQL
```

The public presentation edge lives under `src/app/(frontend)`. Payload admin and API routing live under `src/app/(payload)`. Domain contracts live below `src/modules`, with `src/modules/core` acting as the framework-neutral vocabulary boundary.

## Current Implemented Path

```text
Core contracts/config/logging
  |
  v
Publications boundary
  |
  v
Payload collections and seed data
  |
  v
Neutral public route and health proof
```

This path supports the foundation slice: configure one site/publication, prove the app can compose with Payload and PostgreSQL, and keep platform contracts neutral. Renegade Party remains a first production publication/theme concern, not a required core dependency.

## Domain Ownership

The durable module ownership rules are defined in [Module map](module-map.md). In short:

- `platform/core` owns IDs, scope, time, lifecycle vocabulary, configuration, errors, audit/job vocabulary, and data classes.
- `publications` owns tenant/site/publication settings and membership.
- `content`, `editorial`, `presentation`, `media`, `identity`, `providers`, `commerce`, `analytics`, and other modules own their records through explicit ports instead of shared persistence access.
- Route handlers and Payload collection adapters may import domain contracts; domain modules do not import Next.js or route code.
- Public serializers allowlist fields and must not spread persistence objects into client props.

## Data and Contract Flow

```text
Domain contracts
  -> Payload adapters and collections
  -> PostgreSQL records
  -> allowlisted serializers/projections
  -> public rendering, feeds, exports, or admin views
```

Cross-module writes should go through the owning module command. Cross-module reads should use explicit public read contracts or stable capability keys. Provider-specific state remains inside provider adapters and is translated into Renegade-owned records or capability snapshots.

## Operational Boundaries

M01 proves local development, migrations, seed data, CI-equivalent checks, and a PostgreSQL-backed application baseline. Production deployment, backups, background job operations, observability, and managed-hosting readiness remain open operational work and should be closed through future implementation docs or ADRs.
