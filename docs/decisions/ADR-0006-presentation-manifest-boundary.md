# ADR-0006: Deployment-owned presentation manifests over canonical views

Status: Adopted, PRE-00, 2026-09-12.

Canonical Content and immutable editorial revisions own facts and rich text. Public routes continue to resolve visibility, URLs, redirects, discovery, and SEO. Presentation packages consume the resulting views; they do not query or rewrite canonical content.

`src/modules/presentation/contracts.ts` defines the boundary. A ThemeManifest identifies a semantic package version and Renegade presentation compatibility range, capabilities, token schema/defaults, executable component and template registries, global regions, assets, explicit migrations, and bundled release provenance. Only trusted, deployment-bundled code is executable. Bundled provenance is not a claim of cryptographic package verification. Remote package installation is outside this boundary.

Templates declare compatible surfaces, named required/optional slots, and allowed registered components. The registry supplies a compatible default for an unknown or incompatible template identifier. Component versions must match exactly; unavailable components receive a visible placeholder while their original JSON remains recoverable. Unknown theme identifiers on legacy records use the neutral starter. Explicit version-pinned selections reject missing or incompatible packages.

PresentationDocument v1 contains scoped theme/template pins and layout slots, separately from canonical rich text. Existing PageLayout records remain the persisted legacy IR and are adapted at rendering/editor boundaries. Puck implements the VisualEditor adapter; no Puck Data is a storage contract. Editor round trips preserve unsupported blocks, version pins, visibility, placeholders, and untouched slots. Code registrations produce isolated registries rather than mutating an active global registry.

ThemeSelection v1 models site scope, active/draft version pins, permitted theme and template overrides, and a revision. Preview selection is explicit and belongs behind caller authentication. Activation validates the draft, then calls one compare-and-swap storage operation; failure leaves the active selection unchanged. PRE-00 implements and tests this protocol. The deployed singleton Site Settings `themeId` field supplies the current site default; durable multi-site draft selections and their admin transaction adapter are the next implementation boundary.

Rendering is deterministic for identical resolved inputs. Templates do not read time, random values, database state, or editor state. The shell receives its copyright year explicitly; editorial dates specify locale and UTC. Theme registries and nested defaults are frozen. Migrations receive cloned presentation state and may not change scope or canonical content identity; absent migrations fail without relabeling or overwriting the source.

The starter shell, article view, component definitions, and stylesheet are owned by `modules/presentation/themes`. Routing, metadata, canonical loaders, safe rich-text parsing, media access, and authorization retain their existing owners. Site identity comes from Site Settings, with a neutral recovery default. The public root and routes remain dynamic; settings writes invalidate the root layout, without changing content publication or SEO cache ownership.
