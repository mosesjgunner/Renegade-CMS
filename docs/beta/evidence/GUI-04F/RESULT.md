# GUI-04F — The writing surface as a visible sheet — PARTIAL (Matthew's eye is the final gate)

**Trigger:** Matthew, Nov 10, 2026, on the R4 state: "It still looks blahhh… You can't even tell where you're supposed to write really still. We need something between Joomla and WordPress — right now it's ugly Joomla."

**Root cause of the blah (found, not guessed):** the R4 canvas CSS targeted `.doc`, a class this Payload build never renders (real chain: `form.collection-edit__form > .collection-edit__main-wrapper > .collection-edit__main > .document-fields > .document-fields__main`). The rules never applied; computed styles on the "fixed" editor were min-height 0, font 16px, padding 8px 0. The R4 functional fix was real; its styling was fiction. The GUI-08B note "canvas measured 338px" measured a build where a *different* rule matched — recorded here so the record stays honest.

**Design (CSS only, `src/modules/admin/writing-canvas.css`, selectors verified against the live DOM):**
- The admin canvas behind the page steps darker (`--theme-elevation-50`).
- Title + subtitle + body form ONE continuous sheet: shared `--theme-input-bg` surface, continuous side borders, rounded outer corners, one soft shadow.
- Title set document-style into the sheet (borderless, 2rem design size); subtitle as a muted deck line (its field is `type: text` — the first selector missed it; fixed and re-verified).
- The body interior is a tall quiet page (min-height 26rem design; editor typography in reading size/leading).

**Verified live (cycle-12 build, seeded article):** computed styles — contenteditable min-height 338px, sheet background white, 1px borders, shadow present, title borderless. Screenshot `sheet-v3.png` (in this evidence folder; also in the working tree only — the connector cannot ship PNGs): the sheet reads as a page; title sits on it in document type; subtitle is a plain deck line under the title; the body is one tall white page interior.

**Gate: PARTIAL.** The remaining judge is Matthew's eye. If the sheet direction is right, the same treatment extends (settings slabs softened further, dark-theme capture, create-form capture). Counts as exit-report condition 6 progress, not closure.
