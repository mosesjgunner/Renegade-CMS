# A-01 verification remediation

Complete only the unproven A-01 acceptance after A-09 is merged and A-01 is checked out from that checkpoint. Use only `renegade_a01`, ports 3101/3201/5433, databases `renegade_a01` and `renegade_mig_a01`, `.phase-a/a01/media`, and `renegade_a01_media`.

1. Run a disposable Linux/Compose `install.sh --non-interactive` smoke with its HTTPS origin and prove an operator-owned `.env.production` and existing volumes are not overwritten.
2. Read the one-time token only from `docker compose -p renegade_a01 ... logs renegade-web`, set `A01_SETUP_TOKEN`, and run the focused Playwright spec, retaining trace/video.
3. Restart containers between setup and login; save HTTP proof of locked `/setup`; complete the clean-cookie virtual-WebAuthn login.
4. Inspect web/worker logs: the short-lived setup token is the only intentional local handoff; recovery codes, `PAYLOAD_SECRET`, database passwords, assertions, and sessions must be absent.
5. Record final exit codes for lint, typecheck, build, and the focused integration test.

Replace partial evidence only after the two authenticated `/admin` visits, all artifacts, and all exit codes are concrete. Do not merge A-01 before A-09 under Group 0.
