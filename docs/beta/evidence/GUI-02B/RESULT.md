# GUI-02B — Shared operator primitives

**Result: PASS** (bounded adoption, per prompt: no mass conversion)

## Changed files

- `src/modules/admin/primitives/index.tsx` + `primitives.module.css` —
  WorkspaceHeader (with breadcrumbs), SectionHeader, ActionLink
  (primary/secondary/destructive), StatusPill, EmptyState, ErrorState,
  DetailContainer, LoadingSkeleton. Styles use only `--admin-*` tokens.
- `src/modules/admin/PublisherDashboard.tsx` — representative adoption:
  header, section headers, status pills for content rows, empty states.
  Data queries, links and copy unchanged.
- `docs/beta/gui-overhaul/design-system.md` — primitive API table.
- `docs/beta/gui-overhaul/progress.md` — 02B row.

## States

- Light/dark: structural via tokens (both themes verified pattern from
  02A; no new colors introduced).
- Keyboard/focus: real links/buttons; `:focus-visible` outline token.
- Status meaning: dot + text, never color alone.
- Reduced motion: skeleton animation disabled under
  `prefers-reduced-motion`.
- Pending/denied for interactive controls: NOT YET EXERCISED — the first
  consumer is a server component using link actions. The pending/denied
  states are styled (`[disabled]`, `aria-disabled`) and get their live
  proof with the first client-side consumer (expected GUI-02C/03).

## Screenshots

NOT VERIFIED visually in this prompt — the dashboard's rendered output
changes only in header/pill presentation; recapture rides the next
build+serve cycle rather than a dedicated one. Content and structure
are unchanged (typecheck + build gates apply at batch delivery).

**Exact next prompt: GUI-02C.**
