# Research Prompt: Design a Maximalist Audio Publishing and Text-to-Speech Engine for Renegade CMS

## Project context

I am building **Renegade CMS**, a free, self-hosted publishing and personal-brand platform using **Next.js, React, Tailwind CSS, Payload CMS, and PostgreSQL**. It should be reusable by many publishers; Renegade Party is the first production site and first native theme, not a hard-coded product dependency.

The product principles are:

- human-controlled, AI-assisted;
- simple by default, powerful underneath;
- content and presentation remain separate;
- connect once, use everywhere;
- create once, distribute everywhere;
- self-hosting, portability, and provider choice are first-class;
- the platform remains useful without AI keys and becomes substantially more capable when providers are connected;
- publishers should rarely need another browser tab to run their publication or personal brand.

Conduct a deep, current-state technical research project, using primary sources and documentation current as of the research date, to design a **production-grade audio publishing engine** built directly into Renegade CMS.

This must be much more than a browser “read aloud” feature. The goal is to let a publisher turn any eligible article, essay, news post, research report, newsletter, book chapter, podcast script, or other text content into a durable audio edition, while also allowing the author or publisher to record and publish a human-read edition from the same CMS.

The system must support four edition types:

1. **Synthetic narration:** text-to-speech using a stock or licensed voice.
2. **Publisher voice narration:** text-to-speech using a verified clone or custom model of the publisher’s own voice.
3. **Human-read narration:** recorded by the author, publisher, staff member, or approved voice talent.
4. **Hybrid narration:** a human recording combined with generated corrections, intros, outros, sponsor segments, translated sections, or repaired passages, with transparent provenance.

The final design should treat all four as different production sources feeding one shared audio-edition, processing, review, storage, player, distribution, and analytics system.

## Core research question

What is the best maximalist but buildable architecture for adding automatic and human-recorded audio editions to a self-hosted Next.js and Payload CMS platform, while preserving quality, low latency, reasonable cost, provider portability, voice rights, accessibility, editorial control, and future extensibility?

Do not confuse “on demand” with generating a long-form file during every playback request. Explicitly compare:

- generate when an editor requests it;
- generate automatically when a revision enters a configured workflow state;
- lazy-generate on the first listener request and cache the result;
- real-time streaming synthesis without a stored master;
- pre-generated, versioned audio editions stored in object storage and delivered through a CDN.

Recommend the default and explain when the alternatives make sense. Analyze latency, failure recovery, API cost, cacheability, editorial review, version consistency, accessibility, and user experience.

## 1. Product experience and editorial workflow

Design the complete publisher experience inside Payload Admin and the public Next.js site.

Research and specify:

- a one-click **Create audio edition** action on eligible content;
- site-wide automation rules, such as automatically narrating all published articles or only selected sections, authors, languages, or content lengths;
- edition choice: synthetic, publisher-cloned, human-read, uploaded master, or hybrid;
- voice, language, accent, speaking rate, style, emotional intensity, and pronunciation controls;
- an editable narration-script view separate from the canonical article body;
- automatic removal or rewriting of material that should not be spoken, including navigation, citations, raw URLs, tables, code, image metadata, footnotes, embeds, disclosure boxes, advertisements, and repeated boilerplate;
- explicit controls for what happens to image captions, block quotes, citations, lists, headings, data tables, equations, code blocks, pull quotes, and footnotes;
- reusable pronunciation dictionaries for names, acronyms, organizations, foreign terms, URLs, and brand language;
- article-level pronunciation overrides and SSML or provider-neutral prosody controls;
- preview by sentence, paragraph, section, or full edition;
- regenerate only a selected passage without paying to regenerate the entire article;
- replace, reorder, trim, split, merge, and crossfade segments;
- waveform editing and transcript-aligned correction;
- intro, outro, music bed, bumper, sponsor message, disclosure, and dynamic-insertion slots;
- editorial states such as draft, generating, processing, needs review, approved, scheduled, published, superseded, failed, and archived;
- side-by-side comparison of multiple voices or generation attempts;
- a clear distinction in the UI between the article revision and the narration-script revision;
- the ability to keep an old audio edition published when a trivial article correction occurs, while requiring regeneration or review when the spoken meaning changes;
- manual approval gates for cloned voices, hybrid repairs, sponsor insertion, and translated narration;
- bulk actions and an audio production calendar integrated with the CMS editorial calendar.

