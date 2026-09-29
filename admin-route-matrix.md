# Renegade CMS admin route matrix

Updated: 2026-09-28.

This is the admin-foundation contract. `Available` means the entry is an actual
link to a mounted route. `Unavailable` remains visible as an explicitly disabled
label, never as a link to a 404. It does not claim that the underlying record
management capability exists in this build.

| Area          | Available routes                                                                        | Unavailable, non-link entries                                                     | Server authorization                                     |
| ------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Dashboard     | `/admin`                                                                                | —                                                                                 | owner, administrator, staff                              |
| Publishing    | `/admin/posts`, `/admin/pages`                                                          | All Content, Sections, Categories, Topics, Tags; authoring/editing is unavailable | owner, administrator, staff; staff data is site-scoped   |
| Media         | `/admin/media-library`                                                                  | Assets, Podcasts                                                                  | owner, administrator, staff                              |
| Presentation  | `/admin/navigation`, `/admin/capabilities#theme-center` (owner)                         | Page Layouts                                                                      | owner, administrator, staff; owner for themes            |
| Discovery     | `/admin/indexing`, `/admin/intelligence`, `/admin/redirects`, `/admin/rendered-quality` | —                                                                                 | owner, administrator, staff; site targets validated      |
| Workflow      | `/admin/workflow`, `/admin/releases`                                                    | —                                                                                 | owner, administrator, staff; site targets validated      |
| Distribution  | `/admin/social`                                                                         | —                                                                                 | owner, administrator, staff; site targets validated      |
| Audience      | `/admin/audience`, `/admin/email-composer`                                              | Subscribers                                                                       | owner, administrator, staff; site targets validated      |
| Community     | `/admin/moderation`                                                                     | Forums, Discussions                                                               | owner, administrator, staff; site targets validated      |
| Commerce      | `/admin/catalog`, `/admin/commerce`, `/admin/fulfillment`                               | Products                                                                          | owner, administrator, staff; site targets validated      |
| Analytics     | `/admin/telemetry`                                                                      | —                                                                                 | owner only; other authenticated roles return to `/admin` |
| Users         | —                                                                                       | Staff Users, Authors, Community Members                                           | no mounted record-management route                       |
| Roles         | `/admin/security`                                                                       | —                                                                                 | owner, administrator, staff                              |
| Providers     | `/admin/providers`, `/admin/ai`                                                         | —                                                                                 | owner, administrator, staff; site targets validated      |
| Site Settings | —                                                                                       | General Settings, Sites, Brands                                                   | no mounted record-management route                       |
| Maintenance   | `/admin/capabilities` (owner), `/admin/migration` (owner/administrator)                 | —                                                                                 | staff returns to `/admin`                                |

## Authentication and boundaries

- `/admin/login` is Payload's reachable login route. The CMS passkey/recovery
  login is `/login`; successful passkey or recovery authentication creates the
  `renegade-passkey` session used by Payload and custom admin routes.
- Anonymous and unsupported roles are redirected to `/admin/login` by the admin
  shell. Restricted authenticated roles are returned to `/admin`, avoiding a
  dead-end or an open redirect.
- The only staff authentication roles are `owner`, `administrator`, and `staff`.
  The server validates role access independently of navigation visibility.
- Owners and administrators can manage all sites. Staff must have an assigned
  `adminSites` grant; collection access and site-bearing admin APIs reject
  unassigned site/entity targets.

## Verification

- Focused authorization and route tests: `58 passed` (`admin-access-policy` and
  `admin-navigation-and-surfaces`). They cover the three supported roles,
  anonymous/unsupported-role redirects, restricted analytics/maintenance
  routes, and assigned versus unassigned site boundaries.
- TypeScript: `npm.cmd run typecheck` passed.
- Route reachability on the ordinary local server: `/admin/login` returned 200;
  unauthenticated `/admin/providers` returned a safe 307 to `/admin/login`.

Browser role proof remains an explicit release gate: a disposable database with
three enrolled passkey users (owner, administrator, and staff with one assigned
site) is required. It was not run here because the configured local database is
the working `renegade` database and must not be modified for a role fixture.
