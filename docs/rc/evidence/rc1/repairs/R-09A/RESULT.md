# R-09A — Audience signup, consent and unsubscribe lifecycle

## STATUS

- **09A (newsletter signup / consent / confirmation / suppression): PASS**
- **R-09A: PASS** (2026-11-03, local production processes on this
  Docker-less host). Branch `rc1-repair-09a` from
  `rc1-repair-08-social` @ `dcc7c40`; tested tree `28df0c0` (the
  evidence/ledger commit on top changes no source).
- **No prior 09A record existed:** the ledger had no 09A row and
  there was no frozen 09A evidence folder. A 09A row was inserted
  before the 09B row stating this; nothing historical was rewritten.

One genuine product defect was reproduced and repaired (see FIRST
FAILURE / CHANGES): two truly concurrent duplicate signups raced the
find-then-create in `requestDoubleOptIn`, and the loser received an
HTTP 400 leaking the unique-index field names (`site_id, email_hash`)
instead of the standard safe 202 pending response. The data itself
converged (exactly one subscriber row); the request did not.

## BASE PARITY

Before any claim, the R-09A-scoped source (audience, email,
subscriber API routes/pages, Audience collections) was diffed
against the corrected union `rc1-union` @ `604e940`: **empty**. The
full `src/` diff vs the union is exactly the nine accepted files
from R-03A (Sites/hierarchy), 17E (commerce tasks), R-05C/R-03D
(portability) and R-08 (social security) — all outside R-09A scope.

## ENVIRONMENT

- Node v24.22.1; PostgreSQL **16.15** (local cluster); **131
  migrations** applied to the disposable database `rc1r09a_main`.
- Production standalone server + jobs worker as local processes
  behind a local HTTPS proxy (ports 38811/38812), Standard profile,
  test auth DISABLED; the owner is a genuine WebAuthn software-
  authenticator ceremony (no fixture session for the owner).
- Mail: `EMAIL_MODE=smtp` to a capture SMTP server run by the
  verifier itself on 127.0.0.1:3143 (the product's development
  capture adapter is process-local and unreadable across
  processes). EMAIL_FROM `newsletter@rc1-09a.test`. No external
  sends; local sink only.
- Build: the pre-existing build (sourceSha `c52f211`) was
  src-identical to the base; after the product fix the tree was
  rebuilt (`Built source 28df0c0`) and the acceptance rerun against
  the rebuilt standalone server. `next-env.d.ts` restored.

## FIRST FAILURE (the defect)

Reproducer (pre-fix build): fire two simultaneous
`POST /api/subscribers/subscribe` requests for the same new address
on the same site/list. Both miss the subscriber find; both attempt
the create; the unique `(site_id, email_hash)` index lets one win
and the other's `payload.create` throws Payload's ValidationError,
which the route surfaces as **400 `{"error":"The following field is
invalid: site_id, email_hash"}`**. Post-state: 1 subscriber
(pending), 1 confirmation token — data converged, response did not.
The R-09A must-pass requires duplicate submissions to converge to
one subscriber and one usable confirmation token; a leaked internal
error to one of the two submitters is not convergence.

## CHANGES

- `28df0c0` — `src/modules/audience/service.ts`,
  `requestDoubleOptIn` only:
  - Subscriber create: catch the unique-index race, re-find, and
    continue on the winner's row (rethrow if still absent).
  - Membership create: the identical find-then-create race against
    the unique `(subscriber_id, audience_list_id)` index gets the
    same catch-and-refind convergence.
  - Confirmation token: after creating a token, re-query live
    tokens; a racer whose token is not the earliest withdraws its
    own token and returns the existing replay response, so exactly
    one live confirmation token and one confirmation email survive.
  - No assertion, test, or scope was weakened; no other product
    file changed.
- Harness (tests only, `tests/rc1-r09a/`): `3118290` plus
  alignment commits — per-site operator origin handling (admin
  mutations trust the APP_URL origin by design; Beta context via
  the supported `?siteId=` parameter), an operator site-role grant
  fixture for the Beta site, an SMTP-450 temporary-failure sink
  mode for the retryable race, and assertions updated to the
  product's observed, stronger unknown-outcome semantics (below).

## REAL WORKFLOW (final run, supervisor run 12)

Journey **41/41 passed** (`journey-trace.json`), restart **8/8
passed** (`restart-trace.json`), against persisted state read back
from PostgreSQL and the capture sink at every step:

- Anonymous browser signup (visitor-one) → consent-provenance event
  (`requested`, wording + source) + pending subscriber/membership →
  confirmation email captured → link opened in a browser → one-time
  confirmation (token `usedAt` set; `double-opt-in-confirmed` event
  carries the token id) → subscriber active.
- Duplicate signup (sequential) is idempotent: still 1 subscriber,
  1 live token, 1 email (documented replay semantics).