Explain how a novice sees a simple three-step workflow while an advanced publisher can open the deeper controls.

## 2. Human recording inside the CMS

Design a first-class recording studio in the browser, plus professional upload support.

Investigate:

- browser microphone capture using `getUserMedia`, `MediaRecorder`, Web Audio APIs, and feature detection;
- recording in chunks so a browser crash, lost connection, or accidental refresh does not destroy an entire session;
- pause, resume, retake, punch-in replacement, passage-by-passage recording, markers, countdown, input monitoring, and keyboard controls;
- teleprompter mode synchronized to the narration script;
- automatic scrolling and optional speech-following progress;
- microphone selection, level meter, clipping warnings, silence detection, background-noise test, and echo/reverb warnings;
- local buffering plus resumable direct-to-object-storage uploads;
- compatibility differences among Chromium, Firefox, Safari, iOS, and Android recording formats;
- canonicalizing browser output such as WebM/Opus, Ogg/Opus, or MP4/AAC into archival and delivery formats;
- upload of professionally recorded WAV, FLAC, AIFF, MP3, AAC, or other accepted masters;
- automatic speech-to-text transcription and alignment against the approved script;
- detection of missing words, duplicated passages, long silences, clipping, excessive noise, wrong takes, and mismatches between the text and recording;
- safe automated cleanup versus destructive editing that always requires human confirmation;
- collaboration between writer, narrator, editor, producer, and approver;
- mobile-first recording and the feasibility of later packaging the studio as a PWA or native companion app.

Specify what belongs in the browser, the Next.js application, a background worker, FFmpeg, object storage, and the database.

## 3. Text-to-speech provider strategy

Build a current provider comparison based on official documentation and current pricing. At minimum, investigate relevant offerings from:

- ElevenLabs;
- OpenAI audio and speech APIs;
- Microsoft Azure Speech;
- Google Cloud Text-to-Speech;
- Amazon Polly;
- other credible production providers that materially change the decision;
- commercially usable self-hosted or open-weight engines current at the time of research.

Do not pick a provider by demo quality alone. Compare:

- naturalness and listener fatigue in 5-, 15-, 30-, and 60-minute narration;
- long-form consistency across segments and across later regenerations;
- expressiveness, contextual prosody, dialogue, and news or essay narration styles;
- word and sentence timing/alignment data;
- SSML support and provider-specific controls;
- custom voice and voice-cloning quality;
- consent, identity verification, disclosure, moderation, and deletion processes;
- multilingual and cross-lingual voice behavior;
- streaming versus asynchronous batch generation;
- input limits, output limits, formats, sample rates, quotas, concurrency, and rate limits;
- deterministic behavior, model/version pinning, and the risk that the same text changes after a provider model update;
- latency and retry characteristics;
- commercial usage rights and restrictions;
- training-data retention, zero-retention modes, privacy, and enterprise requirements;
- per-character, per-minute, subscription, model-hosting, GPU, and egress costs;
- vendor lock-in and exportability of cloned voices or reference data;
- availability of pronunciation dictionaries, speech marks, timestamps, and visemes;
- current SDK quality for TypeScript/Node and Python;
- provider uptime, regional availability, and failover practicality.

Create a weighted decision matrix for these use cases:

1. best default stock narration;
2. best premium narration;
3. best publisher-owned cloned voice;
4. best low-cost bulk generation;
5. best multilingual narration;
6. best privacy-oriented or self-hosted path;
7. best real-time preview;
8. best long-form asynchronous generation.

Recommend a **provider-adapter contract** so Renegade CMS can support bring-your-own API keys and switch providers without rewriting the editorial system. Separate the portable common feature set from optional provider-specific capabilities. Explain how capability discovery should work in the admin UI.

## 4. Canonical content-to-narration compiler

Design an intermediate, provider-neutral **Narration Document** rather than sending raw article HTML or Lexical/Payload JSON directly to a TTS API.

