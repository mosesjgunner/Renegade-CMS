# Theater events

1. Create a theater in `/rooms` and select its audience and chat history policy. Open **Schedule theater event** in the room to set the title, local start time, source and optional RSVP. The event appears in the site command-center calendar and eligible viewers can download it as an iCalendar event.
2. For a live show, check camera, microphone and provider, then select **Start show**. MediaMTX recording starts with the show. The lobby advances when the source connects. Guests in public rooms can follow announcements and eligible signed-in members can submit questions. Room moderators use the room's existing moderation controls.
3. Select **End show** to stop the source and create a private replay draft. The host can preview completed recording parts. If the provider is still finalizing the recording, retry publication after it becomes available. Select **Publish replay to room audience** to release it under the current room access policy.

For a locally owned premiere, place a browser-compatible `premiere.mp4` in `ROOM_MEDIA_DIR/<site ID>/<room ID>/` before scheduling. Place optional English WebVTT captions in `event-captions.vtt`, a downloadable transcript in `event-transcript.vtt` and a matching audio-only track in `event-audio.aac`. Use the same caption and transcript filenames for live-show assets. The player seeks to the scheduled timeline when a viewer starts or resumes the premiere. Once the host ends a premiere, the file is withheld until replay publication.

An external watch party opens the provider's official player. Each viewer uses their own provider account or subscription when required. If the provider is unavailable or blocks playback, viewers can keep using the theater chat.

Schedule, announcement, live, end and replay notices are delivered inside the room through the current audience and chat history rules. Current event status and the latest announcement are also shown above the player.
