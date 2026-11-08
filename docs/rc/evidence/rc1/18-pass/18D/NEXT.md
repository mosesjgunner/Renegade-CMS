# NEXT — after 18D (2026-11-07)

RC1 verdict on candidate `d98b484`: **NOT READY** — proof gaps only,
no product defects found. 18D itself is PASS (decision delivered).
Pass 18 is complete: 18A PASS, 18B PASS, 18C PASS, 18D PASS.

## The three closures between here and READY

All three are bounded acceptance reruns. None is a feature build.

1. **09D closure** — execute the seven audience-selector dimensions,
   general automation acceptance, and the full visitor/UI/local-sink
   rerun on the final tree. Suite-level work Harbor can run; the
   visitor/UI portion follows the established browser-harness pattern.
2. **14A closure** — execute the six mandatory BYO-AI runtime groups
   (persisted owner configuration, security/error/secret checks,
   restart UI, and the remaining groups in the 14A RESULT) against
   the final tree. The old `/admin/ai` compile failure does not
   reproduce on this candidate (production build green), so this is
   a journey execution, not a repair.
3. **15C closure** — either the journey/restart traces surface from
   Matthew's Windows checkout (`docs/rc/evidence/rc1/18-pass/15C/`
   there), or a bounded rerun of the 15C harness. If the disposable
   containment from the original run no longer exists, say so before
   improvising a replacement.

After all three: an 18D addendum (new dated banner on
FINAL_RC_REPORT.md + a short RESULT addendum) flips the verdict on
the same candidate — or on a successor candidate if any closure
changes source, in which case the final gates and one packaged-proof
run repeat on the new SHA first.

## Alternative Matthew may choose instead

Re-scope the RC1 claim: write the 09D automation acceptance, the 14A
runtime journey and 15C into the scope document as named exclusions
with truthful product copy, and let the verdict stand as READY for
the reduced claim. That is a product decision, not an agent one.

## Only after a READY verdict, and only on Matthew's separate word

Prepare `v0.1.0-rc.1` release notes, version/tag commands, packaging
and deployment instructions (18D prompt: prepare only — tagging,
pushing and deploying each need their own explicit instruction).

## Standing facts for whoever picks this up

- Packaged/Docker proof runs only via the `rc1-17c.yml` GitHub
  Actions workflow (Matthew dispatches) or a Windows/Docker host;
  Docker does not run on Harbor's VM.
- Workflow files cannot be delivered through Harbor's GitHub
  connector; Matthew uploads them via the web UI.
- PostgreSQL on Harbor's VM is 16.15; CI and Windows use 17.x.
  Record versions verbatim, never upgrade a claim silently.