Define how the compiler should:

- resolve a frozen content revision;
- walk structured Payload content blocks;
- produce speakable sections and ordered segments;
- preserve headings and chapter boundaries;
- transform citations, lists, dates, money, abbreviations, symbols, equations, URLs, and tables into understandable speech;
- attach language, voice, style, pronunciation, pause, emphasis, and source-block metadata;
- allow human overrides without mutating the article;
- generate a plain-text script, SSML where supported, and provider-specific request payloads;
- calculate a stable content hash for idempotency and caching;
- track the exact relationship among content revision, narration revision, provider, model, voice, settings, and generated segments;
- support deterministic partial regeneration;
- avoid awkward seams when independently generated segments are stitched together;
- preserve provenance down to the segment level for human, synthetic, translated, and hybrid material.

Provide a proposed TypeScript schema for this intermediate representation.

## 5. Processing pipeline and infrastructure

Design a robust asynchronous pipeline resembling:

`content revision → narration document → validation → segmentation → generation or recording ingest → transcription/alignment → audio cleanup → assembly → loudness normalization → encoding → waveform/timing artifacts → editorial review → publication → distribution`

Research how this should use:

- Payload hooks and Payload Jobs Queue;
- separate worker processes so FFmpeg and AI work do not block the public Next.js server;
- PostgreSQL-backed jobs initially, with explicit scale thresholds that would justify Redis/BullMQ, a managed queue, or separate services later;
- idempotency keys, leases, heartbeats, bounded retries, exponential backoff, dead-letter handling, and cancellation;
- job progress visible in Payload Admin;
- segment-level checkpoints so long jobs resume rather than restart;
- provider webhooks or polling for asynchronous jobs;
- rate-limit and budget-aware scheduling;
- per-site, per-user, and per-provider concurrency limits;
- automatic failover versus manual provider switching;
- a monthly audio budget and projected-cost preview before generation;
- immutable masters and reproducible derived assets;
- observability, structured logs, metrics, tracing, alerts, and an audit trail;
- safe deletion, retention, restoration, and provider-side deletion where applicable.

Define measurable revisit triggers before introducing more infrastructure.

## 6. Audio mastering, formats, and quality control

Research a canonical format strategy for:

- original/raw recording;
- lossless archival master;
- editable production master;
- web delivery;
- download;
- podcast RSS enclosure;
- low-bandwidth mobile playback;
- social-video and audiogram derivatives.

Compare WAV/PCM, FLAC, MP3, AAC/M4A, Ogg/Opus, and HLS audio where relevant. Recommend sample rates, bit depths, channel layouts, bitrates, loudness targets, true-peak limits, silence rules, metadata, and artwork conventions using current web and podcast guidance.

Specify an FFmpeg-based processing graph for:

- format normalization;
- resampling;
- channel conversion;
- loudness analysis and normalization;
- safe peak limiting;
- silence trimming that does not damage natural pauses;
- concatenation and crossfades;
- intro/outro and music mixing with ducking;
- metadata and cover-art embedding;
- generation of waveforms, preview clips, and multiple delivery renditions.

Separate objective automated checks from subjective editorial listening. Define a publish-blocking QC report and thresholds, but identify which thresholds need real-world testing rather than being treated as universal facts.

## 7. Storage, CDN, security, and delivery

Assume PostgreSQL stores metadata, not large audio binaries. Compare S3-compatible storage choices appropriate for a self-hosted CMS, including Cloudflare R2 and other credible options.

Design:

- direct browser uploads using short-lived presigned URLs or scoped temporary credentials;
- multipart or resumable uploads for long recordings;
- server-side verification after upload rather than trusting filename or MIME headers;
- object naming based on tenant/site, content ID, edition ID, revision, and asset role;
- private staging assets and public approved assets;
- immutable keys and CDN caching;
- byte-range requests and seeking;
- signed delivery for private or subscriber-only audio;
- malware scanning, decompression-bomb protection, maximum duration and size controls, and FFmpeg sandboxing;
- cross-tenant isolation in a multi-site installation;
- encryption, credential management, CORS, CSP, abuse prevention, and audit logging;
- backups, lifecycle policies, legal holds, deletion, and disaster recovery;
- storage and egress cost modeling at multiple audience sizes.

