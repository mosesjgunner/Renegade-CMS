# Contributing to Renegade CMoS

Thank you for your interest in contributing to **Renegade CMoS (Content & Media Operating System)**!

Renegade is an open-source, sovereign platform built on strict architectural principles. We aim for extreme reliability, zero hidden SaaS dependencies, and reproducible quality gates.

---

## 🏛️ Guiding Principles

1. **Sovereign by Default**: Renegade must never require external SaaS subscriptions to operate safely. Integrations with external services (Stripe, Twilio, Printful) must degrade gracefully to local sinks, emulators, or safe preflights when unconfigured.
2. **Truthful Provider Claims**: Any capability claim must be empirically verified through real tests. Never fabricate fake mocks that conceal unfinished architecture.
3. **Isolated Modular Monolith**: Feature domains live in `src/modules/` and interact through clean, typed internal contracts.
4. **Zero-Leak Presentation Boundary**: Editor tools (like `@puckeditor`) must never leak into public client bundles. Public routes must remain fast, static-rendered, and lightweight.
5. **Durable Operations**: Background jobs and scheduled releases must survive process restarts without data loss or duplicate execution.

---

## 🛠️ Development Workflow

### 1. Prerequisites

- **Node.js**: `20.9.0` or higher (Node 24 LTS recommended)
- **npm**: `10.0.0` or higher
- **Docker**: Engine & Compose v2 (for local PostgreSQL 17.6)

### 2. Setting Up Local Environment

```bash
git clone https://github.com/mosesjgunner/Renegade-CMS.git
cd Renegade-CMS
npm ci
cp .env.example .env
docker compose up -d --wait
npm run db:migrate
npm run dev
```

In a second terminal, start the background worker:

```bash
npm run jobs:worker
```

### 3. Pre-Commit Verification Checklist

Before submitting a PR, ensure all quality gates pass locally:

```bash
# 1. Format Check
npm run format:check

# 2. ESLint Static Analysis
npm run lint

# 3. TypeScript Type Safety
npm run typecheck

# 4. Unit Test Suite
npm run test

# 5. Integration Test Suite (requires Docker Postgres)
npm run test:integration

# 6. Presentation Bundle Boundary Check
npm run verify:presentation-bundles
```

---

## 📝 Commit Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat(domain)`: A new user-facing feature or domain capability (e.g. `feat(commerce): add order refund reversal`)
- `fix(domain)`: A bug fix (e.g. `fix(community): harden discussion attachment lookup`)
- `docs(domain)`: Documentation updates (e.g. `docs(release): publish beta release notes`)
- `test(domain)`: Adding or updating test suites (e.g. `test(audience): verify double opt-in flow`)
- `refactor(domain)`: Code refactoring without changing behavior
- `chore(domain)`: Maintenance tasks, dependency updates, or toolchain changes

---

## 🗄️ Database Migrations

Renegade uses versioned Payload/PostgreSQL migrations in `src/migrations/`.

- **Never modify an existing migration** that has already been committed to `main`.
- Always generate new, additive migrations.
- Ensure your migration is idempotent and includes a safe rollback/down path where applicable.

---

## 🚀 Submitting a Pull Request

1. Fork the repository and create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Write clean code with corresponding unit and integration tests.
3. Run all verification checks (`format`, `lint`, `typecheck`, `test`).
4. Push your branch and open a Pull Request against `main`.
5. Fill out the PR template thoroughly, documenting testing evidence and any external provider boundaries affected.
