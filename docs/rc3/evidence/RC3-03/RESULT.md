# RC3-03 — Field-level editor errors (F1/F2)

**Verdict: PASS** — both bounded findings from RC2-FIXALL-DEBT23 are closed
on the production build. A failed save now renders the error at the field
for native, custom, and nested fields alike: a visible message announced
as `role="alert"`, `aria-invalid` + `aria-describedby` on the control,
focus moved to the first failing control, and a correction that saves
and persists. Baseline (tag `2d4cb3d`): 3/10 regression checks green.
Fixed tree: **10/10 green, twice consecutively**.

## Baseline reproduction (recorded before any fix)

Served the tagged RC2 production build (standalone artifact, the rig's
`LOCAL_E2E_TEST_MODE` smoke configuration — production validation
rejects this sandbox's loopback URL/dev credentials, the same caveat
RC3-04 recorded) with the RC2 world seeded into `rc303_release_acceptance`.

REST, three creates with the operator session (full bodies captured):

| Case   | Trigger                                                    | RC2 response                                                                  |
| ------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Native | POST /api/content missing `contentType`                    | 400 `{"errors":[{"message":"The following field is invalid: Content Type"}]}` |
| Hook   | POST /api/content `{}` (publishing-pass throws on `title`) | 400 `{"errors":[{"message":"The following field is invalid: title"}]}`        |
| Nested | POST with `correctionNotices[0]` missing `label`           | 400, message names the nested path in prose only                              |

Browser, same three classes through the real editor (clear title /
clear category name / add a correction notice without its label, then
Save): in every case **zero** `.field-error` elements, **zero**
`role="alert"`, **zero** `aria-invalid`, focus left on `BODY`; the only
feedback was the toast naming the field in prose. This confirms F2 is
not custom-field-only in effect: with no field paths in the response
(F1), no field — stock or custom — can render a server error, and the
client-side validation in this build does not intercept these submits.

Regression instrument at baseline: `tests/rc3-03/field-errors.mjs`
**3/10, exit 1** (the three persistence legs and the no-leak leg pass;
every field-level leg fails).

## Root cause, sharpened

DEBT-23's F1 said Payload's `formatErrors` includes the per-field list
only when its `instanceof ValidationError` check passes, and that the
check fails in this build's module graph. RC3-03 adds the second half
of the trap, measured from the running server's own error log: the
thrown error arrives with **`name: "s"`** — the production bundle
minifies class names, and Payload's `ExtendableError` derives
`error.name` from `this.constructor.name`. So neither class identity
nor class name can identify a validation error in the shipped build;
only its structural fingerprint survives (below).

## The fix (two seams, no editor redesign)

1. **F1 — `src/modules/core/validation-error-response.ts`** (new),
   registered as the root `hooks.afterError` in `src/payload.config.ts`.
   When the formatted result has lost the per-field list, the hook
   rebuilds it in exactly the shape `formatErrors` would have produced
   (`{ errors: [{ name, data, message }] }`). Detection is structural:
   an operational 400 whose `data.errors` is a non-empty list of
   `{ path, message }` entries (or the unminified class name where it
   survives). Non-validation errors are never touched — authorization
   errors keep their semantics and internal errors keep the generic
   public response (proven by the unauthenticated-write leg: 403, no
   field data).
2. **Focus — `src/modules/admin/AdminA11yBridge.tsx`.** The DEBT-23
   bridge already upgraded rendered errors (role/aria wiring); with
   errors now actually rendering, it also moves focus to the first
   failing control — but only for a genuinely new failure while focus
   sits on the submit control or nowhere (a save just answered), never
   stealing focus from a field the user is working in, and never to a
   control hidden in a collapsed section. The decision is a pure
   exported predicate (`shouldFocusErrorControl`), unit-tested.

No change to `HeadlineField` was needed: it wraps the stock
`TextField`, which renders the stock error element as soon as the form
state carries one — F2's "custom fields don't render errors" was the
downstream face of F1.

## Proof on the fixed production build

REST now answers the native case (others identical in shape):

```json
{
  "errors": [
    {
      "name": "ValidationError",
      "data": {
        "collection": "content",
        "errors": [
          { "label": "Content Type", "message": "This field is required.", "path": "contentType" }
        ]
      },
      "message": "The following field is invalid: Content Type"
    }
  ]
}
```

`tests/rc3-03/field-errors.mjs` — **10/10, exit 0, twice**:

