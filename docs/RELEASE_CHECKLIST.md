# Release checklist

- Run formatting, lint, typecheck, unit, integration, smoke and production build gates.
- Rehearse migrations, Docker start, backup and encrypted archive restore.
- Verify readiness, persistent storage, proxy/TLS, security headers, CORS/CSRF, authz, rate limits, logging redaction, upload/SSRF/open-redirect/webhook defenses.
- Classify every provider as verified, fixture-only, credential-dependent or provider-dependent.
- Exercise Lean, Standard and expanded capacity without schema changes.
- Collect evidence for the six capability scenarios and the end-to-end smoke journey.
