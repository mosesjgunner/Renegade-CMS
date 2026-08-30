# Import and export

## Import

Versioned pipeline: source -> parser -> normalization -> identity mapping -> media transfer -> content mapping -> relationship repair -> redirects -> validation -> report.

Use a dry run before writes. Stable source IDs plus deterministic IDs make resumed runs duplicate-safe. Retain checkpoints and failed-row reports. WordPress WXR/REST, Ghost, Substack, Medium, phpBB, bbPress, Markdown, JSON and CSV are lawful adapter boundaries; third-party sources require authorization. Review authors, original dates, media, relationships and redirects. Translation and media imports use their established adapter/governance boundaries. Imports never auto-enrol marketing consent or finalize financial records.

## Portable archive

The version-1 portable manifest is checksummed and refuses secret material. The portable archive uses AES-256-GCM with a separately held 32-byte key; restore authenticates ciphertext and validates manifest checksums. Never export OAuth/provider secrets, session tokens, passkey private material, wallet private keys, recovery keys, raw payment credentials, IdP secrets, or plaintext break-glass material.

## Supported executable workflow

Use `npm run portability -- export --file site.rpa.json --key <64-hex-character-key>` to create an encrypted portable archive. The key is intentionally never written to the archive or checkpoints. Use `npm run portability -- import --file site.rpa.json --key <key> --dry-run` first; it validates the archive and prints the planned report without writes. Run again without `--dry-run` only after review. `--checkpoint <file> --resume` resumes a failed write safely and writes failed-row details to the checkpoint file. Credential-dependent adapters are not configured by this command.
