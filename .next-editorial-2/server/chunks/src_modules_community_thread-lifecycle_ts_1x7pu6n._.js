module.exports=[617090,e=>{"use strict";var t=e.i(713851);class r extends Error{status;code;details;constructor(e,t,r,d){super(e),this.status=t,this.code=r,this.details=d,this.name="CommentLifecycleError"}}async function d(e,d){if(!(d.actor.isStaff||d.actor.isModerator))throw new r("Staff permissions required to update thread lifecycle controls.",403,"STAFF_PERMISSION_REQUIRED");let a=(await (0,t.executeDbQuery)(e,`UPDATE comment_threads
     SET is_closed = COALESCE($3, is_closed),
         is_frozen = COALESCE($4, is_frozen),
         premoderation_enabled = COALESCE($5, premoderation_enabled),
         updated_at = now()
     WHERE id = $1 AND site_id = $2
     RETURNING id, site_id AS "siteId", canonical_content_id AS "canonicalContentId",
               content_type AS "contentType", is_closed AS "isClosed", is_frozen AS "isFrozen",
               premoderation_enabled AS "premoderationEnabled", created_at AS "createdAt",
               updated_at AS "updatedAt"`,[d.threadId,d.siteId,d.closed??null,d.frozen??null,d.premoderationEnabled??null]))[0];if(!a)throw new r("Comment thread not found.",404,"THREAD_NOT_FOUND");return a}async function a(e,d){let a=(await (0,t.executeDbQuery)(e,`SELECT id, site_id AS "siteId", canonical_content_id AS "canonicalContentId",
            content_type AS "contentType", is_closed AS "isClosed", is_frozen AS "isFrozen",
            premoderation_enabled AS "premoderationEnabled", created_at AS "createdAt",
            updated_at AS "updatedAt"
     FROM comment_threads
     WHERE id = $1 AND site_id = $2`,[d.threadId,d.siteId]))[0];if(!a)throw new r("Comment thread not found.",404,"THREAD_NOT_FOUND");return a}async function c(e,r){return await (0,t.executeDbQuery)(e,`INSERT INTO comment_thread_subscriptions (thread_id, member_id, created_at)
     VALUES ($1, $2, now())
     ON CONFLICT (thread_id, member_id) DO NOTHING`,[r.threadId,r.memberId]),{subscribed:!0,threadId:r.threadId,memberId:r.memberId}}async function n(e,r){return await (0,t.executeDbQuery)(e,`DELETE FROM comment_thread_subscriptions
     WHERE thread_id = $1 AND member_id = $2`,[r.threadId,r.memberId]),{subscribed:!1,threadId:r.threadId,memberId:r.memberId}}async function o(e,r){let d=await (0,t.executeDbQuery)(e,`SELECT EXISTS(
       SELECT 1 FROM comment_thread_subscriptions
       WHERE thread_id = $1 AND member_id = $2
     ) AS exists`,[r.threadId,r.memberId]);return!!d[0]?.exists}async function i(e,r){let d=Math.min(Math.max(0,r.maxDepth??5),5),a=(r.sort??"chronological").toLowerCase().replace(/\s+/g,"_"),c=[];try{c=await (0,t.executeDbQuery)(e,`SELECT c.id, c.thread_id, c.parent_id, c.root_id, c.author_id, c.author_type,
              c.status, c.depth, c.body_raw, c.body_html, c.created_at, c.updated_at, c.deleted_at,
              COALESCE(
                (SELECT jsonb_object_agg(crc.reaction_code, crc.reaction_count)
                 FROM comment_reaction_counters crc
                 WHERE crc.comment_id = c.id),
                '{}'::jsonb
              ) AS reactions,
              COALESCE(
                (SELECT SUM(crc.reaction_count)::integer
                 FROM comment_reaction_counters crc
                 WHERE crc.comment_id = c.id),
                0
              ) AS "reactionCount"
       FROM comments c
       WHERE c.thread_id = $1 AND c.depth <= $2
       ORDER BY c.created_at ASC`,[r.threadId,d])}catch{c=await (0,t.executeDbQuery)(e,`SELECT c.id, c.thread_id, c.parent_id, c.root_id, c.author_id, c.author_type,
              c.status, c.depth, c.body_raw, c.body_html, c.created_at, c.updated_at, c.deleted_at
       FROM comments c
       WHERE c.thread_id = $1 AND c.depth <= $2
       ORDER BY c.created_at ASC`,[r.threadId,d])}let n=r.includeNonPublic?c:c.filter(e=>"visible"===e.status),o=new Map,i=[];for(let e of n){let t={};if("string"==typeof e.reactions)try{t=JSON.parse(e.reactions)}catch{t={}}else e.reactions&&"object"==typeof e.reactions&&(t=e.reactions);let r={id:String(e.id),threadId:String(e.thread_id),parentId:e.parent_id?String(e.parent_id):null,rootId:e.root_id?String(e.root_id):null,authorId:String(e.author_id),authorType:String(e.author_type),status:String(e.status),depth:Number(e.depth),bodyRaw:String(e.body_raw),bodyHtml:String(e.body_html),reactionCount:Number(e.reactionCount??0),reactions:t,createdAt:new Date(e.created_at).toISOString(),updatedAt:new Date(e.updated_at).toISOString(),deletedAt:e.deleted_at?new Date(e.deleted_at).toISOString():null,children:[]};o.set(r.id,r)}for(let e of o.values())if(e.parentId&&o.has(e.parentId)){let t=o.get(e.parentId);t.depth<5&&t.children.push(e)}else e.parentId||i.push(e);let s=e=>{for(let t of(e.sort((e,t)=>new Date(e.createdAt).getTime()-new Date(t.createdAt).getTime()),e))t.children.length>0&&s(t.children)};for(let e of i)e.children.length>0&&s(e.children);return"reverse_chronological"===a?i.sort((e,t)=>new Date(t.createdAt).getTime()-new Date(e.createdAt).getTime()):"reaction_volume"===a?i.sort((e,t)=>{let r=t.reactionCount-e.reactionCount;return 0!==r?r:new Date(t.createdAt).getTime()-new Date(e.createdAt).getTime()}):i.sort((e,t)=>new Date(e.createdAt).getTime()-new Date(t.createdAt).getTime()),i}e.s(["CommentLifecycleError",0,r,"getThreadCommentsTree",0,i,"getThreadLifecycle",0,a,"isSubscribedToThread",0,o,"subscribeToThread",0,c,"unsubscribeFromThread",0,n,"updateThreadLifecycle",0,d])}];

//# sourceMappingURL=src_modules_community_thread-lifecycle_ts_1x7pu6n._.js.map