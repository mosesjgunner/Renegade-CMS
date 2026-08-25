# Repository map and current-state evidence

Audit date: 2026-08-12. No `AGENTS.md` or other repository-local instruction file was found. This directory is not a Git worktree (`git status` reports no repository), so history, remotes and change attribution are unavailable.

Before M01 implementation the checkout contained only `BUILD_PLAN.md.md`, seven research files, and the supplied `docs/tasks/m01-foundation/` planning packet. There was no manifest, lockfile, application source, Payload config, database config, Docker artifact, test harness or CI.

After M01 the main paths are:

| Path                                                     | Responsibility                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/app/(frontend)`                                     | Public Next.js presentation edge                                          |
| `src/app/(payload)`                                      | Generated-style Payload admin and API routing edge                        |
| `src/collections`                                        | Minimal Payload persistence adapters used by the foundation slice         |
| `src/modules/core`                                       | Framework-neutral shared contracts and configuration/error/logging policy |
| `src/modules/publications`                               | Publication boundary used by the neutral site record                      |
| `src/payload.config.ts`                                  | Composition root connecting Payload to product modules and PostgreSQL     |
| `src/migrations` / `src/scripts`                         | Forward migration ledger and deterministic seed command                   |
| `tests`                                                  | Unit, PostgreSQL integration and real-stack smoke proof                   |
| `docs/architecture`, `docs/decisions`, `docs/operations` | Implemented architecture and operating evidence                           |
| `.github/workflows/ci.yml`                               | CI-equivalent verification with PostgreSQL service                        |

Tool evidence: Node 24.14.1, npm 11.1.0, Docker CLI 29.3.1 / Compose 5.1.0, Git 2.51.2. Docker Desktop was not running at initial audit. Registry evidence on 2026-08-11: Payload packages 3.88.0, Next 16.3.0, React 19.2.8, Tailwind 4.3.3.

The 2026-08-12 audit also confirms the core contract implementation has no Renegade Party references. Its named platform types remain framework-neutral and do not create persistence, UI, vendor adapters or feature modules.
