import type { Payload } from 'payload'
import { executeDbQuery } from '../community/comment-composer'

/** Own contributions are exportable regardless of publication/moderation state.
 * Foreign conversation text follows the same active-membership/history boundary as the product.
 * Own sent messages remain exportable after leaving a group. Never export other members' contacts,
 * moderation evidence, delivery credentials, private object keys or read receipts.
 */
export async function exportCommunityData(payload: Payload, memberId: string) {
  const query = (statement: string) => executeDbQuery(payload, statement, [memberId])
  const [
    comments,
    commentRevisions,
    topics,
    posts,
    drafts,
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
    query(`SELECT c.id,t.site_id,t.canonical_content_id,c.thread_id,c.parent_id,c.status,c.body_raw,c.body_html,c.created_at,c.updated_at,c.deleted_at
      FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE c.author_id=$1 AND c.author_type='member' ORDER BY c.created_at,c.id`),
    query(`SELECT r.id,r.comment_id,r.previous_body_raw,r.created_at FROM comment_revisions r JOIN comments c ON c.id=r.comment_id
      WHERE c.author_id=$1 AND c.author_type='member' ORDER BY r.created_at,r.id`),
    query(
      `SELECT id,site_id,space_id,title,created_at,updated_at FROM forum_topics WHERE author_id=$1 ORDER BY created_at,id`,
    ),
    query(`SELECT p.id,t.site_id,p.topic_id,p.sequence_number,p.reply_to_post_id,p.body_raw,p.body_html,p.created_at,p.updated_at
      FROM forum_posts p JOIN forum_topics t ON t.id=p.topic_id WHERE p.author_id=$1 ORDER BY p.created_at,p.id`),
    query(
      `SELECT id,site_id,space_id,topic_id,title,body_raw,reply_to_post_id,created_at,updated_at FROM forum_drafts WHERE author_id=$1 ORDER BY created_at,id`,
    ),
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
      `SELECT r.comment_id,t.site_id,r.reaction_code,r.created_at FROM comment_reactions r JOIN comments c ON c.id=r.comment_id JOIN comment_threads t ON t.id=c.thread_id WHERE r.member_id=$1 ORDER BY r.created_at,r.comment_id`,
    ),
    query(
      `SELECT s.thread_id,t.site_id,s.created_at FROM comment_thread_subscriptions s JOIN comment_threads t ON t.id=s.thread_id WHERE s.member_id=$1 ORDER BY s.created_at,s.thread_id`,
    ),
    query(
      `SELECT id,site_id,target_type,target_id,emoji,created_at,updated_at FROM community_reactions WHERE member_id=$1 ORDER BY created_at,id`,
    ),
  ])
  return {
    contributions: {
      comments,
      commentRevisions,
      topics,
      posts,
      drafts,
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
