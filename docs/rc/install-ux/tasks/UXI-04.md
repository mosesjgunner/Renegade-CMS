# UXI-04 — Close the HTTPS and claim gap

Goal: trusted public HTTPS and a secure claim handoff.
Done: claim token retrieval reduced to a one-line grep of the web container's log (no full log dump). The installer's existing proxy-boundary guidance and the completion screen's HTTPS section were verified as present and accurate.
Blocked: public HTTPS proof — no domain/host authority in this environment. DNS/cert/proxy failure-injection cases were NOT run. The claim token still travels via server logs to the operator (operator-only channel); a fragment-based browser handoff was not implemented and remains an open design item, recorded honestly rather than papered over.

## Continuation — Stage 3 engineering (2026-11-19, fixtures only)

Built against fixtures; no public proof is claimed anywhere below.

1. **HTTPS diagnosis module** — `src/modules/operations/https-diagnosis.ts`:
   pure evaluation core (DNS, TLS classification, forwarded-header/proxy
   evaluation, listener-bind check) plus injectable `DnsProbe`/`TlsProbe`
   interfaces with node-backed production wiring. Every finding carries a
   stable code, plain-language explanation, the exact observed record or
   header, the expected value, and the next action. Public readiness is
   `false` while any blocking finding exists. Expressed in the shared
   task registry as `setup.https` (prerequisite `setup.installation`)
   via `httpsDiagnosisToTaskCheck`.
2. **Fragment claim handoff** — `src/modules/operations/claim-handoff.ts`
   (pure helpers: `buildClaimUrl`, `parseClaimFragment`,
   `consumeClaimFragment`, `isClaimOriginAllowed`). The setup page reads
   `#claim=` client-side, clears it from the URL/history immediately via
   `history.replaceState`, and exchanges it through the existing
   enrollment API over a POST body. Token machinery is unchanged
   (single-use, HMAC-hashed at rest, 15-minute expiry). The options route
   refuses a token presented from a foreign browser origin with the
   existing `INSTALLATION_TOKEN_INVALID` safe error, before the token is
   checked. The server log line is unchanged and remains the documented
   fallback; `installation.ts` additionally announces the ready-made
   claim link. The installer reads the announced token locally and
   prints the claim link as its primary final instruction, with the log
   grep demoted to a labelled fallback; when no token can be read it
   prints the retrieval path plus a `<token>` template and never
   fabricates a link.
3. **Proxy paths** — `docs/operations/reverse-proxy.md` now carries the
   managed-proxy path for a clean dedicated host (Caddy: the repo
   previously leaned toward no single proxy; Caddy is chosen for
   automatic publicly-trusted certificates, with the exact Caddyfile and
   prerequisites) and the existing-proxy variant (Nginx header-overwrite
   example, hop-count and firewall contract). No new infrastructure is
   bundled; Caddy remains operator-installed. The diagnosis module
   verifies proxy behaviour from headers observed at the app (host/proto
   contradiction, forwarded-for chain longer than `TRUSTED_PROXY_HOPS`,
   forwarded headers in direct mode, missing headers in trusted mode)
   and flags a non-loopback app listener.
4. **Installer harness** — `tests/installer/install-sh.test.sh` gained a
   stubbed `logs renegade-web` response and three claim-handoff checks.

### Fixture matrix (unit tests, all passing)

| Failure class                                                                 | Fixture                                                            | Detection                                                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| DNS lookup failure                                                            | probe error ENOTFOUND                                              | `DNS_LOOKUP_FAILED`, blocking, exact expected A/AAAA records named                                                                       |
| DNS no records                                                                | empty A/AAAA                                                       | `DNS_NO_RECORD`                                                                                                                          |
| DNS mismatch                                                                  | A = 192.0.2.99, expected 203.0.113.10                              | `DNS_ADDRESS_MISMATCH`, observed vs expected records; TLS probe skipped for a foreign host                                               |
| Stale IPv6                                                                    | A correct, AAAA = 2001:db8::dead                                   | `DNS_STALE_IPV6` (separate code), TLS still probed                                                                                       |
| DNS unverifiable                                                              | records exist, no expected destination supplied                    | `DNS_EXPECTED_ADDRESS_UNKNOWN`, blocking — readiness stays false                                                                         |
| Cert expired / wrong host / self-signed / untrusted chain / handshake failure | TLS probe kinds                                                    | `TLS_CERT_EXPIRED` / `TLS_CERT_WRONG_HOST` / `TLS_CERT_SELF_SIGNED` / `TLS_CERT_UNTRUSTED_CHAIN` / `TLS_HANDSHAKE_FAILURE`, all blocking |
| Forwarded headers in direct mode                                              | x-forwarded-for present, PROXY_MODE=direct                         | `PROXY_FORWARDED_HEADERS_IN_DIRECT_MODE`                                                                                                 |
| Chain too long                                                                | 3 XFF entries, TRUSTED_PROXY_HOPS=1                                | `PROXY_FORWARDED_CHAIN_TOO_LONG`; a matching 2-hop declaration passes                                                                    |
| Forwarded host/proto contradiction                                            | host = evil.example.test / proto = http                            | `PROXY_FORWARDED_HOST_MISMATCH` / `PROXY_FORWARDED_PROTO_MISMATCH`                                                                       |
| Missing forwarded headers, trusted mode                                       | only x-forwarded-for present                                       | `PROXY_FORWARDED_HEADERS_MISSING`                                                                                                        |
| Public listener                                                               | bind 0.0.0.0:3000                                                  | `LISTENER_PUBLICLY_BOUND`; loopback binds pass                                                                                           |
| All-good                                                                      | matching DNS, valid TLS, well-behaved trusted proxy, loopback bind | ready = true, zero findings — the only path to ready                                                                                     |

Claim handoff fixtures: link build/parse round-trip, malformed
fragments rejected, fragment consumed once and cleared from history
(even when malformed), foreign/subdomain/wrong-scheme origins refused,
header-less operator clients allowed. Enrollment-level tests
(`tests/integration/installation.integration.test.ts`): two concurrent
claims of one token admit exactly one winner
(`INSTALLATION_IN_PROGRESS` for the loser) and replay after consumption
fails; pre-existing expired/invalid/rotation cases unchanged.

### Results

- Unit: 2,725 passed / 0 failed (baseline 2,684; +41 new).
- Installer harness (stubbed docker, no daemon): 19/19 checks PASS.
- Integration (single file): `installation.integration.test.ts` 4/4 PASS.
- `npm run typecheck`: PASS. Prettier: PASS on all touched files
  (install.sh and the harness are shell, not prettier-covered).

### BLOCKED (unchanged, stated exactly)

- **Public-HTTPS proof on an owner domain/host**: no domain or host
  authority exists in this environment, so no live DNS/certificate/proxy
  proof was run. The diagnosis module grades fixture-injected probes
  only until an operator runs it against a real deployment.
- **Real-host Docker bootstrap**: this rig has no Docker daemon; all
  installer-side evidence is harness-level (stubbed docker), and the
  claim-link output is proven only against the stubbed log response.
