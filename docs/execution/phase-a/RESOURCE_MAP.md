# Phase A resource map (isolation contract)

Every row is an exclusive mutable namespace. `media path` is relative to that card's worktree. Never use the repository's default Compose project, port `5432`, database, or `media/` path while a card runs. A card creates an untracked Compose override and invokes `docker compose -p <project> -f compose.yaml -f <override> ...`; the override is runtime evidence, not repository configuration.

| Card | Compose project | Web port | Playwright port | App database | Migration-test database | Media path | Media volume | Evidence file |
| --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| A-01 | `renegade-phase-a01` | 3101 | 9401 | `renegade_phase_a01` | `renegade_phase_a01_migration` | `.phase-a-runtime/a01/media` | `renegade_phase_a01_media` | `evidence/A-01.md` |
| A-02 | `renegade-phase-a02` | 3102 | 9402 | `renegade_phase_a02` | `renegade_phase_a02_migration` | `.phase-a-runtime/a02/media` | `renegade_phase_a02_media` | `evidence/A-02.md` |
| A-03 | `renegade-phase-a03` | 3103 | 9403 | `renegade_phase_a03` | `renegade_phase_a03_migration` | `.phase-a-runtime/a03/media` | `renegade_phase_a03_media` | `evidence/A-03.md` |
| A-04 | `renegade-phase-a04` | 3104 | 9404 | `renegade_phase_a04` | `renegade_phase_a04_migration` | `.phase-a-runtime/a04/media` | `renegade_phase_a04_media` | `evidence/A-04.md` |
| A-05 | `renegade-phase-a05` | 3105 | 9405 | `renegade_phase_a05` | `renegade_phase_a05_migration` | `.phase-a-runtime/a05/media` | `renegade_phase_a05_media` | `evidence/A-05.md` |
| A-06 | `renegade-phase-a06` | 3106 | 9406 | `renegade_phase_a06` | `renegade_phase_a06_migration` | `.phase-a-runtime/a06/media` | `renegade_phase_a06_media` | `evidence/A-06.md` |
| A-07 | `renegade-phase-a07` | 3107 | 9407 | `renegade_phase_a07` | `renegade_phase_a07_migration` | `.phase-a-runtime/a07/media` | `renegade_phase_a07_media` | `evidence/A-07.md` |
| A-08 | `renegade-phase-a08` | 3108 | 9408 | `renegade_phase_a08` | `renegade_phase_a08_migration` | `.phase-a-runtime/a08/media` | `renegade_phase_a08_media` | `evidence/A-08.md` |
| A-09 | `renegade-phase-a09` | 3109 | 9409 | `renegade_phase_a09` | `renegade_phase_a09_migration` | `.phase-a-runtime/a09/media` | `renegade_phase_a09_media` | `evidence/A-09.md` |
| A-10 | `renegade-phase-a10` | 3120 | 9420 | `renegade_phase_a10` | `renegade_phase_a10_migration` | `.phase-a-runtime/a10/media` | `renegade_phase_a10_media` | `evidence/A-10.md` |

A-08 additionally gets `renegade_phase_a08_restore` and `renegade_phase_a08_restore_media`, neither reusable. A-10's clean clone uses a new dependency directory and its row's resources only; it reuses no local environment file, database, media volume, browser profile, or server.
