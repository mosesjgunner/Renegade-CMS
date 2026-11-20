# UXI-05 — Make browser setup resumable and recoverable

Goal: cancel/refresh/lost-response can never strand ownership.
Done (the core of this pass): resumable passkey enrollment via enrollment-session rotation; /setup resume mode gated on the enrollment cookie; cancel-specific form copy preserving all answers; completion recovery kit with copy/download/acknowledgment; in-product owner-only recovery-code rotation (service + route + Security settings UI) invalidating old codes and other sessions. Proven by tests/integration/installation-resume.integration.test.ts (5/5) alongside the existing installation suite (3/3).

## Continuation — Stage 4 (Nov 19, 2026): guided-setup site resolution (UXI-D11 closed)

The remaining UXI-05 defect was the guided-setup screen itself: it asked for a hand-typed "Target Site Slug / ID" defaulting to the seed slug `demo-publication`, while both install APIs require the site's internal ID — so the default failed on every real install.

What shipped:

- New server context route `GET /api/admin/guided-setup` (`src/app/(frontend)/api/admin/guided-setup/route.ts`): resolves the signed-in user's authorized sites server-side from the operator grant (cookie's active site first), and returns each site's friendly name, visibility, public origin, starter status, and example-content summary. Internal IDs travel only inside API calls; the page never displays one.
- `src/app/(frontend)/guided-setup/page.tsx` rewritten around that context: exactly one authorized site is used automatically and shown by name; several sites get a picker by NAME (switching asks via the shared unsaved-work guard, then resets all local selections with a visible notice); no access renders an honest explanation plus sign-in / first-run-setup / Dashboard next actions and no form.
- "Page Destination Path" is now "Page address" with a live preview of the full public URL (the site's canonical origin + address). Recipe/spec/theme-ID vocabulary is replaced with the pass vocabulary (Site type / starter design / Sections on the page); theme IDs and block component internals live only under an "Advanced details" disclosure. The starter gallery and next-steps content are kept — this was a unification, not a deletion.
- Both install actions (draft layout via `/api/layouts`, full starter via `/api/admin/starters`) run against the resolved internal site ID.

Proof: the Stage 4 journey integration test exercises the same grant resolution and install path against a real provisioned site; typecheck and the full suites are recorded in UXI-06's continuation.