Explain whether audio should ever proxy through Next.js and when direct CDN delivery is better.

## 8. Public audio player and accessibility

Design a polished, reusable player for article pages and a persistent site-wide listening queue.

Include:

- fast start, preload strategy, range seeking, buffering feedback, and graceful error recovery;
- play/pause, skip backward/forward, scrubbing, volume, mute, and playback speed;
- chapter navigation and heading-based markers;
- transcript view with synchronized highlighting when timing data is available;
- search within transcript and click text to seek;
- remember position locally and optionally sync it for signed-in users;
- continue listening across page navigation;
- a mini-player and listening queue;
- share or copy a timestamped link;
- download where permitted;
- edition and narrator selector when human and synthetic versions both exist;
- clear labels such as “Read by the author,” “AI narration,” or “AI narration using the author’s licensed voice”;
- Media Session API integration with fallbacks;
- keyboard operation, screen-reader semantics, focus behavior, reduced motion, color contrast, touch targets, and WCAG analysis;
- no-JavaScript and unsupported-browser fallbacks;
- privacy-conscious analytics.

Determine whether progressive MP3/AAC, Opus, or HLS should be the default for article narration. Do not recommend HLS merely because it sounds more advanced; identify the duration, access-control, adaptive-bitrate, or scale conditions that justify it.

## 9. Content model for Payload CMS

Propose concrete Payload collections, globals, fields, indexes, relationships, access controls, hooks, and job tasks. At minimum consider:

- `AudioEditions`;
- `AudioSegments`;
- `AudioAssets` or integration with the CMS media library;
- `NarrationScripts` and revisions;
- `Voices`;
- `PronunciationLexicons`;
- `RecordingSessions` and chunk manifests;
- `AudioProcessingJobs` or the native jobs system;
- `PodcastShows`, `PodcastEpisodes`, and feeds if this boundary is justified;
- reusable intros, outros, music, sponsor segments, and disclosure clips;
- audio analytics aggregates;
- tenant/site-level audio settings and budget limits.

Every audio edition must reference an exact content revision and expose provenance. Include fields for source type, narrator, voice owner, provider, model, model version, voice ID, consent record, language, duration, timing artifacts, transcript, chapter data, processing version, QC results, storage objects, publication state, and supersession relationships.

Provide TypeScript-oriented pseudocode for the Payload definitions and access controls.

## 10. Versioning, regeneration, and cache invalidation

Solve the difficult revision problem explicitly.

Research and recommend:

- how to detect whether a content edit affects spoken output;
- semantic versus exact-hash change detection;
- when an edition becomes stale, remains valid, or needs manual review;
- partial segment regeneration and reassembly;
- preservation of URLs and analytics when an edition is replaced;
- whether old editions remain accessible;
- how to prevent two workers from generating the same edition;
- how model or voice updates affect reproducibility;
- how to invalidate CDN objects without destroying immutable history;
- how to migrate or reprocess assets when the mastering pipeline changes.

Include state diagrams or transition tables and idempotent pseudocode.

## 11. Voice identity, consent, rights, and abuse prevention

Treat voice cloning as a rights-management feature, not just an API toggle.

Research current provider requirements and applicable legal or regulatory considerations, while clearly distinguishing law from platform policy and recommended product safeguards.

Design:

- recorded and written consent capture;
- verification that the user controls the voice or has a valid talent agreement;
- permitted sites, languages, purposes, and expiration dates;
- revocation and deletion workflows;
- provenance and disclosure labels;
- access controls preventing ordinary editors from cloning or exporting voices;
- restrictions on public figures, minors, deceased persons, impersonation, fraud, harassment, and political deception;
- audit trails for who created, approved, generated, downloaded, or deleted a voice;
- safe behavior when a provider refuses content or suspends a voice;
- handling of a publisher leaving the platform and exporting their human recordings, scripts, metadata, and consent records;
- an honest explanation of which provider-specific voice models cannot actually be exported.

Recommend conservative defaults without making the overall system unusable.

## 12. Distribution beyond the article page

Explore how one approved audio edition can become:

