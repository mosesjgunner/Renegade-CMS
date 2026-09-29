# Media Library stabilization evidence — 2026-09-28

- **Node:** `3.1 Media Library composed route`
- **State:** `PARTIAL`
- **SHA / configuration:** `8ea0e248412252b230d1b3a5b76d6791798c449d` (dirty worktree); standard local server at `http://localhost:3000`; configured `renegade` database; no `LOCAL_E2E_TEST_MODE` and no database reset.
- **Workflow and command:** authenticated headless Chromium run against `/admin/media-library?siteId=<active-site>` using a temporary passkey session that was removed after each run; `npx.cmd eslint src/modules/admin/MediaLibrary.tsx`.
- **Artifacts:** `test-results/stabilization-media-library-current.png`.
- **Result / remaining limit:** The page loads, lists four scoped assets, selects an asset and opens metadata management. An invalid Command Center site request returns HTTP 400 rather than data. The initial browser run exposed the first product failure: the visible Command Center queried absent optional `media-jobs` in the default profile. `MediaLibrary` now renders a clear unavailable explanation instead of the broken command surface. An archive action performed during acceptance was immediately undone through the authenticated undo operation; the affected asset was rechecked as `retentionMode=permanent`, `removeFromDiscovery=false`. Upload/create, metadata save/reload, and optional Command Center workflows remain unaccepted in this non-destructive standard-profile pass.
