# Renegade CMS

Renegade CMS is a free, self-hosted, portable publishing and personal-brand platform. This repository currently contains the Milestone 01 executable foundation: Next.js, Payload CMS, PostgreSQL, Tailwind CSS, TypeScript and Docker.

## Local start

Prerequisites: Node.js 20.9+ (Node 24 recommended), npm 10+, Docker with Compose.

```powershell
Copy-Item .env.example .env
# Replace PAYLOAD_SECRET in .env with a random value of at least 32 characters.
npm ci
docker compose up -d --wait
npm run db:migrate
npm run dev
```

Open <http://localhost:3000/setup> after the app starts. The console prints a short-lived single-use setup token; the browser flow verifies a passkey, creates the owner and site, and displays one-time recovery codes. Return to <http://localhost:3000/login> to authenticate with that passkey. `OWNER_EMAIL` can constrain the intended owner email but is never authentication. The setup route permanently locks after completion. If a token expires or setup is interrupted, run `npm run installation:recover` locally; it refuses completed installations. Detailed setup and test commands are in [local development](docs/operations/local-development.md) and [verification](docs/operations/verification.md). Canonical status is [PROJECT_STATE.md](PROJECT_STATE.md).
