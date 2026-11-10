# GUI-03A — Route ownership and operator-shell composition

**Result: PASS** (map delivered; chrome change deliberately deferred, scoped)

## Changed files

- `docs/beta/gui-overhaul/route-ownership.md` — the ownership map:
  two trees, runtime precedence (frontend wins collisions), the
  collision table (email-composer, workflow, audience, releases,
  telemetry), frontend-only pages, Payload-only surfaces.
- `docs/beta/gui-overhaul/progress.md` — 03A row.

## Runtime verification

- Authenticated GETs against the production build: all five probed
  collision paths return 200. HTML-signature checks on email-composer
  and workflow confirm the FRONTEND tree serves them (no Payload shell
  markers; the components' own text present). `/admin/ai` (frontend
  only) also serves.
- Access guards untouched; no route renamed; no code changed.

## Why no chrome code

The prompt asks for the smallest safe shared chrome. With precedence
proven to sit in the frontend tree, wrapping or replacing chrome now —
before 03B sets the navigation model — would either double-shell the
Payload views or strand the frontend pages. The map sequences the
safe path and names email-composer as the first dedup candidate
(identical component, Payload view already registered).

**Exact next prompt: GUI-03B.**
