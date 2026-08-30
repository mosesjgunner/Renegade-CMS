# M15 portability import/export boundary

This versioned, framework-neutral foundation provides a lawful-export-only adapter registry, discovery, mapping preview, validation, dry runs, deterministic IDs, resumable checkpoints, warnings/errors, redirect output, media manifest entries, and a created-by-run rollback boundary. It does not screen-scrape access-controlled sources. API paths require authorization; Medium, Substack, WordPress API, YouTube and social sources accept only lawful supplied exports or authorized adapter output.

CSV mappers require identity, consent, and financial review. The framework refuses silent marketing enrollment and silent financial finalization. Forum migration supports authorized phpBB-style, bbPress and official Discourse exports; hierarchy, topics/posts, authors, dates, attachments, replies/quotes, moderation and legacy paths map where an export carries them, while extension-specific fields are reported.

Portable export manifests are importable and checksummed. They exclude secrets, OAuth tokens, passkey private material, message private/recovery keys (except separately member-encrypted recovery packages), wallet private keys, raw payment credentials and provider secrets. Processor billing mandates, external fulfillment accounts, and optional graph projections are nonautomatic transfers; canonical Events and Timelines transfer.

Legacy templates use conversion assistance: inventory structure/assets, recognize component regions, map only to registered components/tokens, import assets, isolate unconvertible code, output redirects, and require visual plus editor review. It is not a one-click conversion claim.

This is contract-tested only. It does not yet persist import runs, perform network media transfer, serialize every collection, or prove a disposable-install round trip. Those remain M15 release blockers.

## Presentation/content packages (Prompt 11)

`src/modules/packages` defines the registry-ready, data-only `renegade-package` v1 format. Packages may be themes, templates, reusable block presets, or starter-site/content packs. Every manifest names its package, author, semantic version, core/schema ranges, resources, dependencies, required/optional capabilities, license, and SHA-256 integrity metadata. Package inspection rejects traversal, duplicate paths, executable extensions, oversized files/archives, malformed manifests, checksum mismatches, unsupported compatibility ranges, missing dependencies, and unavailable required capabilities before resources are parsed.

Templates and presets refer only to existing registered Puck/layout block IDs; no JSX, CSS, executable code, provider configuration, credentials, user accounts, or private data travels in a package. Starter records retain stable package resource IDs, installation uses package-owned deterministic resource keys, and existing user records are never overwritten. Removal is allowed only after deactivation and removes only resources owned by that package. Missing active themes select the neutral starter fallback, preserving canonical content.

Owner-only lifecycle operations support inspection/preview, compatibility verification, installation, activation where relevant, deactivation, and safe removal through a small persistence boundary ready for a future registry or Payload adapter. Locally created templates, presets, and starter content are export-eligible; themes are deploy-reviewed presentation definitions and are not re-exported as arbitrary code. `reference-packages.ts` includes a first-party template, block preset, and writer starter pack for cross-installation verification.