- an embedded article narration;
- a podcast episode with a standards-compliant RSS enclosure;
- a private or subscriber-only feed;
- an audiobook or serialized-book chapter;
- an email/newsletter audio link;
- an audio-only social post where supported;
- an audiogram or vertical video with waveform, captions, artwork, and selected excerpts;
- a YouTube or other video rendition using an image, captions, and chapter data;
- source material for translated/dubbed editions.

Research current Podcasting 2.0, Apple Podcasts, Spotify, YouTube podcast, and other relevant requirements using primary documentation. Cover episode GUID stability, enclosure URLs, MIME types, byte length, artwork, chapters, transcripts using VTT or SRT where accepted, timed links, explicit-content metadata, canonical links, and feed validation.

Keep distribution adapters separate from the canonical audio edition so a social or podcast failure never corrupts the master asset.

## 13. Discovery, SEO, and structured data

Research how audio editions should affect:

- article canonical URLs;
- HTML metadata;
- schema.org `AudioObject`, `Article`, `PodcastEpisode`, `Person`, and relevant relationships;
- `speakable` markup and its current limitations;
- transcript indexing;
- audio sitemaps or feed discovery where appropriate;
- chapter and timestamp deep links;
- duplicate-content concerns for transcripts;
- accessibility and AI/answer-engine discovery;
- provenance and disclosure metadata.

Do not promise search-result features that current search engines do not officially support.

## 14. Analytics and business controls

Design privacy-conscious analytics that distinguish meaningful listening from a page impression.

Consider:

- play starts, qualified starts, completion quartiles, completion rate, listening time, speed changes, seeks, chapter usage, transcript interaction, downloads, and resumes;
- human versus synthetic edition performance;
- cost per generated minute, published minute, start, qualified listen, and completed listen;
- CDN and provider cost allocation by tenant, site, author, content type, and campaign;
- bot and preload filtering;
- server events versus client events;
- retention limits and consent requirements;
- a simple publisher dashboard plus deeper exportable analytics.

Define event names, required fields, deduplication rules, and aggregate tables without storing invasive raw behavior by default.

## 15. Reliability, testing, and failure modes

Build a failure-mode analysis covering at least:

- provider timeout, refusal, outage, or output truncation;
- rate limits, quota exhaustion, or unexpected cost spikes;
- malformed SSML or unsupported pronunciation controls;
- inconsistent voice or volume across segments;
- corrupted recording chunks or an abandoned upload;
- browser codec incompatibility;
- FFmpeg crash, malicious media, or out-of-memory processing;
- worker crash midway through generation;
- webhook duplication or loss;
- stale content revision;
- deletion of a voice or provider account;
- private asset accidentally becoming public;
- CDN caching the wrong permissions;
- transcript and audio drifting out of alignment;
- partial publication to podcast or social destinations;
- a revoked consent record after editions were already published.

Define unit, integration, contract, end-to-end, cross-browser, load, security, accessibility, audio-quality, and disaster-recovery tests. Include provider sandbox/fake adapters so the normal test suite does not spend money or depend on external uptime.

## 16. Required architectural decisions

The report must take a position on these questions:

1. What is the canonical audio-edition abstraction?
2. What is the canonical narration-document format?
3. What triggers generation by default?
4. What is pre-generated versus streamed?
5. What belongs in Next.js, Payload, PostgreSQL, a worker, FFmpeg, object storage, and the CDN?
6. Which provider is the recommended launch default, and why?
7. How does bring-your-own-key provider selection work?
8. How are human recordings and synthetic output normalized into one lifecycle?
9. How are exact article revisions, scripts, segments, and audio files linked?
10. What is the partial-regeneration strategy?
11. Which formats are kept as masters and which are generated as derivatives?
12. How are recordings uploaded safely and resumably?
13. How does the public player deliver fast, accessible playback?
14. When does a narration become a podcast episode?
15. How are voice rights verified, recorded, revoked, and audited?
16. What ships in the first vertical slice, and what is deliberately deferred?

## 17. Required report structure

Produce an implementation-facing architecture report with:

