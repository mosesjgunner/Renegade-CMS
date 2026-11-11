# GUI-04I — Formatting tools right there (fixed toolbar) — PASS (live-proven)

**Result: PASS.** The article body editor now shows an always-visible formatting
toolbar pinned to the top of the writing sheet: add/block insert, blocks,
Normal Text / heading style dropdown, alignment, indent, **Bold, Italic,
Underline, Strikethrough, subscript, superscript, inline code, link** — plus the
select-to-format floating toolbar still appears on selection.

## Why it was missing (two layers, both silent)

1. **Payload's default feature set ships only the inline (floating) toolbar.**
   The fixed toolbar is opt-in (`FixedToolbarFeature`) and was never enabled in
   `src/collections/Publishing.ts` — so the writing surface showed no controls
   until text was selected. (Matthew, Nov 10 2026: "text formatting and links
   and everything" must be built in and right there.)
2. **Enabling it was not enough:** the admin import map
   (`src/app/(payload)/admin/importMap.js`) predated the feature and had no
   `FixedToolbarFeatureClient` entry, so the client silently dropped the
   feature — the served form state contained `toolbarFixed`, the DOM contained
   no toolbar, and there were zero errors. Same failure family as NEW-02:
   server config says one thing, the import map decides what exists.
   Regenerating the import map (`payload generate:importmap`) fixed it.

## Proof (act-level, cycle-16 build, source ee5d3b2, clean)

- Fixed toolbar present in the DOM and visible in captures before any
  selection (probe-toolbar runs, `toolbar-final.png`).
- Real mouse click on the toolbar's Bold button
  (`.toolbar-popup__button-bold`) with text selected produced
  `<strong class="LexicalEditorTheme__textBold">Button bold final proof.</strong>`
  — visibly bold in the capture; the Bold button shows its active state.
- Draft autosave fired ("Draft saved automatically"); after a full page
  reload the same paragraph still carries the `<strong>` formatting
  (probe-toolbar6 read-back). Zero page errors throughout.

## Probe traps recorded (why earlier checks read as failures)

- Toolbar buttons are icon buttons identified by CSS class
  (`toolbar-popup__button-bold`), not by accessible name — label searches find
  nothing.
- Lexical renders bold as `<strong class="LexicalEditorTheme__textBold">`,
  not as a style-attributed span; format checks must look for the theme class.
- Ctrl+B button-state readings without an editor selection are meaningless;
  the button legitimately reports inactive with no selection.
