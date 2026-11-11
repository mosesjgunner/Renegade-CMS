# GUI-04H — Placement per the settled scope model — PASS (live, cycle-14)

**Approval:** Matthew, Nov 10, 2026 16:38 CT: "Okay.. so do that then keep going?" — implementing the scope model settled the same afternoon (spec: `files/scope-model-spaces-profiles-2026-11-10.md` in the goal folder).

**Changes:**

- `Publishing.ts` (`publisherFieldLayout`): the `site` field is now `admin.hidden` — it keeps the GUI-04C active-site prefill and stays required in the schema, but the editor never renders it. Publication/Space leave the sidebar and move into a new first settings group, **Placement** (collapsed via the standard group builder).
- `canonical-shared.ts` (`siteScopeFields`): Publication gains label "Publication (outlet)" + description "The outlet this runs in. Leave empty — most posts are just the website's own." Space gains label "Community space (optional)" + a plain description (a member's own space; most posts don't need one). Labels/descriptions ride the shared helper, so every collection using `siteScopeFields()` speaks the same words. (The taxonomy variant of these fields in Publishing.ts is untouched — follow-up if wanted.)
- `ContentTypeEntry.tsx`: "Editing a post. Back to posts" → "You're writing a post — it saves as you go. All posts."
- Body field description: engineering-speak replaced with "Write it like you'd say it. The controls above give you headings, links, lists, and quotes."

**Gates:** typecheck PASS; fresh-DB migrate/boot PASS on both the capture and integration databases (the layout-builder gate that caught 04C's first attempt); production build PASS (cycle-14, source `06bdfb0`, clean).

**Live proof (seeded article, cycle-14 server):** Site field present in form state but **not visible** (probe: `siteFieldVisible: false`); the string "GUI01B Site" appears nowhere in the page text; the sidebar now holds only Content Type / Status / Visibility / Published At; a collapsed **Placement** group sits as the first settings section; the new entry-note copy and body description render. Screenshot: `placement-v1.png` (also in GUI-04F evidence folder copy).

**Not in this pass (deliberate):** role-based field visibility (a space-only member's view) — that needs the two-role fixture (RC2-A-02 territory); the profile=space record consolidation — RC2 structural work; the taxonomy-scope publication/space labels.

**Follow-on captures (exit-report condition 6, this pass):** dark theme — sheet surface resolves to the dark input color (probe: `data-theme="dark"`, sheet bg rgb(34,34,34)), editor mounts, placement + sidebar carry over (`editor-dark-v1.png`). Create form — editor mounts with the "Start typing" placeholder, site field not visible, Placement collapsed, truthful autosave copy ("Save a draft once to enable autosave") (`editor-create-v1.png`).
