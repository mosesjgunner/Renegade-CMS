declare const brand: unique symbol

export type EntityID<Kind extends string> = string & { readonly [brand]: Kind }
export type TenantID = EntityID<'tenant'>
export type SiteID = EntityID<'site'>
export type BrandID = EntityID<'brand'>
export type ActorID = EntityID<'actor'>
export type JobID = EntityID<'job'>
export type MemberID = EntityID<'member'>
export type LinkedIdentityID = EntityID<'linked-identity'>
export type ProfileID = EntityID<'profile'>
export type SpaceID = EntityID<'space'>
export type RelationshipID = EntityID<'relationship'>
export type AlbumID = EntityID<'album'>
export type ConversationID = EntityID<'conversation'>
export type MessageID = EntityID<'message'>
export type CalendarEntryID = EntityID<'calendar-entry'>
export type EventID = EntityID<'event'>
export type TimelineID = EntityID<'timeline'>
export type TimelineMembershipID = EntityID<'timeline-membership'>
export type CampaignID = EntityID<'campaign'>
export type CartID = EntityID<'cart'>
export type PaymentIntentID = EntityID<'payment-intent'>
export type OrderID = EntityID<'order'>
export type ProviderAccountID = EntityID<'provider-account'>
export type MerchantConnectionID = EntityID<'merchant-connection'>

export type Iso8601Instant = string
export type IanaTimeZone = string
export type SemVer = string
export type SemVerRange = string

export type SEOFields = {
  title: string | null
  description: string | null
  canonicalURL: string | null
  imageAlt: string | null
  keywords: readonly string[]
  focusKeyphrase: string | null
  noIndex: boolean
}

export type StructuredDataSource = {
  mode: 'none' | 'manual' | 'inherit-source' | 'event-derived' | 'timeline-derived'
  primaryType: string | null
  sourceCollection: 'content' | 'events' | 'timelines' | 'sources' | 'calendar-entries' | null
  sourceIdentifier: string | null
  manualPayload: Record<string, unknown> | null
  version: number
}

export type KnowledgeGraphProjectionBoundary = {
  status: 'disabled' | 'pending' | 'projected' | 'failed'
  nodeKey: string | null
  canonicalStore: 'postgresql'
  projector: 'neo4j-optional' | 'none'
  exportedAt: Iso8601Instant | null
}

export type ImportExportHooks = {
  importSourceSystem: string | null
  importSourceIdentifier: string | null
  importSourceChecksum: string | null
  exportFormatVersion: number
  exportOwnership: Record<string, unknown> | null
}

export type PublicRenderingHooks = {
  strategy: 'default' | 'event-page' | 'event-card-list' | 'timeline-page'
  variant: string | null
  context: Record<string, unknown> | null
}

export type TimelinePresentationHooks = {
  eventCardVariant: string | null
  eventListVariant: string | null
  timelineEmbedVariant: string | null
  timelineBlockVariant: string | null
}

export type ScopedOwnership = {
  tenantId: TenantID
  siteId: SiteID
  brandId: BrandID | null
}

export type AuditMetadata = {
  createdAt: Iso8601Instant
  createdBy: ActorID | null
  updatedAt: Iso8601Instant
  updatedBy: ActorID | null
  correlationId: string
}

export type SoftDeletion = {
  deletedAt: Iso8601Instant | null
  deletedBy: ActorID | null
}

export type ProviderConnectionIdentity = ScopedOwnership & {
  installationId: EntityID<'provider-installation'>
  providerKey: string
  externalAccountKey: string
}

export type Capability = {
  key: `${string}.${string}`
  support: 'supported' | 'unsupported' | 'unknown' | 'restricted'
  observedAt: Iso8601Instant
}

export type BackgroundJobIdentity = ScopedOwnership & {
  id: JobID
  kind: `${string}.${string}`
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  attempt: number
  idempotencyKey: string | null
}

export type DataClassification = 'public' | 'member' | 'staff' | 'secret' | 'restricted'
export type FoundationLifecycle = 'draft' | 'active' | 'archived'

export type Member = ScopedOwnership &
  AuditMetadata &
  SoftDeletion & {
    id: MemberID
    status: 'active' | 'disabled' | 'archived'
    disabledAt: Iso8601Instant | null
    archivedAt: Iso8601Instant | null
  }

