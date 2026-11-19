# UXI-13 — Inject ordinary failures on real installations

Partial matrix, honestly bounded:

- Own running port vs foreign port: PROVEN (installer harness).
- Passkey cancel/interruption: PROVEN (integration tests).
- Lost completion response: PROVEN (rotation integration test).
- Instance mismatch / second installation guard: PROVEN (harness).
- Fresh-host Docker bootstrap, DNS/cert/proxy failures, SSH/reboot interruption, upgrade interruption: NOT RUN (no Docker daemon, no public host in this environment). These remain open, not passed.