- `api-native-path`, `api-hook-path`, `api-nested-path`: 400 with
  `data.errors[].path` = `contentType` / `title` /
  `correctionNotices.0.label`.
- `api-unauthenticated-no-leak`: 403, no field data.
- `browser-custom-title`, `browser-native-name`, `browser-nested-label`:
  `.field-error` visible with text "This field is required.",
  `role="alert"`, control `aria-invalid="true"`,
  `aria-describedby` → the error's id, `document.activeElement` = the
  failing control.
- All three `*-persists` legs: correction saves; the corrected value is
  read back after reload (nested leg read back from the API).

The Playwright form of the same assertions lives at
`tests/browser/rc3-03-field-errors.spec.ts`. **It could not be
executed in this sandbox**: the repo's Playwright harness fails at
worker startup here (`Cannot find module '.../node_modules/next/link'`
from `src/modules/presentation/themes/components.tsx`) — reproduced
identically with the untouched stock FLOW-01 spec, so it is a
pre-existing harness/environment failure, not this pass's spec. The
executable regression in this environment is the probe-form script
above (the `tests/rc2-h01/probe.mjs` precedent). The spec is written to
the harness's own patterns (FLOW-01 session minting) for environments
where the harness starts.

Unit: `tests/unit/validation-error-response.test.ts` (incl. the
minified-name production shape and the negative fingerprint cases) and
the `shouldFocusErrorControl` block in
`tests/unit/admin-a11y-bridge.test.ts` — 20/20 in the two files.

## Screen-reader checklist (manual; observations from the live build)

- [x] Failed save announces the failure: the field error carries
      `role="alert"` (assertive) and the form's toast region is
      `aria-live` — observed in the DOM on the fixed build for all
      three cases.
- [x] The failing control is programmatically invalid and described:
      `aria-invalid="true"`, `aria-describedby` → the alert's id —
      observed for title, category name, and the nested label.
- [x] Focus order after a failed save starts at the failing field —
      observed `document.activeElement` = the failing control in all
      three cases.
- [ ] A full NVDA/JAWS/VoiceOver pass was **not** run (no screen
      reader in this sandbox); announcement is verified at the
      semantics level above, not by ear.

## Gauntlet (CI order, final tree)

| Stage                                          | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fresh migrations (`test:migrations:fresh`)     | exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Fixture seed (`db:seed`)                       | exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Upgrade migrations (`test:migrations:upgrade`) | exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Format (`format:check`)                        | exit 0 (after this file was formatted)                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Lint                                           | exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Typecheck                                      | exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Unit (`npm run test`)                          | exit 0 — **344 files / 2,805 tests** (baseline 343 / 2,792; +13 from this pass)                                                                                                                                                                                                                                                                                                                                                                                          |
| Integration (`test:integration`)               | exit 1 — **537 passed / 1 failed / 6 skipped** (95 files). The one failure is `med-03-variants` (media delivery answered 404 instead of 200). It is not attributable to this diff: the same file passed in RC3-00A's full baseline run (538/0), and re-run solo on this final tree after a fresh migrations+seed re-baseline it **passes (exit 0)** — a suite-context flake of the class RC3-02/RC3-07 also recorded on this rig. No media code is touched by this pass. |
| Production build (rig recipe)                  | exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Smoke (`test:smoke`)                           | exit 0 — "Next.js public/admin routes and Payload PostgreSQL persistence are operational."                                                                                                                                                                                                                                                                                                                                                                               |

The rig was VM-replaced twice during this pass (PostgreSQL wiped both
times); each recovery reinstalled PostgreSQL 16, recreated the role and
databases, and re-ran migrations + seed before results were trusted.

## Honest limits

- The instanceof failure itself (two Payload class identities in the
  bundle) is **not** repaired — that is the build-graph problem lane 08
  named, and it belongs to a build pass. This pass restores the
  user-visible contract at Payload's own `afterError` seam; if the
  bundle is later unified, `formatErrors` works natively again and the
  hook becomes a no-op (it already returns undefined when the result
  is structured).
- Focus movement covers errors whose control is visible; an error
  inside a collapsed section renders and announces, and the section
  header carries the failure state, but focus is not moved into the
  collapsed region.
- The editor was exercised through the rig's browser automation
  against the production build in the sandbox smoke configuration
  (`LOCAL_E2E_TEST_MODE`), not on a public HTTPS host.
