# Production deployment

Set NODE_ENV=production, DATABASE_URL, a 48+ character non-placeholder PAYLOAD_SECRET, HTTPS APP_URL, explicit PROXY_MODE and TRUSTED_PROXY_HOPS, STORAGE_DRIVER=local, and an absolute persistent MEDIA_DIR. Set SMTP values only when EMAIL_MODE=smtp. Keep ENABLE_TEST_ROUTES=false.

Commands: npm ci; npm run db:migrate; npm run build; npm run start; npm run jobs:worker.

Build Docker with docker build -t renegade-cms . and run it with persistent media, PostgreSQL and a proxy that overwrites forwarded headers. Probe /health/live and /health/ready before traffic. Back up PostgreSQL and media together; restore only into an isolated environment, migrate first, validate the archive, then run smoke and readiness. Provider failures must stay retryable and never block public reads/canonical publication.
