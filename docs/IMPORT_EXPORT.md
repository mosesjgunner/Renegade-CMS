# Import and export

## Import

Versioned pipeline: source -> parser -> normalization -> identity mapping -> media transfer -> content mapping -> relationship repair -> redirects -> validation -> report.

Use a dry run before writes. Stable source IDs plus deterministic IDs make resumed runs duplicate-safe. Retain checkpoints and failed-row reports. WordPress WXR/REST, Ghost, Substack, Medium, phpBB, bbPress, Markdown, JSON and CSV are lawful adapter boundaries; third-party sources require authorization. Review authors, original dates, media, relationships and redirects. Translation and media imports use their established adapter/governance boundaries. Imports never auto-enrol marketing consent or finalize financial records.

## Portable archive

The version-1 portable manifest is checksummed and refuses secret material. The portable archive uses AES-256-GCM with a separately held 32-byte key; restore authenticates ciphertext and validates manifest checksums. Never export OAuth/provider secrets, session tokens, passkey private material, wallet private keys, recovery keys, raw payment credentials, IdP secrets, or plaintext break-glass material.

## Supported executable workflow

Use `npm run portability -- export --site-id <source-site-uuid> --file site.rpa.json --key <64-hex-character-key>` to create an encrypted portable archive. The command exports only the selected site's records and copies each selected media object into the encrypted archive; a missing object is an actionable failure rather than a silently incomplete export. The key is intentionally never written to the archive or checkpoints.

Import requires an existing, separately created target site: `npm run portability -- import --target-site-id <destination-site-uuid> --file site.rpa.json --key <key>` runs dry by default and prints the planned report without writes. `--apply` performs the write. The source site record is never imported over the target: every site-scoped record is remapped to the target site, preserving its stable document IDs and relationships. Existing IDs in the target are updated (repeat import is idempotent); an existing ID belonging to another site fails with an explicit conflict. Media objects are restored under the destination site's storage prefix. `--checkpoint <file> --resume` resumes a failed write safely and writes failed-row details to the checkpoint file. Credential-dependent adapters are not configured by this command.
