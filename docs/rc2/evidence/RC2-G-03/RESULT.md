# RC2-G-03 — Network, federation and interoperable public contracts

**Verdict: PASS** — a real network-owned journey, not a headless-API pass: this installation's
publication is an ActivityPub actor; a second, independent consumer (a deterministic local
peer on HTTPS loopback, the shape the product's own local-peer policy allows) discovers it,
follows it with a cryptographically signed activity, receives the signed Accept delivery,
posts a federated reply that lands in the article's discussion, and is then blocked — after
which its signed activities are refused. Journey 9/9 stages (run 6, exit 0). One P1 product
bug was found and fixed in this PR; one P2 is filed (RC2-DEBT-22).

## Disabled-first baseline (the pack's survival requirement)

With networking off (the default), WebFinger, the actor document, and the inbox all answer
404 and the CMS serves normally — federation, and by the same config posture Web3/IPFS and
Renegade ID (contract-only, E0, nothing to enable), are strictly opt-in. The journey then ran
with `NETWORKING_ENABLED=true` on the Standard profile (the config validator refuses
networking on Lean).

## The journey (all over real HTTP, signatures verified by the product)

1. **Discovery + integrity readback**: WebFinger resolves `acct:<publication>@<host>` to the
   actor URL; the actor document is self-consistent (id, inbox, publicKey owner all match);
   the outbox reads back 200.
2. **Signed Follow → persisted exchange**: the peer's Follow carries an HTTP Signature
   (rsa-sha256 over request-target, host, date, digest). The inbox resolves the peer's actor
   document from the peer itself, verifies the signature against the peer's published key,
   records the inbound activity, and persists an active inbound follow relationship —
   publicly readable in the actor's followers collection.
3. **Reciprocation is delivered, not just queued**: the jobs worker signs and delivers the
   Accept to the peer's inbox; the peer's own delivery log is the readback.
4. **Replay dedupes**: re-sending the same Follow activity returns 202 and adds nothing.
5. **Forgery fails closed**: a Follow signed with the wrong key is refused 401 and changes
   nothing.
6. **Federated content lands**: a signed Create/Note replying to the published article is
   persisted as a discussion post in that article's discussion, held for review
   (`moderationState: 'review'`, status hidden) — remote content arrives moderated, never
   auto-visible.
7. **Revocation denies**: after the operator records a block decision for the peer (staff
   REST), the peer's next validly signed activity is refused 401. (Repeated refused attempts
   additionally escalate to the 429 invalid-signature source throttle — observed in run 5.)
8. **Unknown actors fail closed**: actor document and WebFinger for unknown handles are 404.

## Finding F1 (P1, FIXED in this PR): every federated reply bounced

`remoteReply()` mapped inbound replies to `moderationState: 'pending'` — a value the
community schema retired when its vocabulary became `clear / review / restricted / removed`.
Every federated reply therefore failed validation inside the inbox: the sender got a 401 and
the reply was silently lost, while Follows (which never touch that mapper) worked — a live
federation surface with a dead content path, invisible to the existing unit test because the
test asserted the same stale value. Fix: the mapper now emits `'review'` (the held-for-review
state the test always intended), and the unit test asserts it — verified fail-on-old /
pass-on-fixed (`tests/unit/activitypub.test.ts`, 7/7).

## Finding F2 (P2, filed as RC2-DEBT-22): a failed processing burns the dedupe key

The inbox records the inbound activity (with its replay/dedupe key) _before_ processing it.
When processing then throws (as F1 made it do), the record stays `accepted` forever and a
legitimate retry of the same activity is treated as a duplicate replay — acknowledged 202,
never processed. The sender cannot recover the activity. Smallest repair: record the dedupe
key only after successful processing, or mark failed records reprocessable.

## Characterizations (measured, not filed as debt)

- Follow relationships are keyed per _activity_, not per actor: distinct Follow activities
  from the same actor create duplicate relationship rows, and the followers collection then
  lists the actor once per Follow. Cosmetic at this scale; RC3 federation hardening material.
- A block decision stops new inbound activity but does not rewrite existing relationship
  state (the follow row stays `active`); revocation here is a gate, not an unfollow.
- Renegade-to-Renegade syndication (#70) has no machinery to exercise — the network module is
  ActivityPub only. #70 stays E0 with its gap unchanged; nothing was invented to fill it.

## Ledger consequences

- #69 Open social federation: stays **E2 (local-peer bounded)**, evidence refreshed to the
  RC2 candidate at current HEAD (discovery, signed follow, Accept delivery, reply
  persistence, block denial). Remaining gap unchanged in kind: real remote/public-instance
  interop is NOT VERIFIED, and RC3's required narrow sandbox demo re-runs there.
- #70 Renegade-to-Renegade networking: stays **E0** (inspected; no R2R machinery exists).

## Evidence

- `tests/rc2-g03/peer.mjs` — the deterministic HTTPS-loopback peer (actor document + inbox
  delivery log).
- `tests/rc2-g03/setup.spec.ts` — the publication's ActivityPub account + article discussion
  (stated in-process setup; private signing keys never enter Payload, per the product's own
  configuration rule — keys are environment-only).
- `tests/rc2-g03/journey.mjs` — 9/9 stages (final run, exit 0).
- `src/modules/social/activitypub.ts` + `tests/unit/activitypub.test.ts` — the F1 fix and its
  regression assertion.
