# GUI-06A — Media library: assets first

**Result: PARTIAL** (named defects fixed; layout reorder + visual gates ride the post-#33 capture cycle)

## NEW-01 root cause — FOUND (was: "media-jobs can't be found" banner on fresh installs)

The media library page mounts `MediaCommandCenter` unconditionally.
The command center's data path queries the `media-jobs` collection,
which belongs to the optional **media-studio** module
(`src/modules/module-registry.ts`). A default install registers only
the lean floor — media-studio off — so on any floor install the
collection does not exist and Payload's error renders as a raw banner
on the media page. The library itself (floor `media-assets`) works;
the diagnostics block assumes an optional module. This is a
module-gating defect, not a data defect. Bounded repair options, in
order of preference: (1) MediaLibrary renders the command center only
when the media-studio capability is enabled (capability state already
exists in the CapabilityCenter model); (2) the command center treats
a missing-collection response as "module off" and renders nothing.
Option 1 is the cleaner ownership; either is a small bounded change —
recorded as a GUI-06A-R1 candidate so it ships verified, not
improvised against a build that predates it.

**R1 IMPLEMENTED same day (typecheck PASS; visual proof rides the next
capture cycle):** the command-center GET route now checks whether the
`media-jobs` collection is registered and, when it is not, returns
`{ overview: null, moduleAvailable: false }` _after_ the existing
staff permission assertion (no permission behavior change); the
component renders one quiet module-off note in that case, in both its
fetch paths. The page was also reordered per the prompt: the asset
library now leads and diagnostics follow as context.
(`api/media/command-center/route.ts`, `MediaCommandCenter.tsx`,
`MediaLibrary.tsx`.)

Correction to the R1 note in the register: an earlier draft of this
file claimed option (2) ("component treats missing collection as
module off") — the implemented route is the server-side check above;
the component only consumes the flag.

## Fixed in this prompt (`src/modules/admin/MediaLibraryClient.tsx`)

The register's second named media defect (UX-08 instance): the
selected-asset detail and variants fetches swallowed every failure
(`res.ok ? json : null`, `.catch(() => undefined)`), leaving a stale
inspector that looked authoritative. Failures now set a visible
`role="alert"` message ("could not be refreshed — what you see may be
out of date") with a **Retry** button that re-runs the loads, and a
non-OK response counts as a failure instead of being read as empty
data. Original-safe editing and replacement semantics untouched.
Typecheck PASS.

## Scoped with reasons

- **First-active-site fallback** (register, from 03C): root-caused in
  this prompt — `MediaLibrary.tsx` tries the user's scoped site, then
  a `siteId` param, then silently the first active site. Removing it
  changes which site's assets a multi-site operator sees by default;
  the truthful replacement (resolve from the persisted active-site
  context, like everything else post-03C) belongs with the two-site
  fixture work so the behavior is proven, not assumed. Recorded.
- **Layout reorder** (diagnostics below the library): DONE in R1
  (above); capture verification rides the next cycle.
- Upload/select/metadata save-reload + light/dark/mobile captures:
  the running server predates this fix; they run in the capture cycle
  after PR #33 lands and the tree rebases.

**Exact next prompt: GUI-06B.**
