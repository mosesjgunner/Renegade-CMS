# Import and export

## Import

Versioned pipeline: source -> parser -> normalization -> identity mapping -> media transfer -> content mapping -> relationship repair -> redirects -> validation -> report.

Use a dry run before writes. Stable source IDs plus deterministic IDs make resumed runs duplicate-safe. Retain checkpoints and failed-row reports. WordPress WXR/REST, Ghost, Substack, Medium, phpBB, bbPress, Markdown, JSON and CSV are lawful adapter boundaries; third-party sources require authorization. Review authors, original dates, media, relationships and redirects. Translation and media imports use their established adapter/governance boundaries. Imports never auto-enrol marketing consent or finalize financial records.

## Portable archive

The version-1 portable manifest is checksummed and refuses secret material. The portable archive uses AES-256-GCM with a separately held 32-byte key; restore authenticates ciphertext and validates manifest checksums. Never export OAuth/provider secrets, session tokens, passkey private material, wallet private keys, recovery keys, raw payment credentials, IdP secrets, or plaintext break-glass material.
