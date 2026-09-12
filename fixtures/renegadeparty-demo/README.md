# RenegadeParty.org Demo Site Package (PUB-06)

This directory contains the deliberate demo site content package and portable assets for **RenegadeParty.org**, created and verified under release gate **PUB-06**.

## Contents

- `assets/`: Real PNG assets composited with Sharp for production and demonstration fidelity:
  - `logo.png` (200x200 badge) — Site identity seal.
  - `social-default.png` (1200x630 card) — Open Graph and Twitter Card default image.
  - `hero-liberty.png` (1200x600 banner) — Hero banner for featured post.
  - `inline-assembly.png` (800x500 diagram) — Inline diagram for article bodies.
- `manifest.json`: Structured metadata specifying the site configuration, 2 pages, 5 posts (all required editorial states: draft, scheduled, published with draft revision, changed slug with 308 redirect, archived), taxonomy, and navigation.
- `renegadeparty-portable-archive.json`: Portable encrypted JSON archive created via `npm run portability export`.
- `README.md`: This reference and evaluation guide.

## Editorial Content & Lifecycle States

1. **Pages**:
   - `/platform` ("The Renegade Platform") — Comprehensive policy positions.
   - `/principles` ("Core Principles of Autonomous Governance") — Fundamental governance values.

2. **Posts**:
   - `/articles/renegade-declaration` — The founding declaration (slug changed from `initial-declaration` with verified HTTP 308 redirect).
   - `/articles/decentralized-truth` — Verifiable records essay (published with a newer unpublished draft revision; contains unique search phrase `"Decentralized truth cannot be silenced by centralized gatekeepers"`).
   - `/articles/2027-national-assembly` — Future scheduled agenda (status: `scheduled`, embargoed from anonymous readers).
   - `/articles/grassroots-strategy-memo` — Internal strategy memo (status: `draft`, token preview accessible, public 404).
   - `/articles/archived-legacy-resolution` — Historical item (status: `archived`, public 404).

## Evaluation & Portability

Exporting:

```bash
npm run portability -- export --file fixtures/renegadeparty-demo/renegadeparty-portable-archive.json --key <64-hex-key> --site-id <site-id>
```

Importing into target site:

```bash
npm run portability -- import --file fixtures/renegadeparty-demo/renegadeparty-portable-archive.json --key <64-hex-key> --target-site-id <target-site-id> --apply
```
