# Renegade CMS Social Publishing Architecture Report

**Research date:** August 10, 2026  
**Audience:** Renegade CMS product and implementation team  
**Scope:** Plug-and-play account connection, article-derived social drafts, approval, scheduling, publication, reconciliation, and basic analytics for X, Threads, Facebook Pages, Instagram professional accounts, LinkedIn, Bluesky, Mastodon, YouTube, and TikTok.

## Technical summary

Renegade CMS should implement social publishing as a **provider-neutral distribution subsystem inside the existing modular monolith**, not as a separate microservice and not as a universal “send this payload everywhere” abstraction.

The source article remains canonical. A distribution package creates independently editable variants for each connected account. Every variant is validated against a capability snapshot supplied by its provider adapter, approved under Renegade’s normal editorial rules, and converted into an immutable publication intent. A dedicated worker performs remote publication, records the exact request and response, and reconciles uncertain outcomes.

The first production stack should be:

- Next.js and Payload for the administration and API surfaces.
- PostgreSQL for all durable domain state, audit events, scheduling records, attempts, results, and analytics snapshots.
- Payload Jobs in a dedicated worker process for delayed execution, retries, recurring reconciliation, and token-health checks.
- S3-compatible object storage for source media and generated renditions.
- Sharp for bounded image transformations; add FFmpeg only when video adapters are introduced.
- Server-side provider adapters with no access or refresh tokens exposed to browsers.
- Application-level authenticated encryption for tokens, with the master key stored outside PostgreSQL and versioned for rotation.

The first engineering proof should implement **manual handoff, Bluesky, and Mastodon**. The first commercially useful release should add **Threads, Facebook Pages, and Instagram professional accounts after Meta review**, with X available as an optional cost-sensitive adapter. LinkedIn, YouTube uploads, and TikTok should follow only after their approval, media, and operational requirements are proven.

The central product promise must be:

> Publish an article, receive editable native drafts, approve them, schedule them, and see an honest result for every account, including when Renegade cannot publish automatically.

The promise must not be “every network behaves the same.” Official APIs do not support that claim.

## Key findings: provider support is a capability matrix, not a checkbox

The official APIs support useful publishing, but access friction and media workflows vary substantially. Renegade should expose five user-facing support states:

1. **Connected and available**: the current account, token, scopes, adapter, and requested format support publication.
2. **Connected with limitations**: publishing works, but the account type, media type, metrics, or feature set is restricted.
3. **App approval required**: Renegade’s installation or registered application lacks a required reviewed product or scope.
4. **Manual handoff**: Renegade can prepare, validate, copy, download, or open the platform composer but cannot perform the final post.
5. **Unavailable**: the provider or format is not safely supported.

The implementation-readiness score used in the accompanying chart is a Renegade planning judgment, not a platform performance metric: `3` means a suitable official API and manageable access path for an early adapter; `2` means an official API with material commercial, review, account, or media constraints; `1` means a manual-first or later-phase integration; `0` means no supported publication route.

| Network   | Official publication capability                                                   | Material constraints                                                                                                           | Recommended Renegade stage     |
| --------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Bluesky   | Text, links, images, video, replies/threads through AT Protocol records           | OAuth/PDS-aware implementation; rich-text facets use UTF-8 byte offsets                                                        | Engineering proof and Phase 1  |
| Mastodon  | Text, media, polls, content warnings, visibility, replies, server-side scheduling | Every instance can publish different text and media limits; instance discovery is mandatory                                    | Engineering proof and Phase 1  |
| Threads   | Text, image, video, and carousel publishing; insights                             | Meta app configuration/review; token lifecycle; 250 API-published posts per rolling 24 hours                                   | Phase 1 after approval         |
| Facebook  | Page publishing with Page access tokens                                           | Support Pages, not personal-profile automation; permissions, Page roles, and review apply                                      | Phase 1 after approval         |
| Instagram | Images, carousels, Reels, and Stories where permitted                             | Professional accounts only; Stories differ by account type; publishing limits and container processing                         | Phase 1 after approval         |
| X         | Text, media, threads/replies, polls, metrics                                      | Usage-based pricing, quotas, changing commercial terms, and token/scopes must be checked                                       | Optional Phase 1 provider pack |
| LinkedIn  | Member and organization posts with rich content                                   | Organization roles, versioned APIs, and many Community Management permissions require approval                                 | Phase 2                        |
| YouTube   | Video upload, metadata, processing status, scheduled publication, analytics       | Video-specific workflow and quotas; no documented general Community-post creation resource                                     | Phase 2                        |
| TikTok    | Direct video/photo posting and upload-to-draft                                    | `video.publish`/`video.upload` approval; unaudited clients are private-only; prescribed consent UX and status polling/webhooks | Phase 3, manual/upload first   |

### Platform-specific conclusions

