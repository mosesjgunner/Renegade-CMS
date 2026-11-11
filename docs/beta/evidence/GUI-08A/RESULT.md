# GUI-08A — Authenticated visual coverage matrix

**Result: PARTIAL** — the matrix below is complete and honest; coverage itself is not.

Build/fixture key: production builds of the working tree served
locally with the sanctioned LOCAL_E2E_TEST_MODE fixture (owner role,
one site "GUI01B Site", lean module floor unless noted). Themes:
light default; dark captured where marked.

| Surface                                                     | Evidence                                             | Status                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| Login (unauthenticated)                                     | GUI-01A visual + 03D denial check                    | PASS                                                    |
| Admin dashboard (task-first, 02B primitives live)           | 01B baseline + 03D captures                          | PASS                                                    |
| Post editor — create (desktop)                              | 01B before + cycle-2 after + 04E journey screenshots | PASS                                                    |
| Post editor — edit existing (desktop)                       | cycle-2 after + 04E journey (typed, saved, reloaded) | PASS                                                    |
| Post editor — 375px / 768px                                 | 01B baseline captures (pre-04A layout)               | PARTIAL (after-state widths not re-captured)            |
| Post editor — dark theme                                    | 01B edit-article-dark (pre-04A layout)               | PARTIAL (after-state dark not re-captured)              |
| History / revisions view                                    | 04E journey capture (empty-populated state)          | PARTIAL (populated revisions NV)                        |
| Media library                                               | 01B baseline capture; 06A module-off fix             | PARTIAL (module-off note + reorder not yet captured)    |
| Design system showcase /admin/design-system                 | 02D captures, both themes, 4/4                       | PASS                                                    |
| Navigation drawer + groups                                  | 03D nav probe (DOM-level)                            | PASS                                                    |
| Page builder (Puck)                                         | 06B audit only                                       | NV (no seeded page-layout journey)                      |
| Menus / Navigation Center                                   | 06C audit only                                       | NV (live edit/save journey)                             |
| Themes (Capability Center)                                  | 06C audit only                                       | NV                                                      |
| Discovery / Rendered Quality                                | 07A audit only                                       | NV (no published public surface in fixture)             |
| Release Center / Workflow                                   | 07B audit only                                       | NV (no release records in fixture)                      |
| Email composer / campaigns                                  | 07C fix (code-level)                                 | NV (no provider fixture)                                |
| Audience / moderation                                       | 07D audit only                                       | NV (module-gated)                                       |
| Commerce / fulfillment / POS                                | 07E audit only                                       | NV (module-gated; no live financial exercise by design) |
| AI Studio / Telemetry / Connections / Security / Capability | 07F audit only                                       | NV                                                      |
| ~100 native collection screens (Appendix A)                 | spot coverage only                                   | NV (bulk)                                               |
| 200% zoom, any surface                                      | —                                                    | NV (rides 08B)                                          |

Rules honored: no fabricated screenshots; every NV is named rather
than averaged away. The two PARTIAL editor rows (widths + dark,
after-state) and the 06A media capture are cheap closures on the
next capture cycle.

**Exact next prompt: GUI-08B.**