export type LinkedIdentity = ScopedOwnership &
  AuditMetadata & {
    id: LinkedIdentityID
    memberId: MemberID
    kind: 'passkey' | 'oauth' | 'social' | 'wallet' | 'email-magic-link'
    providerKey: string
    externalSubject: string
    verifiedAt: Iso8601Instant | null
    revokedAt: Iso8601Instant | null
    expiresAt: Iso8601Instant | null
  }

export type WalletConnectionProvider = {
  key: string
  transportKind: 'browser-extension' | 'mobile' | 'hardware' | 'embedded' | 'other'
  capabilityKeys: readonly Capability['key'][]
  isReplaceableClientTransport: true
}

export type CryptographicAccount = ScopedOwnership &
  AuditMetadata & {
    id: EntityID<'cryptographic-account'>
    memberId: MemberID
    accountIdentifier: string
    chainNamespace: string
    chainReference: string
    normalizedAddressOrPublicKey: string
    walletType: string
    proof: {
      verifiedAt: Iso8601Instant
      nonceId: string
      signatureAlgorithm: string
      signatureDigest: string
    }
    revokedAt: Iso8601Instant | null
  }

export type Profile = ScopedOwnership &
  AuditMetadata &
  SoftDeletion & {
    id: ProfileID
    memberId: MemberID
    visibility: 'public' | 'members' | 'private'
  }

export type Space = ScopedOwnership &
  AuditMetadata &
  SoftDeletion & {
    id: SpaceID
    ownerMemberId: MemberID
    profileId: ProfileID | null
    lifecycle: FoundationLifecycle
  }

export type SpaceCapabilityGrant = ScopedOwnership &
  AuditMetadata & {
    id: EntityID<'space-capability-grant'>
    spaceId: SpaceID
    granteeMemberId: MemberID | null
    granteeProviderAccountId: ProviderAccountID | null
    capabilityKey: Capability['key']
    status: 'active' | 'revoked' | 'expired'
    expiresAt: Iso8601Instant | null
    revokedAt: Iso8601Instant | null
  }

export type Relationship = ScopedOwnership &
  AuditMetadata &
  SoftDeletion & {
    id: RelationshipID
    subjectMemberId: MemberID
    objectMemberId: MemberID
    kind: string
    status: 'pending' | 'active' | 'blocked' | 'archived'
  }

export type AlbumPortfolio = ScopedOwnership &
  AuditMetadata &
  SoftDeletion & {
    id: AlbumID
    ownerMemberId: MemberID
    spaceId: SpaceID | null
    kind: 'album' | 'portfolio'
    visibility: 'public' | 'members' | 'private'
    lifecycle: FoundationLifecycle
    retentionPolicy: RetentionPolicy | null
  }

export type Conversation = ScopedOwnership &
  AuditMetadata &
  SoftDeletion & {
    id: ConversationID
    ownerMemberId: MemberID
    kind: 'direct' | 'group' | 'support' | 'other'
    lifecycle: 'active' | 'archived' | 'closed'
    retentionPolicy: RetentionPolicy | null
  }

export type ConversationParticipant = ScopedOwnership &
  AuditMetadata & {
    id: EntityID<'conversation-participant'>
    conversationId: ConversationID
    memberId: MemberID
    role: 'owner' | 'member' | 'moderator'
    joinedAt: Iso8601Instant
    leftAt: Iso8601Instant | null
    lastReadAt: Iso8601Instant | null
  }

export type Message = ScopedOwnership &
  AuditMetadata &
  SoftDeletion & {
    id: MessageID
    conversationId: ConversationID
    senderMemberId: MemberID
    visibility: 'participants' | 'moderators' | 'private'
    retentionPolicy: RetentionPolicy | null
    encryptedEnvelope: EncryptedMessageEnvelope | null
  }

export type CalendarEntry = ScopedOwnership &
  AuditMetadata &
  SoftDeletion & {
    id: CalendarEntryID
    ownerMemberId: MemberID
    title: string
    visibility: 'public' | 'members' | 'private'
    status: 'draft' | 'scheduled' | 'in-progress' | 'completed' | 'cancelled' | 'archived'
    startsAt: Iso8601Instant | null
    endsAt: Iso8601Instant | null
    timeZone: IanaTimeZone
    reference: CalendarReference | null
    participantMemberIds: readonly MemberID[]
    assigneeMemberIds: readonly MemberID[]
    recurrence: RecurrencePolicy
    version: number
    conflictReferences: readonly string[]
    jobIds: readonly JobID[]
  }

