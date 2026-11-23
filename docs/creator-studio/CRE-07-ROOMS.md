# Community Rooms and Theater

Open `/rooms` on the site's configured host. Site community managers and moderators can create site rooms. Group owners and admins can create rooms for their groups. Content and persistent discussion links must belong to the same site.

Public theaters allow anonymous viewing and chat reading. Posting requires an eligible member. Member rooms require current site standing. Paid rooms require the configured commerce grant. Invitation-only rooms use account-bound invitations issued and revoked by the room manager. Group, content, event, and podcast restrictions can narrow these audiences.

The chat participant limit counts signed-in members who have joined the conversation. A seat renews while the client is open and expires after 90 seconds without renewal. Attendee counts show active chat participants. Speaker approvals are recorded for hosts to act on.

## Playback storage

Set `ROOM_MEDIA_DIR` to an absolute directory on a private mount readable by Renegade. Keep it outside the web root, static mounts, and publicly served storage. For each theater, place `live.m3u8`, its dependencies, and optional `replay.mp4` in `ROOM_MEDIA_DIR/<site ID>/<room ID>/`. Playlists use relative filenames in that directory. Put the files in place atomically when producing live segments or replacing a playlist.

The token endpoint issues a room-scoped HTTP-only playback cookie. Every playlist, key, segment, and replay request also resolves the current site, session, and room policy. The same access policy applies to live playback and replay.

Podcast producers can bind an episode to a same-site room using the existing `bind-room` action. A member podcast binding additionally requires the show's current listen entitlement. [Podcast live operations](../podcast-studio/LIVE.md)
