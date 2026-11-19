import type { Payload } from 'payload'
import { executeDbQuery } from '../community/db-query'

/** Own contributions are exportable regardless of publication/moderation state.
 * Foreign conversation text follows the same active-membership/history boundary as the product.
 * Own sent messages remain exportable after leaving a group. Never export other members' contacts,
 * moderation evidence, delivery credentials, private object keys or read receipts.
 *
 * RC2-DEBT-20: comments, revisions and reactions read from the live
 * discussion store (the v1 comments/comment_threads/comment_reactions
 * tables retired in the fold; edit history lives in the community
 * audit log as comment.edited.v1). The legacy forum stores
 * (forum_topics/forum_posts/forum_drafts) retired with the comm-04
 * engine — no live path ever wrote them — so their export sections
 * are empty by construction and kept only for shape stability.
 */
export async function exportCommunityData(payload: Payload, memberId: string) {
  const query = (statement: string) => executeDbQuery(payload, statement, [memberId])
  const empty: never[] = []
  const [
    comments,
    commentRevisions,
    conversations,
    messages,
    legacyConversations,
    legacyMessages,
    attachments,
    notificationPreferences,
    reactions,
    threadSubscriptions,
    legacyReactions,
  ] = await Promise.all([
    query(`SELECT p.id,d.site_id,(SELECT rels.content_id FROM discussions_rels rels WHERE rels.parent_id=d.id AND rels.path='attachedTo') AS canonical_content_id,p.discussion_id AS thread_id,p.parent_id,p.status,p.body AS body_raw,p.body AS body_html,p.created_at,p.updated_at,NULL AS deleted_at
      FROM discussion_posts p JOIN discussions d ON d.id=p.discussion_id WHERE p.author_member_id=$1 ORDER BY p.created_at,p.id`),
    query(`SELECT a.id,(a.event_payload->>'comment_id') AS comment_id,(a.event_payload->>'previous_body') AS previous_body_raw,a.created_at FROM community_audit_log a JOIN discussion_posts p ON p.id=(a.event_payload->>'comment_id')::uuid
      WHERE a.event_type='comment.edited.v1' AND p.author_member_id=$1 ORDER BY a.created_at,a.id`),
    query(`SELECT c.id,c.site_id,c.kind,c.title,c.status,c.request_state,c.created_at,c.updated_at,cm.joined_at,cm.left_at,cm.visible_from_sequence
      FROM conversations c JOIN conversation_memberships cm ON cm.conversation_id=c.id WHERE cm.member_id=$1 ORDER BY c.created_at,c.id`),
    query(`SELECT m.id,c.site_id,m.conversation_id,m.sender_id,m.sequence_number,m.body_html,m.kind,m.system_event,m.created_at
      FROM messages m JOIN conversations c ON c.id=m.conversation_id
      WHERE m.sender_id=$1 OR EXISTS (SELECT 1 FROM conversation_memberships cm WHERE cm.conversation_id=m.conversation_id
        AND cm.member_id=$1 AND cm.left_at IS NULL AND m.sequence_number>=cm.visible_from_sequence) ORDER BY m.created_at,m.id`),
    query(`SELECT c.id,c.site_id,c.title,c.status,c.created_at,c.updated_at FROM community_conversations c
      WHERE EXISTS (SELECT 1 FROM community_conversation_participants cp WHERE cp.conversation_id=c.id AND cp.member_id=$1) ORDER BY c.created_at,c.id`),
    query(`SELECT m.id,c.site_id,m.conversation_id,m.sender_id,m.body,m.created_at FROM community_messages m JOIN community_conversations c ON c.id=m.conversation_id
      WHERE m.sender_id=$1 OR EXISTS (SELECT 1 FROM community_conversation_participants cp WHERE cp.conversation_id=c.id AND cp.member_id=$1) ORDER BY m.created_at,m.id`),
    query(`SELECT a.id,a.site_id,m.conversation_id,a.message_id,a.original_filename,a.claimed_mime_type,a.byte_size,a.status,a.created_at
      FROM message_attachments a LEFT JOIN messages m ON m.id=a.message_id WHERE a.owner_id=$1 ORDER BY a.created_at,a.id`),
    query(
      `SELECT site_id,channel,kind,frequency,rules,updated_at FROM notification_preferences WHERE member_id=$1 ORDER BY site_id,channel,kind`,
    ),
    query(
      `SELECT target_id AS comment_id,site_id,emoji AS reaction_code,created_at FROM community_reactions WHERE member_id=$1 AND target_type='post' ORDER BY created_at,target_id`,
    ),
    query(
      `SELECT s.thread_id,d.site_id,s.created_at FROM comment_thread_subscriptions s JOIN discussions d ON d.id=s.thread_id WHERE s.member_id=$1 ORDER BY s.created_at,s.thread_id`,
    ),
    query(
      `SELECT id,site_id,target_type,target_id,emoji,created_at,updated_at FROM community_reactions WHERE member_id=$1 ORDER BY created_at,id`,
    ),
  ])
  return {
    contributions: {
      comments,
      commentRevisions,
      topics: empty,
      posts: empty,
      drafts: empty,
      reactions,
      threadSubscriptions,
      legacyReactions,
    },
    conversations: {
      canonical: conversations,
      messages,
      legacy: legacyConversations,
      legacyMessages,
    },
    attachments,
    notificationPreferences,
  }
}
