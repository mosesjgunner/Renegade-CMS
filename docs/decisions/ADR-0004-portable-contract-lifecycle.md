# ADR-0004: Portable contract and capability lifecycle

- Status: accepted
- Date: 2026-08-12
- Scope: Milestone 01 cross-system contracts

## Context

Future Member, messaging, scheduling, provider and commerce features would otherwise each create competing identity, ownership, retention and compatibility semantics. M01 needs to freeze their common vocabulary without pre-building feature repositories, collections or UI.

## Decisions

1. `Member` is canonical. Passkeys, OAuth/social accounts, signed wallets and email magic links are revocable `LinkedIdentity` credentials. Core excludes passwords, password hashes, resets and password login. Staff/owner security remains separate.
2. Wallet clients are transports, not identity authorities. Renegade verifies nonce-bound signatures, links accounts, issues/revokes sessions and records audit. Account names use CAIP-style namespace-compatible identifiers plus normalized key material and proof provenance.
3. Every optional module publishes a manifest and capabilities, not a vendor contract. Consumers query capability keys. Enable/update/import/restore checks core, schema, module and theme compatibility before action.
4. Modules own migrations, rollback assessments and backup/export. Disable/archive/uninstall follows the manifest and refuses destructive uninstall when live data requires export or confirmation. Unknown data is preserved; unsafe downgrades are refused.
5. Retention policy and encrypted envelope are shared optional contracts. Encrypted-message implementation must choose an audited library in its owning milestone and must not claim forward secrecy before it is implemented and tested.
6. Managed hosting, if offered, provisions isolated instances through an operations boundary. It may not make a provider the owner of tenant product data or bypass the portable export/recovery model.

## Consequences

`src/modules/core/contracts.ts` holds framework-neutral types only. Persistence owners choose concrete schemas and state machines in their milestone. PostgreSQL/Payload remains the M01 single-app substrate; no monorepo, package split, managed-control-plane implementation or feature UI follows from this ADR.

## Recovery boundary

Backups/restores retain data subject to the declared backup-retention boundary. Cryptographic recovery is only available when a future audited implementation explicitly supports it. Operators retain control of PostgreSQL, media, secrets and exports; no system promises to erase copies outside its control.