export type CalendarReference = {
  kind:
    | 'publication'
    | 'campaign'
    | 'event'
    | 'social-post'
    | 'newsletter'
    | 'livestream'
    | 'launch'
    | 'task'
    | 'external-calendar-object'
  id: string
  providerKey: string | null
}

export type RecurrencePolicy = {
  kind: 'none' | 'rrule' | 'provider-managed'
  rule: string | null
  versionPolicy: 'series-versioned' | 'occurrence-versioned' | 'provider-authoritative'
}

export type Event = ScopedOwnership &
  AuditMetadata &
  SoftDeletion & {
    id: EventID
    ownerMemberId: MemberID | null
    calendarEntryId: CalendarEntryID | null
    title: string
    summary: string | null
    visibility: 'public' | 'members' | 'private'
    status: 'draft' | 'scheduled' | 'published' | 'cancelled' | 'archived'
    allDay: boolean
    startsAt: Iso8601Instant
    endsAt: Iso8601Instant | null
    timeZone: IanaTimeZone
    attendanceMode: 'in-person' | 'virtual' | 'hybrid'
    seo: SEOFields
    structuredDataSource: StructuredDataSource
    knowledgeGraphProjection: KnowledgeGraphProjectionBoundary
    importExportHooks: ImportExportHooks
    publicRendering: PublicRenderingHooks
    retentionPolicy: RetentionPolicy | null
  }

export type Timeline = ScopedOwnership &
  AuditMetadata &
  SoftDeletion & {
    id: TimelineID
    ownerMemberId: MemberID | null
    title: string
    summary: string | null
    visibility: 'public' | 'members' | 'private'
    status: 'draft' | 'published' | 'archived'
    orderingMode: 'chronological' | 'manual'
    seo: SEOFields
    structuredDataSource: StructuredDataSource
    knowledgeGraphProjection: KnowledgeGraphProjectionBoundary
    importExportHooks: ImportExportHooks
    publicRendering: PublicRenderingHooks
    presentation: TimelinePresentationHooks
    retentionPolicy: RetentionPolicy | null
  }

export type TimelineMembership = ScopedOwnership &
  AuditMetadata & {
    id: TimelineMembershipID
    timelineId: TimelineID
    eventId: EventID
    position: number
    displayTitle: string | null
    displaySummary: string | null
    eraLabel: string | null
    displayStartsAt: Iso8601Instant | null
    displayEndsAt: Iso8601Instant | null
    renderVariant: string | null
  }

export type Campaign = ScopedOwnership &
  AuditMetadata &
  SoftDeletion & {
    id: CampaignID
    ownerMemberId: MemberID
    spaceId: SpaceID | null
    lifecycle: FoundationLifecycle
    startsAt: Iso8601Instant | null
    endsAt: Iso8601Instant | null
  }

export type Cart = ScopedOwnership &
  AuditMetadata &
  SoftDeletion & {
    id: CartID
    ownerMemberId: MemberID | null
    merchantConnectionId: MerchantConnectionID
    currency: string
    lifecycle: 'active' | 'converted' | 'abandoned' | 'expired'
  }

export type MerchantConnection = ScopedOwnership &
  AuditMetadata & {
    id: MerchantConnectionID
    providerAccountId: ProviderAccountID
    merchantExternalKey: string
    status: 'pending' | 'active' | 'restricted' | 'disabled'
  }

export type PaymentMethodCapability = ScopedOwnership & {
  id: EntityID<'payment-method-capability'>
  providerKey: string
  railKey: string
  merchantConnectionId: MerchantConnectionID
  buyerGeographies: readonly string[]
  merchantGeographies: readonly string[]
  presentmentCurrencies: readonly string[]
  settlementCurrencies: readonly string[]
  minimumAmountMinor: string | null
  maximumAmountMinor: string | null
  supportsOneTime: boolean
  supportsRecurring: boolean
  supportsRefunds: boolean
  supportsDisputes: boolean
  flow: 'synchronous' | 'asynchronous'
  requiredExperience: 'none' | 'redirect' | 'qr' | 'sdk' | 'hosted-ui'
  availability: 'available' | 'unavailable' | 'restricted' | 'unknown'
  verifiedAt: Iso8601Instant | null
  verificationProvenance: string
}

