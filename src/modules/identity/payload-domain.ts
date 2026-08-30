import { createUsersCollection } from '../../collections/Users'
import {
  EditorialAssignments,
  EditorialComments,
  EditorialDiscussions,
  TeamAuditEvents,
  TeamInvitations,
  TeamMemberships,
  WorkConversations,
  WorkMessages,
} from '../../collections/Collaboration'
import {
  Authors,
  Brands,
  IdentityAuditEvents,
  IdentityTokens,
  LinkedIdentities,
  MemberRecoveryCodes,
  Members,
  MemberSessions,
  Profiles,
  Publications,
  Relationships,
  Spaces,
} from '../../collections/Identity'
import type { AppConfig } from '../core/config'
import type { DomainDefinition } from '../core/payload-domains'

export function identityDomain(config: AppConfig): DomainDefinition {
  return {
    id: 'identity',
    collections: [
      createUsersCollection(config),
      Brands,
      Members,
      LinkedIdentities,
      MemberSessions,
      IdentityTokens,
      MemberRecoveryCodes,
      IdentityAuditEvents,
      Profiles,
      Spaces,
      Authors,
      Publications,
      Relationships,
      TeamMemberships,
      TeamInvitations,
      TeamAuditEvents,
      EditorialAssignments,
      EditorialDiscussions,
      EditorialComments,
      WorkConversations,
      WorkMessages,
    ],
  }
}
