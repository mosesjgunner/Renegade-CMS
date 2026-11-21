# POD-RC-01 record flag — FOR OWNER REVIEW ONLY

**Status:** draft prepared by RC3-00 (Nov 20, 2026). No public record
has been edited. Publishing any of this text, anywhere, is the
owner's separate decision.

## The drift

- The `rc2` tag points at `2d4cb3d`, whose tree contains PR #113
  (POD-RC-01, Podcasting 2.0 feed closure — merged as `513f317`,
  an ancestor of the tag).
- The published RC2 release notes describe POD-RC-01 as not part of
  RC2. Both statements are true in different senses — the notes
  describe the RC2 *scope and exit verdict*; the tag is a *tree*,
  and the tree includes the podcast pass because it merged to main
  before the tag was cut.
- Left unannotated, a reader of the tag could reasonably conclude
  the podcast work was audited as part of RC2. It was not: POD-RC-01
  was a separate pass with its own verdict (HOLD — the Spotify,
  Apple and named-client legs are unproven).

## Draft corrected text (for the release record, if the owner wants it)

> **Scope note.** The `rc2` tag's tree includes PR #113 (POD-RC-01,
> podcast feed closure), which merged to `main` before the tag was
> cut. POD-RC-01 is a separate pass from RC2: it is not part of the
> RC2 exit verdict, and its own verdict remains HOLD (directory and
> client acceptance unproven). The RC2 exit report, its five P2
> riders (DEBT-02/-03/-04/-15/-22), and its other conditions are
> unchanged.

## Owner's options (no recommendation is made by this pass)

1. Add the scope note to the GitHub release body in place.
2. Leave the release as published; this flag + the RC3 ledger's
   row #15 annotation are the internal record.
3. Carry the note in a future repo-side record (e.g. an addendum to
   `docs/rc2/RC2-STATUS.md`) via a normal PR, leaving the release
   body untouched.
