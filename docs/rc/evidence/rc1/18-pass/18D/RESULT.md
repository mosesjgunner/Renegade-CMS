# Subpass 18D — Final security, restore and RC1 decision

Date: 2026-11-07 (America/Chicago)
Executor: Harbor (Muse), under Matthew's 2026-11-06 instruction to finish
Pass 18. Matthew executed 18A (start), 18B (start) and 18C himself;
provenance for each is recorded in its own RESULT.

**Candidate:** `main` at `d98b484bfec1443af70ef7a6808cc2349fc6491c`
(merge of PR #27, the 18B close-out, on top of Matthew's `5b97e28`
"pass 18" 18C push). Clean detached checkout; no dirty tree.

## Verdict

- **18D execution: PASS** — the independent re-review was executed on the
  exact final candidate and this report delivers the decision with
  complete provenance, in the same bounded sense as 18A (subpass PASS,
  release NOT READY).
- **RC1 verdict: NOT READY.** First blockers: **09D** and **14A**
  (mandatory acceptance never executed to completion) and the **15C
  proof gap**. No product defect was found by this review; the verdict
  is about unexecuted mandatory proof, not failing code. Detail below.

## Final-candidate gates (Harbor VM, PostgreSQL 16.15)

Executed fresh on `d98b484`, canonical order:

| Gate | Result |
| --- | --- |
| `npm ci` | exit 0 |
| format:check | exit 0 |
| lint (`--max-warnings=0`) | exit 0 |
| typecheck | exit 0 |
| unit | 284 files, **2,104 passed / 0 failed** (2,083 from the 18B close-out + 18C's 21 cases) |
| fresh DB + migrate | exit 0, 132 migrations |
| integration (full, fresh DB) | 52 files, **306 passed / 0 failed** |
| production build (last) | exit 0; `tsconfig.json` byte-stable across the build (`next-env.d.ts` showed only the known benign `.next`/`.next-typecheck` path flip, restored) |

## Packaged image proof on the exact candidate

GitHub Actions workflow `rc1-17c.yml`, run **42421799096**
(workflow_dispatch by Matthew, head `d98b484`):
**harness success, Compose proof success**, all job steps green
(22:41–22:52 UTC). This closes the byte-identity failure mode that
killed runs 42121759686 (`7e8abe4`) and 42413004639 (`5b97e28`); both
predate the tsconfig fix merged in PR #27.

Images from the run's own summary (mirrored to the
`rc1-17c-evidence` branch, commit `4a5cd4d`):

- `renegade-cms:rc117c-d98b484b` — sha256:5bf14d6a2443e09e6385f11ba4d933f872545b9fd57f6fef262167a8997859f8
- `renegade-cms:ci` — sha256:dfb986ae7821bd820706a2e4b1b92ad9a3cc2060a0b8607d7ac5ae0cff9cebed
- media-heavy `renegade-cms-media-heavy:ci` — sha256:ea88b4d735fcd4f7df2eec4b056377f75edfc0eed51752000984dfd4a384a5a2

## Security re-review

- Negative cases are exercised inside the passing suites on this
  candidate: role/site denials, foreign-site 403s (including 18C's
  discovery-audit authorization-ordering fix), SSRF validators,
  secret-handling and credential-encryption checks, money-integrity
  and duplicate-effect cases in commerce. No unresolved critical
  auth, money-integrity, duplicate-effect, data-loss, secret or
  required-workflow failure was found in anything executed.
- Advisory refresh: the dependency set is unchanged since 17B's
  disposition (zero critical; bounded highs recorded there) except
  the `monaco-editor`/`yjs` runtime-dependency declaration (PR #22)
  and an 18-line lockfile touch in `0a405fe` — no new packages.
  `npm audit` cannot run from Harbor's VM (the registry audit
  endpoint is policy-blocked, HTTP 403); the packaged run's own
  lockfile/image checks on this candidate passed. Recorded as an
  environment limit, not a finding.

## Restore re-review

18C steps S/T exercised full backup/restore with byte-identical media
on the production image of the near-final tree (`7e8abe4`-based), and
17D's restore proof stands at its own boundary. On this exact
candidate, the Compose proof's restart and second-stack phases passed
(run 42421799096). A from-scratch restore run against the final image
was not separately executed; restore proof for the candidate is
therefore **inherited-bounded** from 18C/17D plus the candidate's own
restart proof — stated plainly, not upgraded.

## Provider truth

Re-verified on the final tree by the passing provider/social suites:
the roster agrees everywhere (the 18B P1 disagreement is fixed) —
X/Twitter is manual-handoff, Bluesky is the sole live-adapter claim,
all other providers carry local/sandbox truth per
`docs/rc/PROVIDER_MATRIX.md`. No remote or real-world delivery claim
is made anywhere in Pass 17/18 evidence.

## Blockers (basis of the NOT READY verdict)

1. **09D — NOT READY** (CRM/audience selectors and automation). The
   tag blocker is fixed and its focused proof is green (135 cases),
   but the broader seven selector dimensions, general automation
   acceptance, and the full visitor/UI/local-sink rerun were never
   executed. This is named RC1 scope (RC1-SCOPE audience row;
   RC1-ACCEPTANCE-MATRIX 18A banner: "First release proof gap: 09D").
2. **14A — NOT READY** (BYO AI provider setup / capability
   discovery). The implementation exists, but six mandatory runtime
   groups — persisted owner configuration, security/error/secret
   checks, restart UI among them — were never executed to
   completion. Its historical `/admin/ai` compile failure does
   **not** reproduce on this candidate (the production build is
   green including that surface); the remaining work is executing
   the runtime journey, not fixing a known defect. RC1 scope
   requires the mandatory local/adapter acceptance layer even
   though external provider credentials are not required
   (RC1-SCOPE provider-layers paragraph).
3. **15C — proof gap, no ledger row.** The automated half ran green
   on Matthew's Windows machine, but the experiment journey and
   restart traces were never pushed, so no PASS can be recorded
   from what exists. Closure is either the traces surfacing from
   that checkout or a bounded rerun.

**Explicitly retired:** 17C, listed as an open gap in 18A's
reconciliation, went PASS 2026-11-04 (run 41923067257), Pass 17 was
formally completed by PR #26 (merged 2026-11-05), and the packaged
proof was re-run green on this final candidate (run 42421799096).

## Release preparation

`v0.1.0-rc.1` release notes, version/tag commands and packaging /
deployment instructions are **not** prepared: the subpass prompt
conditions that preparation on all mandatory results being PASS,
and they are not. No tag, push, publish or deploy was executed in
this subpass.

## The remaining decision (Matthew's)

Two honest ways forward, laid out in NEXT.md: (a) run the three
bounded closures — all are acceptance reruns, none is a feature
build — after which this verdict flips by addendum; or (b) re-scope
what RC1 claims to ship, with the exclusions written into the scope
and product copy. Harbor's recommendation is (a): the gap between
this tree and READY is three reruns, and the stronger claim is worth
more than the days it costs.