**X.** The X API can create posts and upload media, and OAuth 2.0 Authorization Code with PKCE supports user-context scopes. Access tokens issued without `offline.access` last only two hours; refresh-token handling is therefore not optional for scheduling. X now describes flexible pay-per-usage pricing, so the adapter must expose cost/quota diagnostics and be independently disableable. Public and private metrics have different authentication and retention characteristics. Sources: [Create Posts](https://docs.x.com/x-api/posts/create-post), [OAuth 2.0 with PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code), [rate limits](https://docs.x.com/x-api/fundamentals/rate-limits), and [metrics](https://docs.x.com/x-api/fundamentals/metrics).

**Threads.** The official API supports text, image, video, and carousel posts plus insights. Threads profiles are limited to 250 API-published posts in a rolling 24-hour period, and long-lived access tokens are valid for 60 days and refreshable under Meta’s stated conditions. Renegade should treat token refresh and publishing-limit usage as visible connection health. Sources: [Threads API](https://developers.facebook.com/documentation/threads), [Threads posts](https://developers.facebook.com/documentation/threads/posts), [Threads overview](https://developers.facebook.com/documentation/threads/overview), and [long-lived tokens](https://developers.facebook.com/documentation/threads/get-started/long-lived-tokens).

**Facebook Pages.** Renegade should support Page publishing only. The Pages API uses Page access tokens, and `pages_manage_posts` permits creating, editing, and deleting Page posts. The account picker must verify the authenticating user’s Page tasks/roles before allowing publication. Personal-profile automation should not be simulated with browser control. Sources: [Pages API](https://developers.facebook.com/documentation/pages-api), [Page posts](https://developers.facebook.com/documentation/pages-api/posts), and [Meta permissions](https://developers.facebook.com/docs/permissions/).

**Instagram.** Official content publishing is for professional accounts. The current API supports image, carousel, Story, and Reel containers, with account-type and authorization differences. The current Content Publishing documentation states a 100 API-published-post rolling 24-hour limit, while some legacy/reference surfaces may show older limits; Renegade should query the publishing-limit endpoint and avoid treating a documentation constant as runtime truth. Sources: [Instagram overview](https://developers.facebook.com/documentation/instagram-platform/overview), [Content Publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing), [IG User Media](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media), and [App Review](https://developers.facebook.com/documentation/instagram-platform/app-review).

**LinkedIn.** The Posts API supports authenticated-member and organization publishing. `w_member_social` permits member posting; `w_organization_social` is restricted by organization role. Read access and richer Community Management permissions are more restricted, which means “publish succeeded” and “analytics available” must be modeled separately. LinkedIn uses versioned API headers, and article posts require explicit article fields rather than server-side URL scraping. Sources: [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-07), [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access), [Increasing Access](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access?view=li-lms-2026-06), and [MultiImage posts](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/multiimage-post-api?view=li-lms-2026-07).

**Bluesky.** Posts are AT Protocol repository records. Text, timestamps, links, media embeds, replies, and threads are well suited to an early adapter, but the adapter must be PDS-aware rather than assuming one central host. OAuth is the forward path; app passwords may remain a migration fallback, not the default user experience. Rich-text facets use UTF-8 byte offsets, so JavaScript string indices cannot safely create mentions and links. Sources: [Posts](https://docs.bsky.app/docs/advanced-guides/posts), [OAuth client implementation](https://docs.bsky.app/docs/advanced-guides/oauth-client), [API hosts and auth](https://docs.bsky.app/docs/advanced-guides/api-directory), and [rich text](https://docs.bsky.app/docs/advanced-guides/post-richtext).

**Mastodon.** The statuses API supports publication and accepts an `Idempotency-Key`; the server retains that key for a bounded period. Mastodon also supports native scheduling, but Renegade should keep its own schedule as authoritative so campaigns remain consistent across networks. Each instance advertises text length, URL accounting, media counts, MIME types, and byte/pixel limits. The adapter must discover and cache those values per instance. Sources: [statuses API](https://docs.joinmastodon.org/methods/statuses/), [Instance entity](https://docs.joinmastodon.org/entities/Instance/), [OAuth](https://docs.joinmastodon.org/spec/oauth/), and [scheduled statuses](https://docs.joinmastodon.org/methods/scheduled_statuses/).

**YouTube.** The Data API supports resumable video upload, metadata, processing/rejection states, and scheduled publication using `status.publishAt` while a never-published video is private. The 2026 quota system gives `videos.insert` its own bucket with a default 100 uploads per day. The published Data API reference does not expose a general Community-post creation resource; Renegade should therefore support videos and Shorts, not promise Community-post automation. Sources: [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert), [Video resource](https://developers.google.com/youtube/v3/docs/videos), [Data API reference](https://developers.google.com/youtube/v3/docs), and [quota calculator](https://developers.google.com/youtube/v3/determine_quota_cost).

**TikTok.** The Content Posting API supports direct posting and upload-to-draft for video and photo content. Both app approval and user authorization are required. Content from unaudited Direct Post clients is restricted to private viewing. TikTok also prescribes creator-information queries, explicit user consent, status polling, and webhooks. Therefore, the first TikTok integration should prepare media and upload a draft or provide a manual handoff; direct posting should remain feature-gated until audit approval is real. Sources: [Content Posting overview](https://developers.tiktok.com/products/content-posting-api/), [Direct Post](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post), [Get Started](https://developers.tiktok.com/doc/content-posting-api-get-started), and [post status](https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status).

## System boundary and dependency order

The subsystem’s reusable core is:

`article revision → distribution package → account variants → validation → approval → publication intents → jobs → provider adapters → results → reconciliation → analytics snapshots`

The subsystem owns:

- social-provider registration and capability metadata;
- OAuth/app-password connection lifecycle;
- connected remote accounts/channels;
- per-account permissions inside Renegade;
- deterministic and AI-assisted variant generation;
- approvals, scheduling, campaigns, and immutable publication intents;
- media renditions used for social distribution;
- publication attempts, remote identifiers, errors, and reconciliation;
- raw and normalized analytics snapshots;
- audit events and administrator diagnostics.

It does not own:

- the canonical article body or article revision history;
- general Renegade authentication and organization membership;
- the primary media library object;
- newsletter delivery;
- the public site’s canonical URL rules;
- a general-purpose marketing automation engine;
- social listening or inbox management in the first releases.

The dependency order is important:

1. Freeze provider contracts, domain states, and audit semantics.
2. Build distribution packages and manual handoff without OAuth.
3. Add token storage and one real adapter.
4. Add durable scheduling and ambiguous-result reconciliation.
5. Add approval policy and multiple accounts.
6. Add media transformation and higher-friction providers.
7. Add analytics only after publication records are trustworthy.
8. Add campaigns and optimization only after single-post reliability is measured.

## The unavoidable self-hosting constraint: provider application credentials

“Connect once” is achievable after a provider application exists. “Zero-configuration OAuth from any arbitrary self-hosted domain” is not generally achievable with official centralized-platform APIs.

Meta, X, LinkedIn, Google/YouTube, and TikTok issue client IDs/secrets to a registered developer application, bind redirect URIs, and may review the application’s owner and use case. Renegade cannot embed one shared confidential client secret in open-source code. Nor should a random self-hosted installation silently impersonate a centrally registered Renegade application.

Renegade should support two explicit setup modes:

| Mode                               | Ownership and flow                                                                                                                                          | Advantages                                                                       | Trade-off                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Self-hosted/BYO provider app       | Site owner creates a developer app, enters its ID/secret into the server-side setup wizard, and registers the installation’s exact callback URL             | Maximum ownership, portability, and policy clarity; no Renegade cloud dependency | Initial provider setup is guided, but not one-click                                                                                     |
| Optional managed connection broker | A separately operated Renegade service owns reviewed provider apps and performs the OAuth callback/token exchange through a tightly scoped, consented relay | Closest experience to Buffer-style one-click connection                          | Introduces a central service, temporary token handling, operating cost, provider contracts, incident response, and a new trust boundary |

The open-source first release should implement **BYO provider application credentials** and make setup unusually clear: provider-specific checklists, callback URL copy buttons, scope explanations, review-status fields, connection tests, and actionable diagnostics. Bluesky and Mastodon can be closer to true plug-and-play because their protocols support decentralized service discovery or per-instance app registration.

An optional managed broker should be designed only after provider terms and demand are validated. If built, it must be opt-in, separately threat-modeled, unable to read article content unless required for a provider call, minimize token residence time, return installation-bound one-time results, support revocation, and never become necessary for manual distribution or BYO-app connections. Renegade exports must identify which connections depend on the broker without exporting usable secrets.

## Recommended runtime architecture

| Responsibility        | First production choice                                                                  | Why                                                                                             | Revisit trigger                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Admin/editor UI       | Next.js + Payload admin extensions                                                       | Already selected; keeps article and distribution workflows together                             | Only replace individual editor surfaces if Payload extension limits block usability                                 |
| Domain state          | PostgreSQL/Payload collections                                                           | Transactional source of truth, portable self-hosting, easy audit joins                          | Never replace merely for scale; add replicas/partitioning after measured pressure                                   |
| Delayed jobs          | Payload Jobs in a dedicated worker                                                       | Already in the stack; supports `waitUntil`, schedules, workflows, retries, and separate workers | Move to pg-boss if job control/locking/operations prove insufficient; BullMQ only when Redis is otherwise justified |
| Complex orchestration | Application state machines                                                               | Publication workflows are bounded and auditable in SQL                                          | Consider Temporal only after long-running multi-day workflows and operational volume justify its extra service      |
| Media storage         | S3-compatible object storage                                                             | Portable, signed delivery URLs, decoupled from web nodes                                        | Add provider-specific ingest storage only if required                                                               |
| Image transforms      | Sharp                                                                                    | Mature Node image pipeline with low operational weight                                          | Add a remote image service after measured CPU/latency pressure                                                      |
| Video processing      | Deferred FFmpeg worker                                                                   | Avoids burdening the article MVP                                                                | Introduce for YouTube/TikTok/Reels once formats are scoped                                                          |
| Secrets               | Versioned AEAD envelope in application; master key outside DB                            | Backups and DB exports do not expose tokens; supports rotation                                  | Add cloud KMS/Vault adapter when installation has one                                                               |
| Observability         | Structured logs, OpenTelemetry-compatible spans, health endpoints, error tracker adapter | Self-hostable baseline and provider-level diagnosis                                             | Add centralized log stack at deployment scale                                                                       |

Payload’s job system officially supports delayed `waitUntil` execution, scheduled actions, dedicated processing, and task/workflow retries. That makes it the lowest-complexity v1 choice. Renegade must still own idempotency and publication truth in its domain tables; no queue provides exactly-once side effects against third-party APIs. Source: [Payload Jobs Queue](https://payloadcms.com/docs/jobs-queue/overview).

### Process topology

- **Web process:** editor/API requests, OAuth starts/callbacks, draft mutation, approval, schedule creation, read-only status.
- **Worker process:** token refresh, media preparation, publication, retry classification, polling/reconciliation, analytics collection.
- **Scheduler trigger:** invokes Payload schedule handling at least once per minute. A second watchdog query finds due publication intents that have no runnable job.
- **PostgreSQL:** canonical lifecycle and audit history.
- **Object storage:** original and derived assets; providers receive signed, short-lived HTTPS URLs only when required.

The web process must never call a provider publication endpoint inside the article-save request. Article publishing should succeed even when every social provider is unavailable.

## Domain model and invariants

### Core records

| Record                     | Essential fields                                                                                                       | Invariants                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `SocialProviderDefinition` | `key`, adapter version, status, auth modes, capability schema version                                                  | Code/plugin registry is authoritative; DB stores installed/configured state, not executable secrets       |
| `ProviderAppCredential`    | tenant/installation, provider, client ID, encrypted client secret/private key, redirect URI, review state, key version | Installation-scoped; never bundled in source or sent to browsers; optional broker references are explicit |
| `OAuthConnection`          | tenant/site, provider, encrypted tokens, scopes, expiry, refresh status, key version, remote principal                 | Tokens never appear in normal API serialization or audit payloads                                         |
| `ConnectedChannel`         | connection, remote ID, type, display name, handle, instance/PDS, capability snapshot, status                           | Unique by tenant + provider + remote ID; capability snapshot is timestamped                               |
| `SocialPermissionGrant`    | user/role, channel/campaign/site scope, capability, conditions                                                         | Deny by default; article permission does not imply channel permission                                     |
| `DistributionPackage`      | source article/revision, status, generator version, created by                                                         | References an immutable source revision when approval begins                                              |
| `SocialVariant`            | package, channel, format, body, link strategy, media plan, generation provenance, validation                           | Independently editable; retains source revision and fact-boundary version                                 |
| `MediaRendition`           | source asset, purpose, crop, dimensions, MIME, hash, storage key, status                                               | Immutable once used by an approved publication intent                                                     |
| `ApprovalDecision`         | variant/intent, actor, decision, policy, content hash, timestamp                                                       | Approval covers an exact content hash, schedule policy, and channel set                                   |
| `PublicationSchedule`      | timezone, local wall time, UTC instant, DST policy, missed-run policy                                                  | UTC instant is executable truth; original local intent is retained for display/audit                      |
| `PublicationIntent`        | variant snapshot, channel, schedule, idempotency key, content hash, state                                              | Immutable after approval; edits create a replacement intent and invalidate approval                       |
| `PublicationAttempt`       | intent, attempt number, request fingerprint, provider request ID, start/end, outcome class                             | Append-only; sanitized request/response only                                                              |
| `PublicationResult`        | intent, remote ID/URL, published time, raw status, reconciliation state                                                | At most one accepted result per intent/channel                                                            |
| `AnalyticsSnapshot`        | result, provider metric name, canonical family, value, unit, window, captured time, raw payload reference              | Raw names are preserved; incomparable metrics are never silently merged                                   |
| `Campaign`                 | site/brand, objective, variants/intents, cadence, pacing policy, status                                                | Campaign automation cannot bypass per-intent safety/approval policy                                       |
| `SocialAuditEvent`         | tenant, actor, action, target, before/after hashes, IP/session metadata, timestamp                                     | Append-only, redacted, searchable, and exportable                                                         |

### Lifecycle states

`draft → needs_approval → approved → scheduled → queued → publishing → published`

Additional states:

- `validation_failed`: variant violates current provider/account capability.
- `approval_rejected`: an approver rejected the exact content version.
- `canceled`: a user canceled before the remote side effect began.
- `retry_wait`: a safe retry is scheduled.
- `unknown_remote_state`: the request may have succeeded remotely, but Renegade lacks proof.
- `failed_terminal`: no automatic retry is safe or allowed.
- `needs_reconnection`: token or account authorization is invalid.
- `superseded`: a new intent replaced this one before publication.

State changes must use compare-and-swap semantics (`WHERE state = expected`) and append an audit event in the same database transaction.

## Provider adapter contract

```ts
export type ProviderKey =
  | 'x'
  | 'threads'
  | 'facebook-pages'
  | 'instagram'
  | 'linkedin'
  | 'bluesky'
  | 'mastodon'
  | 'youtube'
  | 'tiktok'

export type CapabilityState =
  | 'available'
  | 'limited'
  | 'app_approval_required'
  | 'manual_handoff'
  | 'unavailable'

export interface ProviderCapabilities {
  schemaVersion: number
  fetchedAt: string
  accountType: string
  formats: Record<
    string,
    {
      state: CapabilityState
      maxText?: number
      maxMedia?: number
      mimeTypes?: string[]
      maxBytes?: number
      aspectRatios?: string[]
      supportsAltText?: boolean
      supportsNativeSchedule?: boolean
      supportsRemoteLookupAfterPublish?: boolean
      limitations: string[]
    }
  >
  analytics: Record<string, CapabilityState>
  rateLimit?: { remaining?: number; resetAt?: string; source: 'api' | 'config' }
}

export interface PublishContext {
  intentId: string
  tenantId: string
  channelId: string
  idempotencyKey: string
  contentHash: string
  now: Date
}

export type PublishOutcome =
  | { kind: 'published'; remoteId: string; remoteUrl?: string; raw: unknown }
  | { kind: 'processing'; providerOperationId: string; pollAfterMs: number; raw: unknown }
  | { kind: 'rejected'; error: ProviderError }
  | { kind: 'unknown'; reason: string; providerRequestId?: string }

export interface SocialProviderAdapter {
  readonly key: ProviderKey
  readonly version: string

  getAuthDescriptor(site: SiteContext): Promise<AuthDescriptor>
  beginAuthorization(input: BeginAuthInput): Promise<AuthRedirect>
  completeAuthorization(input: OAuthCallbackInput): Promise<ConnectionTokens>
  refreshConnection(connection: SecretConnection): Promise<ConnectionTokens>
  revokeConnection(connection: SecretConnection): Promise<void>

  listChannels(connection: SecretConnection): Promise<RemoteChannel[]>
  getCapabilities(channel: ConnectedChannel): Promise<ProviderCapabilities>
  validateDraft(draft: ProviderDraft, caps: ProviderCapabilities): ValidationIssue[]
  prepareMedia(input: MediaPreparationInput): Promise<PreparedMedia[]>
  publish(input: ProviderPublishInput, ctx: PublishContext): Promise<PublishOutcome>
  reconcile(input: ReconcileInput): Promise<ReconcileOutcome>
  fetchAnalytics?(input: AnalyticsInput): Promise<ProviderMetric[]>
}
```

Adapter methods receive decrypted tokens only inside a short-lived server/worker scope. They must not log headers, full request bodies containing secrets, signed upload URLs, or raw token responses.

## OAuth and credential lifecycle

Use Authorization Code with PKCE wherever the provider supports it, even for a confidential web client. RFC 9700 is the current OAuth 2.0 security best-current-practice reference and deprecates insecure historical patterns. Source: [RFC 9700](https://www.rfc-editor.org/info/rfc9700/).

### Connection sequence

```ts
async function startConnection(user: User, provider: ProviderKey, siteId: string) {
  authorize(user, 'social.connection.create', { siteId, provider })

  const state = randomBytes(32)
  const verifier = randomBytes(64)
  const nonce = randomBytes(32)

  await oauthTransactions.insert({
    id: uuid(),
    userId: user.id,
    siteId,
    provider,
    stateHash: sha256(state),
    verifierCiphertext: encrypt(verifier, oauthAAD(siteId, provider)),
    nonceHash: sha256(nonce),
    exactRedirectUri: configuredRedirect(provider),
    expiresAt: addMinutes(now(), 10),
    consumedAt: null,
  })

  return adapter(provider).beginAuthorization({
    state: base64url(state),
    codeChallenge: base64url(sha256(verifier)),
    redirectUri: configuredRedirect(provider),
    scopes: minimumRequiredScopes(provider),
  })
}

async function completeConnection(callback: OAuthCallbackInput) {
  return db.transaction(async (tx) => {
    const pending = await tx.oauthTransactions.lockByStateHash(sha256(callback.state))
    assert(pending && !pending.consumedAt && pending.expiresAt > now())
    assert(callback.redirectUri === pending.exactRedirectUri)

    const tokens = await adapter(pending.provider).completeAuthorization({
      ...callback,
      codeVerifier: decrypt(pending.verifierCiphertext),
    })

    const remotePrincipal = await validateTokenAndFetchPrincipal(tokens)
    const connection = await tx.connections.upsertEncrypted({
      siteId: pending.siteId,
      provider: pending.provider,
      remotePrincipal,
      tokens,
      keyVersion: activeKeyVersion(),
    })

    await tx.oauthTransactions.markConsumed(pending.id)
    await tx.audit.append(redactedConnectionEvent(connection))
    return connection.publicView()
  })
}
```

### Encryption design

- Encrypt access tokens, refresh tokens, app passwords, client secrets, and provider app secrets with an authenticated-encryption algorithm such as XChaCha20-Poly1305 or AES-256-GCM.
- Use a fresh nonce for every value and bind ciphertext to tenant ID, connection ID, provider key, token type, and key version as additional authenticated data.
- Keep the master key outside the database: mounted secret file, operating-system secret store, Docker/Kubernetes secret, Vault, or cloud KMS.
- Store only a key identifier/version beside ciphertext. Support decrypt-old/encrypt-new rotation.
- Encrypt database backups independently; a database backup plus application image must still be insufficient to recover tokens.
- Redact secrets from structured logs, error trackers, job payloads, audit events, support bundles, and admin APIs.
- On disconnect, revoke remotely when supported, mark the channel unusable immediately, delete encrypted token material according to retention policy, and preserve non-secret publication/audit history.

OWASP’s secrets guidance emphasizes separating key management from stored secrets and planning the full secret lifecycle. Sources: [Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) and [Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html).

## Scheduling, idempotency, and reconciliation

### Schedule representation

Store all of the following:

- `scheduledAtUtc`: the executable instant;
- `timezone`: IANA zone, such as `America/Chicago`;
- `localWallTime`: what the editor selected;
- `dstResolution`: `earlier`, `later`, or `reject` for ambiguous times;
- `missingTimePolicy`: `shift_forward` or `reject` for nonexistent spring-forward times;
- `missedRunPolicy`: `publish_now`, `skip`, or `require_review`;
- `notBefore` and optional `expiresAt` for campaign windows.

Saved timing presets store local-time intent and calculate a new UTC instant for each occurrence. One-time schedules store the chosen UTC instant permanently.

### Publication worker

```ts
async function runPublication(intentId: string) {
  const intent = await claimIntent(intentId) // compare-and-swap to publishing
  if (!intent) return

  const existing = await results.findAcceptedByIntent(intent.id)
  if (existing) return markPublishedFromExisting(intent, existing)

  const currentCaps = await capabilityService.getFresh(intent.channelId)
  const issues = adapter(intent.provider).validateDraft(intent.snapshot, currentCaps)
  if (issues.some((i) => i.severity === 'error')) return failValidation(intent, issues)

  const connection = await secretConnections.openForWorker(intent.connectionId)
  const attempt = await attempts.begin({
    intentId: intent.id,
    requestFingerprint: intent.contentHash,
    idempotencyKey: intent.idempotencyKey,
  })

  try {
    const outcome = await adapter(intent.provider).publish(
      buildProviderInput(intent, connection),
      buildPublishContext(intent),
    )
    await applyOutcomeAtomically(intent, attempt, outcome)
  } catch (error) {
    const classification = classifyProviderError(error)
    await handleClassifiedFailure(intent, attempt, classification)
  } finally {
    connection.zeroize()
  }
}
```

### Retry rules

| Failure class              | Examples                                                | Automatic action                                                   |
| -------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| Safe transient before send | DNS failure before connection, local transform failure  | Exponential backoff with jitter                                    |
| Explicit remote rejection  | Invalid media, policy violation, missing scope          | No retry until content, capability, or connection changes          |
| Rate limit                 | HTTP 429 with reset information                         | Retry after provider reset plus jitter; respect per-channel pacing |
| Authentication             | Invalid/expired token                                   | Attempt one controlled refresh; otherwise `needs_reconnection`     |
| Remote processing          | YouTube/TikTok/media container accepted                 | Poll or await webhook; do not resubmit upload blindly              |
| Ambiguous side effect      | Timeout or connection reset after request body was sent | `unknown_remote_state`; reconcile or require manual decision       |
| Provider outage            | Repeated 5xx                                            | Circuit breaker, delayed retry, status banner, alert               |

The last row is critical. Most social APIs do not guarantee an idempotency key for post creation. If Renegade cannot prove that a timed-out request failed before the platform accepted it, an automatic retry can create a duplicate. The worker must freeze the intent, look up the provider operation/request ID when available, search the authenticated account’s recent posts when the API permits, and otherwise ask an operator to reconcile. Mastodon’s explicit `Idempotency-Key` support should be used, but Renegade’s own intent key remains authoritative across all providers.

### Watchdogs

- Every minute: enqueue due approved intents not already claimed.
- Every five minutes: find `publishing` attempts past their lease.
- Provider-specific interval: poll remote processing operations.
- Hourly: refresh capability snapshots nearing staleness.
- Daily: validate token expiry horizon and alert before reconnection becomes urgent.
- Nightly: reconcile published results missing URLs/IDs and fetch early analytics.

## Content adaptation and the fact boundary

Renegade must work without AI. Every provider ships deterministic templates based on article metadata, excerpt, canonical URL, author, taxonomy, and approved calls to action. AI may improve those drafts only when a site owner supplies a key and explicitly invokes or enables assistance.

### Deterministic baseline

```ts
interface ArticleDistributionFacts {
  sourceRevisionId: string
  title: string
  dek?: string
  canonicalUrl: string
  authorDisplayName: string
  approvedQuotes: Array<{ id: string; text: string }>
  approvedClaims: Array<{ id: string; text: string; citationIds: string[] }>
  entities: Array<{ id: string; name: string; handles?: Record<string, string> }>
  tags: string[]
  sensitivity: 'normal' | 'political' | 'medical' | 'financial' | 'legal'
}

function deterministicDraft(
  provider: ProviderKey,
  facts: ArticleDistributionFacts,
  caps: ProviderCapabilities,
): ProviderDraft {
  const template = templateRegistry.select(provider, facts.sensitivity, caps)
  return template.render({
    headline: facts.title,
    summary: facts.dek,
    url: facts.canonicalUrl,
    tags: rankTags(facts.tags, provider),
  })
}
```

### AI contract

The AI input should contain the article revision, explicit approved facts, allowed quotes, citations, tone profile, provider constraints, and requested format. The output must be structured:

```ts
interface GeneratedSocialDraft {
  text: string
  thread?: string[]
  mediaBriefs?: MediaBrief[]
  usedFactIds: string[]
  usedQuoteIds: string[]
  suggestedClaims: Array<{
    text: string
    support: 'source_fact' | 'source_quote' | 'unsupported'
    sourceIds: string[]
  }>
  warnings: string[]
}
```

Reject or visibly quarantine unsupported claims, invented statistics, invented quotations, endorsements, identities, or citations. A model may compress or reframe an approved fact, but sensitive content requires human approval after AI generation. For political/civic, medical, financial, and legal categories, regenerated text invalidates the prior approval.

The editor should show three provenance states at sentence or block level when practical: deterministic template, AI-generated, and human-edited. This is an editorial aid, not a public disclosure requirement.

## Media architecture

1. Preserve the original media-library asset.
2. Create a `MediaRenditionRequest` for a target provider/format.
3. Validate MIME from file signatures, not extensions alone.
4. Decode in an isolated worker with byte, pixel, duration, frame-rate, and resource limits.
5. Strip unsafe metadata by default while preserving accessibility and rights metadata in Renegade records.
6. Generate immutable renditions identified by a content hash and transformation recipe.
7. Upload the rendition to private object storage.
8. Give a provider a short-lived signed URL only when pull-from-URL is required; otherwise stream/upload from the worker.
9. Store provider upload handles separately from Renegade assets.
10. Delete temporary files and expire signed URLs promptly.

Remote media URLs supplied by users are SSRF inputs. Permit HTTPS only; resolve and validate DNS/IP before every redirect; block loopback, link-local, private, multicast, metadata-service, and internal ranges; cap redirects, bytes, and time; and revalidate after resolution. Do not let the HTTP client inherit ambient cloud credentials. Sources: [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) and [File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

## API design

All endpoints are tenant/site scoped and enforce both Renegade permissions and channel-specific grants.

| Method and route                                 | Purpose                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `GET /api/social/providers`                      | Installed providers, configuration readiness, capability summaries   |
| `POST /api/social/connections/:provider/start`   | Begin OAuth/connection transaction                                   |
| `GET /api/social/connections/:provider/callback` | Complete provider callback; never return tokens                      |
| `GET /api/social/connections`                    | List redacted connections and health                                 |
| `POST /api/social/connections/:id/refresh`       | Validate/refresh under explicit permission                           |
| `DELETE /api/social/connections/:id`             | Revoke/disconnect and apply retention policy                         |
| `GET /api/social/connections/:id/channels`       | Discover remote Pages/profiles/channels/instances                    |
| `POST /api/social/channels/:id/enable`           | Attach channel to site/brand and capture capabilities                |
| `GET /api/social/channels/:id/capabilities`      | Current account-specific capabilities and limitations                |
| `POST /api/articles/:id/distribution-packages`   | Create drafts from an exact article revision                         |
| `GET /api/distribution-packages/:id`             | Read package, variants, validation, approval, and status             |
| `PATCH /api/social/variants/:id`                 | Edit one platform/account variant                                    |
| `POST /api/social/variants/:id/validate`         | Revalidate against current capability snapshot                       |
| `POST /api/social/variants/:id/approve`          | Approve exact content hash under policy                              |
| `POST /api/social/intents`                       | Create immutable publication intents and schedules                   |
| `POST /api/social/intents/:id/cancel`            | Cancel if remote side effect has not begun                           |
| `POST /api/social/intents/:id/retry`             | Operator-triggered safe retry only                                   |
| `POST /api/social/intents/:id/reconcile`         | Resolve unknown/processing outcome                                   |
| `GET /api/social/calendar`                       | Scheduled and historical intents                                     |
| `GET /api/social/publications/:id`               | Attempts, remote URL/ID, sanitized responses, errors                 |
| `GET /api/social/analytics`                      | Raw and canonical metric views with definitions                      |
| `POST /api/social/webhooks/:provider`            | Verified provider callbacks; raw body retained only as safely needed |
| `GET /api/social/diagnostics`                    | Queue lag, token horizon, provider health, rate limits, dead letters |

Mutation endpoints accept an `Idempotency-Key` for Renegade-side request deduplication. Browser clients receive redacted DTOs. Raw provider payloads are available only to privileged diagnostics roles and must be scrubbed.

## Permissions and editorial workflow

Use capabilities rather than hard-coded role checks. Default role mappings can be:

| Role                 | Default social capabilities                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| Site owner           | Configure provider apps, connect/disconnect owned accounts, delegate, approve, publish, export  |
| Administrator        | Manage connections and policy unless owner-only restriction applies                             |
| Social-media manager | Edit variants, schedule approved content, view results/analytics; no article editing by default |
| Editor/approver      | Review and approve sensitive and normal variants; no token management                           |
| Author               | Generate and edit drafts for own articles; cannot publish by default                            |
| Contributor          | Suggest drafts only                                                                             |
| Analyst/viewer       | Read publication history and permitted analytics                                                |

Grants can be constrained by site, brand, campaign, provider, connected channel, content sensitivity, time window, and action. The authorization decision should answer: `may actor perform capability on resource under current conditions?`

Recommended policy defaults:

- Normal content: one approver when team workflow is enabled.
- Political/civic, medical, financial, or legal content: mandatory human approval; AI cannot approve.
- New or reconnected channel: owner/admin confirmation before first publication.
- Bulk/campaign changes: step-up authentication and a summary confirmation.
- Disconnect, token export, or provider-app secret changes: owner-only or explicit security capability.
- Offboarding: revoke grants immediately, terminate sessions, rotate shared provider secrets when applicable, and revalidate scheduled intents created by the departed user.

## Editor and administrator experience

### Article distribution drawer

After saving or publishing an article:

1. Renegade creates a distribution package from the exact revision.
2. Connected accounts appear as rows with honest capability badges.
3. Each selected account receives a deterministic draft immediately.
4. Tabs or cards allow independent text, media, CTA, hashtags, mentions, link strategy, and schedule.
5. A source panel shows article facts, quotations, and citations used by the variant.
6. Validation is live and account-specific.
7. The action summary states exactly which accounts will publish automatically, require approval, or use manual handoff.
8. Approval and scheduling create immutable intents.

### Required views

- **Connections:** provider setup readiness, connected principals, channels, scopes, expiry horizon, last validation, rate-limit state, and reconnect action.
- **Composer:** source article on the left, account variants on the right, with compact/expanded modes.
- **Approval inbox:** differences from the source revision, AI provenance, validation, sensitivity, requested schedule, and prior decisions.
- **Calendar/queue:** per-channel schedule, time zone, campaign, state, drag/reschedule with approval invalidation rules.
- **Publication history:** remote links, attempt timeline, sanitized error, retry/reconcile controls, and final state.
- **Diagnostics:** worker heartbeat, queue lag, due-but-not-enqueued count, token expiry, webhook health, provider incidents, and dead letters.

Platform previews must be labeled **approximate** unless the provider offers an official render/preview mechanism. Renegade should preview its own payload and media geometry, not pretend to reproduce constantly changing feed UI pixel-for-pixel.

## Analytics without false equivalence

Store provider data in two layers:

1. **Raw metric snapshots:** provider metric name, value, unit, query window, collection time, attribution rules, and sanitized raw response.
2. **Canonical families:** `impressions_or_views`, `engagement_actions`, `link_clicks`, `video_starts`, `video_completions`, `follower_count`, with explicit provider-specific definitions.

Never display one cross-network “engagement rate” without showing its denominator and provider definition. X impressions, Threads views, Instagram reach, YouTube views, and TikTok video views are not interchangeable. Canonical families enable navigation and rough comparison; provider-native metrics remain the authoritative detail.

Recommended collection windows after publication: approximately 15 minutes where supported, 1 hour, 6 hours, 24 hours, 72 hours, 7 days, and 30 days, with provider-specific adjustments and retention limits. Stop polling when the marginal value is low or the provider’s retention window closes.

UTM generation should be deterministic and editable: source=provider, medium=social, campaign=campaign slug, content=variant/intention identifier. Use canonical article URLs. A first-party short-link/click redirect is optional and off by default; if enabled, document retention, avoid fingerprinting, honor consent rules, and permit direct-link mode.

## Threat model and secure defaults

| Threat                        | Primary controls                                                                                              | Failure signal                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Token theft from DB/backups   | Application AEAD, external master key, encrypted backups, least-privilege DB roles                            | Decrypt failures, unusual token use, secret scan finding |
| OAuth callback/CSRF attack    | Exact redirect allowlist, high-entropy state, PKCE, short TTL, single-use transaction, nonce where applicable | State mismatch, replay, redirect mismatch                |
| Redirect manipulation         | Provider-specific fixed redirect URIs; never accept arbitrary callback target                                 | Callback route/path mismatch                             |
| SSRF via media                | HTTPS allowlist policy, DNS/IP revalidation, redirect/byte/time caps, blocked internal ranges                 | Blocked resolution or redirect                           |
| Malicious upload              | Signature/MIME validation, decode sandbox, resource limits, malware hook, private storage                     | Decode failure, scanner alert, limit breach              |
| Cross-tenant leakage          | Tenant key on every row, scoped repositories, composite unique constraints, authorization tests               | Tenant mismatch assertion/audit alert                    |
| Tokens in logs/support        | Structured redaction at logger and HTTP client, sanitized attempt payloads                                    | Secret scanner or redaction test failure                 |
| Compromised editor            | Least privilege, mandatory approvals, step-up auth for bulk/high-impact actions, pacing limits                | Anomalous volume, new-device bulk schedule               |
| Former employee access        | Immediate grant/session revocation, scheduled-intent review, provider-role rotation                           | Actor disabled but intent remains pending                |
| Quota exhaustion              | Per-provider/channel token buckets, backpressure, cost ceilings, visible reset                                | 429 rate, spend threshold, queue growth                  |
| Duplicate publication         | Immutable intent, unique accepted result, provider idempotency where available, unknown-state reconciliation  | Same fingerprint/target/window or ambiguous timeout      |
| Provider suspension/rejection | Anti-spam pacing, native variants, policy errors surfaced, circuit breaker                                    | Rejection spike, account state change                    |
| Webhook forgery/replay        | Signature verification, raw-body verification, timestamp tolerance, event-ID dedupe                           | Invalid signature or duplicate event                     |

Secure self-hosted defaults should favor understandable operation: one master secret supplied at install, no token display, no automatic sensitive-content publishing, conservative retry limits, no arbitrary remote media fetch, and a clear backup/restore warning that token ciphertext is useless without the encryption key.

## Failure-handling and support playbook

### User-facing error shape

Every error should answer:

- What happened?
- Which account and intended post were affected?
- Did the platform definitely reject it, or is the remote outcome unknown?
- Will Renegade retry automatically?
- Does the user need to edit, reconnect, wait, or reconcile?
- Is the article itself still published normally?

### Operator procedures

**Token expired/revoked:** mark the connection `needs_reconnection`, stop new claims for its channels, preserve schedules, notify authorized managers, and require reconnection. Revalidate scopes and remote channel identity before resuming.

**Rate limit:** record provider headers, apply a provider/channel backoff with jitter, preserve ordering when required, and show the reset estimate. Do not let one channel block other providers.

**Media rejected:** retain the exact rendition recipe and sanitized provider reason. Offer a new compatible rendition or manual handoff; do not repeatedly re-upload the same invalid asset.

**Unknown remote state:** block automatic retry, attempt adapter reconciliation, show recent candidate posts if policy/API permits, and let an authorized operator mark published-with-ID, mark failed-and-retry, or cancel.

**Provider outage:** open a provider circuit after a threshold, continue article workflows, delay affected jobs, display a connection/provider banner, and close the circuit through a bounded probe.

**Dead letter:** require an operator action, preserve every attempt, and make replay create a new attempt against the same immutable intent.

**Compromised account:** disable the connection immediately, cancel unclaimed intents, preserve forensic audit data, revoke remotely, rotate provider app secrets if required, and review all recently published results.

## Phased rollout with acceptance gates

### Phase 0: freeze contracts and prove manual distribution

Deliver capability states, provider-application setup modes, distribution packages, deterministic drafts, per-account variants, validations, approval hashes, schedules, manual copy/download/open handoff, and audit events.

**Acceptance gate:** publish a real Renegade Party article, produce native drafts for all target networks, approve/schedule them, and complete each through manual handoff without losing the source relationship or audit trail.

### Phase 1A: first real adapters and durable worker

Implement Bluesky and Mastodon, token storage, dedicated Payload worker, idempotent intents, retries, unknown-state reconciliation, remote URLs, and connection diagnostics.

**Acceptance gate:** schedule the same article variant to one Bluesky and one Mastodon account, kill/restart the worker during execution, and finish with exactly one verified remote post per intent.

### Phase 1B: commercially useful Meta distribution

Complete Meta application configuration/review and add Threads, Facebook Pages, and Instagram professional accounts. Add image crops, carousels where justified, container polling, long-lived token refresh, and publishing-limit visibility.

**Acceptance gate:** a normal site owner can connect Meta once, select eligible Page/Instagram/Threads destinations, understand unavailable formats, approve variants, and receive verified results without viewing tokens or developer terminology.

### Phase 1C: optional X provider pack

Add X OAuth 2.0 PKCE, offline refresh, text/media/thread support, rate/cost diagnostics, and metrics. Keep the provider independently installable/disableable because commercial terms are volatile.

**Acceptance gate:** an administrator can set a spend/usage ceiling, and Renegade fails closed with manual handoff when access is unavailable.

### Phase 2: richer publishing, teams, and analytics

Add LinkedIn after access approval, YouTube upload/scheduling, approval inbox, media rendition management, analytics snapshots, privacy-conscious UTMs/click tracking, webhooks, and expanded observability.

**Acceptance gate:** a team author prepares, an editor approves, a social manager schedules, and an analyst sees provider-native metrics with definitions and a complete audit chain.

### Phase 3: campaigns and high-friction media networks

Add TikTok upload-to-draft and audited Direct Post, campaign sequences, evergreen reuse safeguards, pacing, optimization suggestions, and a mature plugin SDK.

**Acceptance gate:** campaigns cannot bypass channel permissions, sensitivity policies, pacing, or per-intent approval; TikTok direct publication remains impossible unless the installed app is actually audited and authorized.

## Bounded task-file index

1. `social-01-contracts.md`: provider contract, capability vocabulary, domain states, error taxonomy, and fixtures.
2. `social-02-domain-schema.md`: Payload collections, migrations, tenant constraints, lifecycle guards, and audit hooks.
3. `social-03-manual-distribution.md`: distribution package, deterministic drafts, editing, validation, and manual handoff.
4. `social-04-secret-vault.md`: token encryption, key versions, redaction, rotation command, and backup documentation.
5. `social-05-oauth-lifecycle.md`: transaction store, PKCE/state/callback flow, channel discovery, disconnect/revoke.
6. `social-06-publication-worker.md`: schedules, immutable intents, Payload Jobs, leases, retries, watchdogs, and dead letters.
7. `social-07-bluesky-adapter.md`: OAuth/PDS handling, rich text, media, threads, reconciliation, and tests.
8. `social-08-mastodon-adapter.md`: instance registration, dynamic capabilities, idempotency, scheduling behavior, and tests.
9. `social-09-approval-policy.md`: roles/grants, content hashes, sensitive-content rules, offboarding, and step-up actions.
10. `social-10-meta-adapters.md`: shared Meta auth foundation plus Threads, Pages, and Instagram channel adapters.
11. `social-11-x-adapter.md`: X authentication, posting/media, pricing/quota guardrails, metrics, and graceful disablement.
12. `social-12-media-pipeline.md`: renditions, safe URL ingestion, image transforms, object storage, and cleanup.
13. `social-13-linkedin-youtube.md`: reviewed LinkedIn access and YouTube resumable upload/schedule/process lifecycle.
14. `social-14-analytics-observability.md`: raw/canonical metrics, polling, dashboards, alerts, and support bundles.
15. `social-15-campaigns-tiktok-sdk.md`: campaigns, TikTok gated flows, provider SDK/versioning, export/import, and launch hardening.

Each task file should name exact files in scope, fixtures, provider mocks, verification commands, rollback boundaries, non-goals, and a demo that exercises a user-visible capability.

## What not to build first

- Do not automate Facebook personal profiles or any network through headless-browser posting.
- Do not build all nine adapters before proving one complete lifecycle.
- Do not add Redis/BullMQ merely for delayed jobs when Payload/PostgreSQL already satisfy the first scale target.
- Do not self-host Temporal for a bounded publication workflow on the initial VPS.
- Do not promise pixel-perfect feed previews.
- Do not make AI a prerequisite for usable drafts.
- Do not auto-publish AI-generated political, civic, medical, financial, or legal copy without human approval.
- Do not flatten provider metrics into a context-free universal engagement score.
- Do not build social listening, unified inbox, ad buying, or comment moderation into the publishing MVP.
- Do not create a full video-transcoding farm before YouTube/TikTok/Reels requirements and volume are real.
- Do not retry ambiguous remote side effects automatically.
- Do not put provider tokens in Payload job inputs, browser state, logs, analytics, exports, or support bundles.

## Limitations, uncertainty, and change management

Platform APIs, app-review policies, quotas, permissions, metrics, and commercial terms change faster than Renegade releases. This report is a verified snapshot as of August 10, 2026, not a permanent capability promise.

Each adapter therefore needs:

- a versioned capability schema;
- documentation URLs and `verifiedAt` metadata;
- a provider changelog review checklist;
- contract tests against recorded fixtures and an opt-in sandbox/test account;
- feature flags for risky or reviewed capabilities;
- an administrator-visible “last verified” date;
- a kill switch that changes automatic publication to manual handoff without breaking article publishing;
- migration logic when a provider retires fields, versions, or scopes.

Meta documentation surfaces can expose inconsistent or legacy publishing-limit values. Runtime limit endpoints and actual API responses must win over hard-coded documentation constants. LinkedIn API products and permissions depend on approval and use case. X commercial access can change independently of endpoint capability. Federated Mastodon behavior depends on each instance. TikTok direct-post visibility depends on audit status. These are architectural facts, not edge cases.

## Open decisions before implementation

The following decisions should be resolved in `social-01-contracts.md`; none should block the manual-distribution slice:

1. Will provider adapters live in the main repository under a stable package boundary, or in separately versioned packages loaded from an allowlisted registry?
2. Which providers will be supported only through site-owned developer applications in v1, and is a managed broker explicitly deferred?
3. Will one Renegade installation support multiple organizations immediately, or only preserve tenant keys and constraints for a later multi-tenant mode?
4. What maximum image workload can the initial VPS process without harming public-page latency, and should transformations run on the same host or a home/worker node?
5. Which sensitive-content taxonomy will trigger mandatory approval, and can site owners strengthen but not weaken certain safety defaults?
6. How long should sanitized provider responses, audit events, raw metric snapshots, and disconnected-account metadata be retained by default?
7. What measured queue lag, publication volume, or worker count would justify moving from Payload Jobs to pg-boss or another queue?
8. Which provider sandbox/test accounts can be maintained for release-gating contract tests without violating platform rules?

## Recommended immediate next task

Start `social-01-contracts.md` and `social-02-domain-schema.md` together as the standards-freeze milestone, but implement no live OAuth yet. The first executable vertical slice should then be `social-03-manual-distribution.md`: one real Renegade Party article revision becomes independently editable X, Threads, Facebook, Instagram, LinkedIn, Bluesky, Mastodon, YouTube, and TikTok drafts; validation and approval create immutable publication intents; every destination can be completed through a truthful manual handoff.

That slice proves the product experience and the canonical contracts before provider approval, tokens, queues, media uploads, or API volatility can distort the design.

## Official source inventory

### Cross-cutting architecture and security

- [RFC 9700: OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/info/rfc9700/)
- [Payload CMS Jobs Queue](https://payloadcms.com/docs/jobs-queue/overview)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)

### Platform documentation

- [X API: Create Posts](https://docs.x.com/x-api/posts/create-post)
- [X OAuth 2.0 with PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)
- [X API rate limits](https://docs.x.com/x-api/fundamentals/rate-limits)
- [X API metrics](https://docs.x.com/x-api/fundamentals/metrics)
- [Threads API](https://developers.facebook.com/documentation/threads)
- [Threads posts](https://developers.facebook.com/documentation/threads/posts)
- [Threads long-lived tokens](https://developers.facebook.com/documentation/threads/get-started/long-lived-tokens)
- [Facebook Pages API](https://developers.facebook.com/documentation/pages-api)
- [Meta permissions](https://developers.facebook.com/docs/permissions/)
- [Instagram content publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing)
- [Instagram App Review](https://developers.facebook.com/documentation/instagram-platform/app-review)
- [LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-07)
- [LinkedIn API access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)
- [Bluesky posts](https://docs.bsky.app/docs/advanced-guides/posts)
- [Bluesky OAuth client](https://docs.bsky.app/docs/advanced-guides/oauth-client)
- [Mastodon statuses API](https://docs.joinmastodon.org/methods/statuses/)
- [Mastodon instance capabilities](https://docs.joinmastodon.org/entities/Instance/)
- [YouTube videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert)
- [YouTube Video resource and scheduling](https://developers.google.com/youtube/v3/docs/videos)
- [TikTok Direct Post](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
- [TikTok post status](https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status)
