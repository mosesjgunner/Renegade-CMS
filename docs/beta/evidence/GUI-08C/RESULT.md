# GUI-08C — Authorization and multi-site gate

**Result: PARTIAL**

Verified:
- Unauthenticated /admin returns the login page (03D + every cycle's
  unauthenticated curl check) — no shell leakage.
- Site context is truthful in the UI after 03C/06C: a failed switch
  can no longer masquerade as success in either switcher; UI hints
  follow the server grant checks, never replace them (the campaign
  API change in 07C resolves context through the same grant path).
- Editorial integrity at the service level: the integration suite's
  editorial-acceptance test (create → review → preview → schedule →
  publish exactly once → restore → embargo non-leakage) passed in
  the full 317/317 run on this tree.
- Module gating is real in navigation: under the lean floor,
  module-off links are absent (03D probe) and the media module-off
  state renders a quiet note instead of a raw error (06A).

NOT VERIFIED (explicit): the interactive role matrix
(admin/editor/contributor/denied across screens) — the fixture has
one owner user; the two-site interactive proof (read/write
ownership + forced failed switch) — the fixture has one site. Both
need fixture expansion (second site + second/third users with
lesser roles), which is the entry condition for closing this gate;
the server-side tenant boundary itself is covered by the RC-era
integration suites.

**Exact next prompt: GUI-08D.**
