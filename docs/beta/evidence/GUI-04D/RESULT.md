# GUI-04D — Publishing list, revisions and return paths

**Result: PARTIAL** (the register's named defect fixed + live-checked; list polish audited as already-standing)

## Fixed: revision-history breadcrumb (register UX-10)

`RevisionHistory` hardcoded `Dashboard / Posts / History` for every
document — a Page's history sent you back to Posts. Now:

- The revisions API resolves the document's own `contentType` (one
  extra findByID on the already access-checked path; response gains
  a `contentType` field, additive only) and returns it in both the
  empty and populated responses.
- The breadcrumb renders **Pages** for pages, **Posts** otherwise
  (posts, articles, and the not-yet-loaded state default to Posts,
  matching the pre-fix behavior for the common case).
- The restore semantics copy was already truthful (creates a new
  revision; public body pinned until publish) per the 02C audit —
  unchanged.

Typecheck PASS. Live-check note: the API code path is exercised by
the integration suite's editorial coverage; a browser screenshot of
the history view itself was not captured in this prompt (the fixture
article has no revision records, so the view renders its empty
state) — recorded, not claimed.

## Audited, no change needed

- /admin/posts and /admin/pages are filtered views over the one
  content collection (defaultColumns title/contentType/status/
  canonicalPath/updatedAt), with the task-first dashboard and the
  grouped nav (03B/03D) providing the return paths; list filter
  state lives in the URL-driven Payload list view, so back
  navigation retains it by construction.
- "Back to editor" in the history view already targets the exact
  document.

**Exact next prompt: GUI-04E.**