export type PaymentIntent = ScopedOwnership &
  AuditMetadata &
  SoftDeletion & {
    id: PaymentIntentID
    cartId: CartID | null
    orderId: OrderID | null
    merchantConnectionId: MerchantConnectionID
    paymentMethodCapabilityId: EntityID<'payment-method-capability'>
    amountMinor: string
    currency: string
    lifecycle: 'created' | 'requires-action' | 'processing' | 'succeeded' | 'failed' | 'cancelled'
    providerReference: string | null
  }

export type Order = ScopedOwnership &
  AuditMetadata &
  SoftDeletion & {
    id: OrderID
    buyerMemberId: MemberID | null
    merchantConnectionId: MerchantConnectionID
    paymentIntentIds: readonly PaymentIntentID[]
    currency: string
    totalAmountMinor: string
    lifecycle: 'draft' | 'placed' | 'paid' | 'fulfilling' | 'fulfilled' | 'cancelled' | 'refunded'
  }

export type ProviderAccount = ScopedOwnership &
  AuditMetadata & {
    id: ProviderAccountID
    providerKey: string
    externalAccountKey: string
    installationId: EntityID<'provider-installation'>
    status: 'active' | 'restricted' | 'revoked' | 'archived'
    capabilitySnapshot: readonly Capability[]
  }

export type RetentionPolicy = {
  mode:
    | 'permanent'
    | 'expire-at'
    | 'burn-after-first-read'
    | 'burn-after-all-recipient-read'
    | 'burn-after-view-count'
    | 'manual-burn'
    | 'archive'
    | 'tombstone'
  expiresAt: Iso8601Instant | null
  burnAfterViewCount: number | null
  purgeAt: Iso8601Instant | null
  hold: 'none' | 'legal' | 'moderation'
  removeFromCaches: boolean
  removeFromSearch: boolean
  removeFromFeeds: boolean
  backupRetentionBoundary: string
  cryptographicErasure: 'none' | 'eligible' | 'requested' | 'completed'
}

export type EncryptedMessageEnvelope = {
  version: number
  algorithmSuite: string
  senderKeyFingerprint: string
  recipientKeyFingerprints: readonly string[]
  ciphertext: string
  nonce: string
  senderWrappedContentKey: string | null
  recipientWrappedContentKeys: readonly WrappedContentKey[]
  signature: string | null
  authenticatedData: string | null
  keyRotation: {
    senderKeyVersion: number
    revokedKeyFingerprints: readonly string[]
  }
  encryptedAttachments: readonly EncryptedAttachmentReference[]
  recovery: {
    isSupported: boolean
    exportFormatVersion: number
    privateRecoveryKeyBoundary: 'member-controlled' | 'not-available'
  }
}

export type WrappedContentKey = {
  recipientMemberId: MemberID
  recipientKeyFingerprint: string
  wrappedKey: string
}

export type EncryptedAttachmentReference = {
  attachmentId: string
  encryptedFileKey: string
  nonce: string
}

export type ModuleManifest = {
  key: `${string}.${string}`
  version: SemVer
  compatibleCore: SemVerRange
  compatibleSchema: SemVerRange
  dependencies: readonly `${string}.${string}`[]
  conflicts: readonly `${string}.${string}`[]
  provides: readonly Capability['key'][]
  requires: readonly Capability['key'][]
  configurationSchemaVersion: number
  permissions: readonly string[]
  healthCheck: string
  failureMode: 'fail-closed' | 'fail-open' | 'degraded' | 'disabled'
  migrationOwner: string
  rollbackOwner: string
  backupExportOwner: string
  lifecycle: {
    disable: 'preserve-data' | 'archive-data'
    archive: 'retain-read-only' | 'export-then-remove'
    uninstall: 'refuse-with-live-data' | 'export-then-purge' | 'purge-with-confirmation'
    retentionChoice: 'module-owned' | 'shared-policy-required'
  }
}

export type ReleaseManifest = {
  releaseVersion: SemVer
  schemaVersion: SemVer
  compatibleModuleRange: SemVerRange
  compatibleThemeRange: SemVerRange
  migrationOwners: readonly string[]
  updateChannel: 'stable' | 'preview' | 'security'
  unknownDataPolicy: 'preserve' | 'refuse-import'
  downgradePolicy: 'refuse-unsafe-downgrade'
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function isCaipStyleIdentifier(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,31}:[a-z0-9][a-z0-9-]{0,31}(?::[A-Za-z0-9._~%-]+)?$/.test(value)
}
