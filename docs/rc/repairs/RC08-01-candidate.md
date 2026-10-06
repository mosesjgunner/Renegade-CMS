# RC08-CANDIDATE — establish the immutable candidate

Priority: first prerequisite. Evidence: [RC-08 preflight](../evidence/rc-08/preflight.json).

Problem: inspected HEAD `e25f1b554eeae6e898d754822c64181f4b8040cc` has
pre-existing source, dependency and evidence changes. No tested integrated candidate
identifies them. RC-07 separately reports unknown deployed source revision.

Minimal action: review and preserve existing changes; select the intended accepted
source and dependency changes and commit them explicitly. Keep unrelated work
outside the candidate without deleting it. Bind each release repair to its own
commit and associate prerequisite evidence with exact tested sources. Include
source revision in built/deployed web and worker provenance.

Acceptance: candidate and new clean checkout have empty `git status --porcelain`;
HEAD, package/lockfile, build and deployed revision agree. Restart RC-08 against
the new SHA with fresh dependencies and isolated DB/media/web/worker resources.
No test on the present dirty tree closes this card.

Next: [commerce](RC08-02-commerce.md), then [security/recovery](RC08-03-security-recovery.md).
