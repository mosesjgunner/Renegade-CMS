# UXI-07 — Make navigation and site context coherent

Status: OUT OF EXECUTED SCOPE except the setup spine's own coherence (one vocabulary: "Site features", "Live check", consistent recovery language across installer, form, and Security settings). Admin-shell/dashboard coherence belongs with the admin and System 2 surfaces; no competing changes were made. Recorded as a follow-up input, not claimed.

## Continuation — Stage 4 (Nov 19, 2026): coherence, scoped honestly

Shipped:

- Shared active-site indicator: `src/modules/admin/ActiveSiteIndicator.tsx` (presentational, friendly site name + non-public visibility note, never an ID). Used by the frontend admin layout (`src/app/(frontend)/admin/layout.tsx`, which now also carries Dashboard / Guided setup nav) and by guided setup.
- Vocabulary on touched surfaces: the frontend admin home is "Dashboard" (the guided-setup header's "Open Payload Studio" link now reads "Dashboard"; PublisherDashboard already titled itself Dashboard). Guided setup uses the pass vocabulary throughout (see UXI-05 continuation).
- Unsaved-work protection: reusable `src/hooks/useUnsavedWorkGuard.ts` (beforeunload while dirty + a confirm for in-page context switches). Applied in guided setup (site switching discards local selections only after confirmation, then resets with a notice) and in the setup form (armed while answers are unsubmitted).
- `/preferences` (orphaned duplicate of `/subscribe/preferences`, no inbound links per the Stage 1 inventory) is now a redirect to `/subscribe/preferences`, preserving the token query parameter.

Explicitly NOT done (remains for Stage 9): a platform-wide admin shell rewrite; per-page headers outside the shared frontend admin layout (Payload's own admin shell is untouched); the duplicated `/moderation` surface and other Stage 1 orphans beyond `/preferences`; unifying the Payload custom views with the frontend `/admin/*` pages.
