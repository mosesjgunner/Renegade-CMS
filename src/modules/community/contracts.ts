export type CommunityActor = {
  kind: 'member' | 'user' | 'anonymous'
  memberId?: string
  userId?: string
  role?: string
  isStaff: boolean
  isModerator: boolean
  status?: 'active' | 'disabled' | 'archived'
}

export type CommunityPolicyContext = {
  siteId: string
  actor: CommunityActor
  ipAddress?: string
  now?: Date
}

export type CommunityAction =
  | 'read'
  | 'create_thread'
  | 'comment'
  | 'reply'
  | 'react'
  | 'report'
  | 'moderate'
  | 'message'
  | 'delete'
  | 'edit'

export type CommunityPolicyDecision = {
  allowed: boolean
  reason?: string
  status?: number
  redacted?: boolean
}

export type ModerationState = 'clear' | 'review' | 'restricted' | 'removed'
export type VisibilityMode = 'public' | 'unlisted' | 'members' | 'friends' | 'private'
export type CommentsPolicy = 'open' | 'members' | 'closed'
export type DiscussionStatus = 'open' | 'locked' | 'archived'
export type PostStatus = 'draft' | 'published' | 'hidden' | 'removed'

export type AttachedTarget = {
  relationTo: 'content' | 'media-assets' | 'albums'
  value: string
}

export interface CommunityDiscussionRecord {
  id: string
  site: string
  publication?: string | null
  space?: string | null
  owner?: string | null
  kind: 'attached' | 'thread'
  title: string
  forum?: string | null
  attachedTo?: AttachedTarget | null
  canonicalPath: string
  status: DiscussionStatus
  visibility: VisibilityMode
  moderationState: ModerationState
  commentsPolicy: CommentsPolicy
  retentionMode?: string
  retentionExpiresAt?: string | null
  retentionHold?: string
  removeFromDiscovery?: boolean
  createdAt: string
  updatedAt: string
}

export interface CommunityPostRecord {
  id: string
  discussion: string
  authorMember?: string | null
  authorGuest?: string | null
  body: string
  parent?: string | null
  quote?: string | null
  displayOrder: number
  permalink: string
  paginationAnchor: string
  attachments?: string[]
  status: PostStatus
  visibility: VisibilityMode
  solution?: boolean
  helpful?: boolean
  moderationState: ModerationState
  tombstoneLabel?: string | null
  isTombstone?: boolean
  authorProfile?: {
    displayName: string
    handle: string
    avatarUrl?: string | null
  }
  reactions?: Record<string, number>
  viewerReactions?: string[]
  createdAt: string
  updatedAt: string
}

export interface CommunityReactionRecord {
  id: string
  siteId: string
  memberId: string
  targetType: 'post' | 'discussion' | 'content'
  targetId: string
  emoji: string
  createdAt: string
  updatedAt: string
}

export interface CommunityReportRecord {
  id: string
  siteId: string
  reporterId: string
  targetType: 'post' | 'discussion' | 'member'
  targetId: string
  reason: string
  details?: string | null
  status: 'pending' | 'resolved' | 'dismissed'
  resolution?: string | null
  resolvedBy?: string | null
  resolvedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface CommunityModerationActionRecord {
  id: string
  siteId: string
  actor: string
  targetType: 'post' | 'discussion' | 'member'
  targetId: string
  action: 'clear' | 'warn' | 'restrict' | 'remove' | 'suspend'
  reason: string
  details: Record<string, unknown>
  occurredAt: string
  createdAt: string
  updatedAt: string
}

export interface CommunityConversationRecord {
  id: string
  siteId: string
  title?: string | null
  status: 'active' | 'archived' | 'blocked'
  lastMessageAt: string
  participants: string[]
  createdAt: string
  updatedAt: string
}

export interface CommunityMessageRecord {
  id: string
  conversationId: string
  senderId: string
  body: string
  attachments: string[]
  readBy: string[]
  createdAt: string
  updatedAt: string
}

export interface CommunityPublicProfile {
  id: string
  memberId: string
  displayName: string
  handle: string
  bio?: string | null
  avatarUrl?: string | null
  coverUrl?: string | null
  visibility: VisibilityMode
  links?: unknown[]
  createdAt: string
}

export interface CreateThreadInput {
  siteId: string
  forumId: string
  authorMemberId: string
  title: string
  body: string
  attachments?: string[]
  visibility?: VisibilityMode
}

export interface AddCommentInput {
  siteId: string
  attachedToCollection: 'content' | 'media-assets' | 'albums'
  attachedToId: string
  canonicalPath: string
  title: string
  authorMemberId: string
  body: string
  parentPostId?: string
  attachments?: string[]
}

export interface ReplyPostInput {
  siteId: string
  discussionId: string
  authorMemberId: string
  body: string
  parentPostId?: string
  quotePostId?: string
  attachments?: string[]
}

export interface DirectMessageInput {
  siteId: string
  conversationId?: string
  senderMemberId: string
  recipientMemberId?: string
  body: string
  attachments?: string[]
}

export interface EditCommentInput {
  siteId: string
  commentId: string
  authorMemberId: string
  body: string
}

export interface DeleteCommentInput {
  siteId: string
  commentId: string
  actor: CommunityActor
  reason?: string
}
