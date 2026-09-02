# A-01 verification remediation

Local technical verification for A-01 is complete and fully reproduced on branch `phase-a/a01-install-login`:

1. Clean Compose smoke executed on isolated `renegade_a01` instance (port 3201). Installer refusal to overwrite operator-owned configuration verified with exit code 1.
2. One-time setup token retrieved exclusively from local container logs (`docker logs renegade_a01-renegade-web-1`).
3. Playwright browser spec (`tests/browser/phase-a-install-login.spec.ts`) passed using Chromium virtual WebAuthn authenticator. Both authenticated `/admin` visits confirmed.
4. Container restart executed; HTTP access to `/setup` confirmed permanently locked (`Setup Complete`).
5. Web and worker container logs inspected; recovery codes, `PAYLOAD_SECRET`, DB passwords, WebAuthn assertions, and session cookies are completely absent.
6. Lint (`npm run lint`), typecheck (`npm run typecheck`), build (`npm run build`), and focused integration tests (`npx vitest run tests/integration/installation.integration.test.ts`) all passed with exit code 0.
7. Playwright trace and video artifacts recorded under `test-results/`.

### Remaining blocker (Merge order only)

- A-00 is merged into `main`.
- A-09 is **not** yet merged into `main`.
- Under Group 0 merge order in `SHARED_CONTRACTS.md`, A-09 must merge into `main` before A-01 can be rebased and merged into `main`. A-01 remains ready on branch `phase-a/a01-install-login` pending the A-09 merge checkpoint.