- Operator campaign flow (real `/api/admin/audience/campaign`):
  segment evaluation counts total 2 / matched 1 / eligible 1 (the
  pending visitor excluded); snapshot pins exactly 1 recipient;
  campaign 1 delivered via SMTP with real per-recipient signed
  preferences + unsubscribe links and a List-Unsubscribe header;
  **no delivery exists for the unconfirmed visitor**.
- Preferences page: grant recorded (`preference-granted`,
  subscriber stays eligible) → withdrawal unsubscribes + suppresses
  (`preference-withdrawn`); re-evaluation then shows 0 deliverable /
  `isEmpty`, and save-and-schedule to the empty audience is refused
  **400 with `emptyAudience: true`**.
- Resubscribe: fresh confirmation issued, suppression lifted on
  confirm (`resubscribe` event), campaign 3 delivered.
- **Suppression race:** campaign 4 queued against an SMTP-450
  temporary failure (delivery `queued`, attempts ≥ 1); subscriber
  unsubscribes via the campaign-3 email link; the queued delivery
  is **cancelled with outcome `suppressed-before-send`** and never
  arrives after the sink recovers. A late unsubscribe wins over a
  pinned snapshot.
- **Unknown-outcome parking (Beta):** with the sink fully down
  (socket-level failure), both Beta deliveries park as `unknown` /
  `unknown_outcome` / `retryable: false`. After the sink returns,
  suppressing one recipient gets that parked delivery **cancelled
  by the send-time eligibility re-check** (`suppressed-before-send`)
  on the reconciliation pass — never sent; the still-eligible
  recipient's delivery stays parked, and the operator retry route
  refuses it **409 "cannot be safely retried"** (frozen 09C
  semantics, observed — not a defect claim).
- Cross-site: the same address on Beta is an independent
  subscriber; confirming Beta activates only Beta; subscribe naming
  a foreign siteId → 400, a foreign listId → 400 "Newsletter
  unavailable".
- **Concurrent duplicates (post-fix):** both responses 202; exactly
  1 subscriber, 1 live token, 1 confirmation email (check 41).

## NEGATIVES

- Reused confirmation token → safe denial, no second token/email.
- Forged confirmation token → denied.
- Access tokens are purpose-bound: a preferences token cannot
  unsubscribe and an unsubscribe token cannot open preferences
  (400 both ways); tampered claims (foreign subscriber id under a
  valid signature) → 400; expired access token (issued via the
  product's own issuer with negative TTL) → 400; expired
  confirmation token (fixture row with past expiry) → 400 and the
  subscriber stays pending.
- An address suppressed for `bounce` (via the product's own
  `suppressSubscriber` service, labelled operator fixture) is
  refused at browser signup with "This address cannot be
  subscribed." and no subscriber row is created; only
  `unsubscribe` suppressions can be lifted, by a fresh confirmed
  double opt-in.

## RESTART

Web + worker process restart **and** a real PostgreSQL cluster
restart (`pg_ctlcluster restart`): subscriber states, suppression
rows, consent-event counts and the campaign-1 snapshot hash are
unchanged; the cancelled race delivery stays cancelled; zero sends
in a 20 s post-restart observation window; a fresh
signup → confirm → active lifecycle works and segmentation then
counts exactly that one new eligible subscriber.

## TESTS

- Focused units (`npx vitest run`, 9 audience/email files):
  **75/75 passed**.
- Canonical integration journey
  (`tests/integration/aud-public-subscription-journey.integration.test.ts`
  via `scripts/run-integration.mjs` against a migrated
  `rc1r09a_release_acceptance` database): **4/4 passed**.
- Full unit suite on the final tree: **2065 passed / 5 failed
  (2070)** — identical to the R-08 chain-tip baseline; the 5
  failures are the named pre-existing set (flow-04-acceptance,
  payload-domains, rc1-04d-campaign-commerce, shop-08 ×2). Delta
  zero; the fix adds no unit tests — its regression proof is
  journey check 41 against the rebuilt production server plus the
  integration journey above.
- Final-tree `npx tsc --noEmit`: **exit 0**.
- Supervisor runs 1–11 are harness history (origin/grant fixture
  alignments, a VM replacement that dropped PostgreSQL mid-task,
  and the pre-fix defect reproduction); run 12 is the recorded
  acceptance.

## BOUNDED / UNEXECUTED

- No Docker/Compose proof on this host (definitively unavailable
  here); production processes are the local bound, as in prior
  repairs.
- Local SMTP capture sink only — no remote provider or real-world
  delivery claim.
- Operator-side negatives use the ceremony owner's session (the
  only WebAuthn claim available); the Beta operator grant is a
  Local-API fixture mirroring the creator grant Alpha received.
- Bounce suppression and the expired-confirmation-token row are
  service/fixture setups (labelled above); every lifecycle
  transition they gate is then exercised through real browser/API
  flows.
- Aggregate RC1 remains NOT READY; no other repair was started.