1. **Executive recommendation** with the chosen default architecture.
2. **Project spine** and the core loop.
3. **System boundaries** and component-responsibility diagram.
4. **Current provider matrix** with dated prices, limits, licensing, citations, confidence, and unknowns.
5. **Technology decision table** with responsibility, choice, reason, constraint, and revisit trigger.
6. **Payload CMS data model** with field-level detail and indexes.
7. **Narration Document schema** in TypeScript.
8. **Lifecycle and state transitions** for generated, human, and hybrid editions.
9. **End-to-end sequence diagrams** for synthetic generation, browser recording, professional upload, partial correction, publication, and regeneration after an article edit.
10. **API and provider-adapter contracts** with TypeScript pseudocode.
11. **Jobs and processing design** with idempotency and failure recovery pseudocode.
12. **Storage key design** and asset manifest examples.
13. **FFmpeg processing recommendations** and QC rules.
14. **Public-player architecture** and accessibility requirements.
15. **Security, consent, rights, privacy, and abuse threat model**.
16. **Podcast, feed, social, audiobook, and derivative-distribution architecture**.
17. **Cost models** for a small self-hosted site, a growing publication, and a multi-tenant installation. State all assumptions.
18. **First complete vertical slice** that proves one article can become both a reviewed synthetic edition and a human-read edition.
19. **Milestone roadmap** with acceptance gates, dependencies, exclusions, rollback boundaries, and what each milestone unlocks.
20. **Task-file index** split into bounded implementation sessions suitable for Codex.
21. **Testing strategy and failure-mode table**.
22. **Launch checklist**, monitoring, backup, recovery, and initial success metrics.
23. **Deferred capabilities** with measurable revisit triggers.
24. **Unresolved decisions and recommended experiments**.
25. **Immediate next implementation task** with files in scope, pseudocode, tests, definition of done, and explicit non-goals.

## 18. Research standards

- Use current primary sources: official API documentation, pricing pages, standards, specifications, provider policies, and authoritative legal or regulatory material.
- Date all volatile facts, especially pricing, model names, quotas, provider features, and platform requirements.
- Cite every material current-state claim near the claim.
- Distinguish verified facts, engineering inference, recommendation, and unresolved uncertainty.
- Do not accept marketing claims about voice quality. Seek independent benchmarks where valid and propose a blind listening test using representative Renegade CMS content.
- Include counterarguments to the recommended provider and architecture.
- Identify lock-in, hidden operating costs, licensing ambiguity, and features that require provider approval.
- Treat self-hosted TTS as an option to evaluate, not an automatic win. Include GPU cost, maintenance, model licensing, abuse controls, output quality, and operational complexity.
- Avoid premature microservices. Prefer a modular monolith plus worker processes until measured scale requires a new boundary.
- Preserve the maximalist destination while sequencing implementation through testable proofs.

## 19. Minimum vertical slice to evaluate

At minimum, assess this launch slice:

1. An editor opens one published article revision in Payload.
2. The CMS compiles it into an editable Narration Document.
3. The editor selects one connected TTS provider and previews a paragraph.
4. The editor requests full generation.
5. A background job generates checkpointed segments, assembles them, normalizes the result, encodes a web rendition, writes timing and QC metadata, and stores immutable assets.
6. The editor reviews and publishes the audio edition.
7. The public article displays an accessible player, chapters, a transcript, narrator/provenance labeling, and a download option if allowed.
8. Separately, the publisher can record the same script passage-by-passage in the browser, safely upload chunks, resume after interruption, assemble and process the recording, review it, and publish it as an alternative human-read edition.
9. A meaningful article edit marks the corresponding edition stale without immediately deleting or breaking the published audio.
10. The system can regenerate only the affected segment and publish a superseding edition safely.

Determine whether this slice is small enough for the first proof. If not, narrow it while preserving one complete synthetic path and one complete human-recorded path.

## Desired conclusion

The result should define an **Audio Publishing Engine** that can begin as a clean module inside Renegade CMS and later power article narration, podcasts, audiobooks, newsletters, translations, social derivatives, and a wider media command center without rewriting its core contracts.

The guiding principle is:

> Write once, narrate or record once, review once, and publish a durable audio edition everywhere, while the human publisher remains in control.
