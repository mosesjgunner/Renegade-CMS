# Behavior-Level Pseudocode

## Repository audit command

```text
COMMAND auditRepository
  collect git state, instruction files, package manifests, lockfiles, app sources,
    Payload/database config, Docker files, tests, CI, migrations, and docs
  classify every discovered capability as implemented, partial, stubbed, or absent
  record exact paths, installed versions, and existing verification commands
  compare current state with the Milestone 01 requirements
  if an unlisted working application exists:
    stop proposed scaffolding work
    revise this packet from observed behavior
  publish repository map and gap analysis as evidence, not aspiration
```

## Research index command

```text
COMMAND indexResearchCorpus
  enumerate every report under docs/research/source and docs/research
  for each file:
    record title, filename, subject, source date/cutoff, checksum, milestones,
      decisions, recommendations, unresolved questions, and freshness status
  compare checksums and mark exact duplicates without deleting source history
  distinguish reports from prompts, proposals, accepted ADRs, and technical evidence
  for each conflict:
    create a conflict record with competing claims and a required resolution owner
  do not mark a research statement accepted unless an ADR or working contract confirms it
```

## Architecture-decision command

```text
COMMAND decideFoundationArchitecture(decisionQuestion, evidence)
  require repository audit result and research-index references
  list options, constraints, compatibility facts, operational cost, and revisit trigger
  select an option only when it satisfies the authority order
  write an ADR containing context, decision, consequences, rejected alternatives,
    validation plan, and future revisit trigger
  update project-state decision summary
  reject any decision that silently upgrades/replaces an installed stack without evidence
```

## Configuration query

```text
QUERY loadRuntimeConfiguration(environment)
  parse only documented environment variables through a typed schema
  classify variables as required, optional, development-only, production-only, or secret
  derive safe runtime settings without returning secret values
  if validation fails:
    return invalid configuration result with variable names, remediation, and redacted context
  return validated server-only configuration
```

## Application boot command

```text
COMMAND bootApplication
  configuration <- loadRuntimeConfiguration(process environment)
  if configuration invalid:
    stop before accepting requests
  establish database connectivity with least-privilege configured role
  inspect migration state according to selected framework convention
  if required migration state is unsafe:
    stop or enter explicitly documented not-ready state
  initialize CMS integration through the framework adapter boundary
  register public-safe route, admin route, and health/readiness routes as selected
  emit structured start event with version/build identifiers and no secrets
  transition boot state to healthy only after mandatory dependencies pass
```

## Migration command

```text
COMMAND applyMigrations
  acquire the selected migration lock if concurrent execution is possible
  inspect applied migration identities
  for each pending migration in declared order:
    classify its rollback boundary before execution
    execute inside the selected transactional boundary when supported
    record immutable applied identity, time, application version, and outcome
  on failure:
    preserve failure context without secrets
    release lock
    return failure; do not report schema as current
  release lock
  return applied/no-op outcome
```

## Seed command

```text
COMMAND seedNeutralDemoData(seedVersion)
  require an explicitly selected local/development/test environment
  detect existing seed run by stable seed identity
  if exact seed already applied:
    return no-op or documented reset-required result
  create only neutral fixtures required by smoke tests
  do not create production users, providers, Renegade Party content, or secrets
  record seed version and created fixture identities
  return reproducible fixture summary
```

## Health and readiness queries

```text
QUERY liveness
  return bounded process/version status

QUERY readiness
  test configured mandatory dependencies such as database and migration compatibility
  return ready only when the base application can fulfill its supported contract
  return bounded reason categories; never include connection strings, credentials, or stack traces
```

## Smoke-test scenario

```text
SCENARIO foundationSmokeTest
  prepare an isolated database and server configuration
  start the actual service topology used by development/CI
  apply migrations
  seed neutral fixtures
  request public route and assert successful, non-placeholder application response
  request Payload admin route and assert it mounts as configured
  perform one framework-backed persistence read/write or schema verification through the app/CMS path
  assert readiness includes successful database and migration checks
  assert logs/responses contain no configured secret values
  stop services and clean isolated resources
  retain command output, versions, and phase result as acceptance evidence
```

## Policy and adapter conventions

```text
POLICY futureMutationPolicy(actor, action, target, scope)
  deny by default
  require an explicit future domain policy before mutation
  require validation and correlation/audit metadata when appropriate

ADAPTER frameworkBoundary
  expose product-owned configuration, policy, and persistence contracts
  contain Payload/Next/PostgreSQL-specific calls behind the smallest practical boundary
  prevent themes/providers/future modules from importing framework internals directly
```

## Acceptance scenario

```text
SCENARIO newDeveloperFoundationProof
  clone the confirmed canonical repository
  follow README prerequisites and .env.example without secret discovery
  run documented dependency startup, migration, seed, and application commands
  open public application and CMS admin paths
  run the complete verification command set successfully
  inspect project state and traceability records
  independently repeat the smoke test
  accept Milestone 01 only when all recorded evidence matches observed results
```
