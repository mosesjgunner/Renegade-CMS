# Task 01: Repository Evidence and Research Governance

## Exact scope

Establish evidence for the actual repository before application scaffolding. Create the research index and requirements traceability source required by Milestone 01. This task is documentation and audit work only; it must not select library versions or rewrite existing code.

## Likely files

- `AGENTS.md` if an instruction file is intentionally added after confirming no existing instruction source applies.
- `docs/research/INDEX.md`
- `docs/requirements/TRACEABILITY.md`
- `docs/architecture/repository-map.md`
- `docs/architecture/gap-analysis.md`
- `docs/decisions/` conflict/decision records only where a choice is truly accepted.
- `PROJECT_STATE.md` initial baseline entry.

## Inputs and outputs

**Inputs:** complete working tree, git history/remotes if available, all instruction files, manifests/lockfiles, Docker/CI/test files, and all research documents.

**Outputs:** current-state inventory, research index with authority/freshness/duplicate status, traceability baseline, explicit conflict register, and initial project-state record that states only observed facts.

## Ordered work

1. Inspect git status/history and discover all repository-local instructions before changing files.
2. Inventory manifests, installed versions, source, Payload configuration, database setup, containers, tests, CI, scripts, and existing documentation.
3. Classify each major capability as implemented, partial, stubbed, or absent with file evidence.
4. Hash the research corpus; identify exact duplicates and mark reports, prompts, and possible superseded sources distinctly.
5. Create `docs/research/INDEX.md` with required metadata, milestone mapping, freshness notes, recommendations versus decisions, and unresolved questions.
6. Create the requirements traceability baseline and map every Prompt 1 outcome.
7. Create a conflict register rather than harmonizing contradictory reports.
8. Write the initial `PROJECT_STATE.md` with observed state, executable commands actually found, known risks, and M01 as in progress.

## Tests and verification commands

- Run the repository’s existing documentation/link validation if it exists.
- Run a duplicate checksum command appropriate to the selected shell and record it in the index.
- Verify every research file under `docs/research/` has exactly one index row.
- Verify every Prompt 1 required outcome has at least one traceability row.
- Review the repository map against the discovered file inventory.

## Definition of done

- The index distinguishes authoritative status, duplicates, prompts, date/cutoff, conflicts, and verification needs.
- No unverified recommendation is labeled as an accepted decision.
- `PROJECT_STATE.md` contains no fictional commands, implementation claims, or test results.
- A reviewer can identify the canonical repository, installed stack evidence, and the next architecture decision from the documents.

## Non-goals

- Scaffolding the application, adding dependencies, choosing package versions, or implementing migrations/tests.
- Resolving architecture conflicts without sufficient evidence.

## Handoff

Task 02 may begin only after the audit either confirms this checkout is canonical or records the approved source/import path. Hand off the index, gap analysis, conflict register, and exact discovered versions/commands.

**Completed 2026-08-11:** Audit, research index, repository/gap maps, global traceability and initial state evidence were created. No Git repository or hidden implementation was found. Six supplied research Markdown files were later formatting-normalized accidentally; both initial and current hashes are disclosed in the index.
