# Social Provider Capability Matrix and Architecture Specification for Renegade CMoS

## Executive Summary

The social publishing landscape is defined by substantial structural asymmetry. Commercial social media management platforms such as Buffer, Hootsuite, Later, and Metricool present users with an abstracted, uniform operational model: compose once, customize per network, attach media, preview, validate, schedule, and collect analytics. Beneath this uniform layer, however, the underlying application programming interfaces (APIs) diverge sharply in authentication requirements, media processing pipelines, rate limits, container lifecycles, and operational approval barriers. Platform constraints range from open federated protocols that allow immediate, permissionless publishing to corporate walled gardens that mandate formal business verification, manual screencast app reviews, strict multi-step media container polling, and steep per-call or per-resource API monetization.

Renegade CMoS resolves this operational tension through an architectural abstraction that decouples CMS state from provider mechanics. The primary architectural foundation established in this specification is that Renegade CMoS owns the canonical content representation, the scheduling state machine, and the delivery queue. Platform-native scheduling, proprietary payload structures, and external data formats do not dictate internal CMS data schemas. Provider adapters serve as isolated boundary translators that declare static capabilities, discover runtime account constraints, normalize incoming media to strict network specifications, orchestrate asynchronous multi-stage upload flows, and report normalized delivery telemetry.

This specification establishes the technical baseline for Renegade CMoS Pass 6 (Distribution / Social Publishing). It codifies the authentication flows, publishing interfaces, media transformation pipelines, post-publication lifecycle operations, analytics schemas, and operational compliance requirements across ten primary commercial and federated networks: Facebook Pages, Instagram, X (Twitter), Threads, LinkedIn, TikTok, YouTube, Bluesky, Mastodon, and Pinterest. It evaluates five secondary networks, analyzes architectural patterns from open-source distribution systems, and specifies the contracts, models, queue mechanics, and testing matrices required to build a resilient, enterprise-grade, self-hosted distribution engine.

## Chronology and Operational Context

Social platform APIs undergo frequent revisions, permission deprecations, and business model adjustments. The technical findings in this report were verified against official platform developer documentation and active API endpoints during the first quarter of 2026.

To maintain durability across future platform updates, the investigation cross-references official documentation against verified behavioral quirks observed in open-source social publishing engines, such as SimplePost Core, Postiz, and Mixpost. Platform specifications must not be treated as static assumptions. Instead, Renegade CMoS couples compile-time interface contracts with runtime capability discovery, ensuring that changes to platform quotas, character ceilings, or privacy toggles are detected dynamically during active distribution.

## Recommended First-Class Networks

Renegade CMoS targets ten primary distribution networks:
1. Facebook Pages
2. Instagram
3. X (Twitter)
4. Threads
5. LinkedIn
6. TikTok
7. YouTube
8. Bluesky
9. Mastodon
10. Pinterest

## Provider Capability Matrix

| Capability / Dimension | Facebook Pages | Instagram | X (Twitter) | Threads | LinkedIn | TikTok | YouTube | Bluesky | Mastodon | Pinterest |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Plain Text Posts | Directly Supported | Unsupported | Directly Supported | Directly Supported | Directly Supported | Unsupported | Unsupported | Directly Supported | Directly Supported | Unsupported |
| Link Previews | Directly Supported | Unsupported | Directly Supported | Directly Supported | Directly Supported | Unsupported | Unsupported | Directly Supported | Directly Supported | Directly Supported |
| Single Image | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Unsupported | Directly Supported | Directly Supported | Directly Supported |
| Multi-Image / Gallery | Directly Supported (Up to 10) | Directly Supported (2–10 Carousel) | Directly Supported (Up to 4) | Directly Supported (2–20 Carousel) | Directly Supported (2–20 MultiImage) | Directly Supported (Photo Mode 1–35) | Unsupported | Directly Supported (Up to 4) | Directly Supported (Up to 4) | Directly Supported (2–5 Carousel) |
| Native Video | Directly Supported (Up to 10 GB) | Directly Supported (Up to 1 GB) | Directly Supported (Up to 512 MB) | Directly Supported (Up to 1 GB) | Directly Supported (Up to 500 MB) | Directly Supported (Up to 4 GB) | Directly Supported (Up to 256 GB) | Directly Supported (Up to 50 MB) | Directly Supported (Instance limit) | Directly Supported (Up to 2 GB) |
| Short-Form Video | Directly Supported (Reels) | Directly Supported (Reels) | Directly Supported | Directly Supported | Directly Supported | Directly Supported (Primary) | Directly Supported (Shorts) | Directly Supported | Directly Supported | Directly Supported (Idea/Video Pin) |
| Stories | Unsupported | Directly Supported | Unsupported | Unsupported | Unsupported | Unsupported | Unsupported | Unsupported | Unsupported | Unsupported |
| Polls | Unsupported | Unsupported | Conditionally Supported | Directly Supported | Unsupported | Unsupported | Unsupported | Unsupported | Directly Supported | Unsupported |
| Threading / Replies | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Unsupported |
| Alt Text Support | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Unsupported | Unsupported | Directly Supported | Directly Supported | Directly Supported |
| First Comment | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Unsupported | Directly Supported | Directly Supported | Directly Supported | Unsupported |
| Native Scheduling | Directly Supported | Conditionally Supported | Unsupported | Unsupported | Unsupported | Unsupported | Directly Supported | Unsupported | Directly Supported | Unsupported |
| Edit Published Post | Directly Supported (Text only) | Unsupported | Conditionally Supported | Unsupported | Unsupported | Unsupported | Directly Supported (Metadata) | Unsupported | Directly Supported | Directly Supported (Metadata) |
| Delete Published Post | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Unsupported (Direct Post) | Directly Supported | Directly Supported | Directly Supported | Directly Supported |
| Analytics Ingestion | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Directly Supported | Conditionally Supported | Conditionally Supported | Directly Supported |

---

## Pass 6 (Distribution) Recommended Rollout Architecture

### A. Recommended Launch Tiers
- **Tier 1 (Instant Velocity / Open Infrastructure)**: Mastodon, Bluesky, Telegram.
- **Tier 2 (High-Value Professional / Developer Ecosystem)**: LinkedIn, Facebook Pages.
- **Tier 3 (Visual / Consumer Ecosystem)**: Instagram, Threads, Pinterest.
- **Tier 4 (Video Heavy & Monetized APIs)**: YouTube, TikTok, X (Twitter).

### B. Core 5
1. Mastodon
2. Bluesky
3. LinkedIn
4. Facebook Pages
5. Instagram

### C. Next 5
6. Threads
7. Pinterest
8. YouTube
9. X (Twitter)
10. TikTok

### D. Architectural Blockers
1. **Application-Layer Credential Encryption**: AES-256-GCM encryption service protecting client secrets and access/refresh tokens.
2. **Media Derivative Processing Hooks**: Media Subsystem supporting on-demand derivative generation (aspect ratio cropping, format normalization).
3. **Persistent Background Queue Engine**: Worker lease locking, status lifecycle state machine, exponential backoff with jitter, rate-limit reset rescheduling.

### E. Pass 6 Implementation Sub-Passes (DIST-01 to DIST-04)
- **Sub-Pass 6A (DIST-01)**: Social Core Architecture, Security, and State Engine
- **Sub-Pass 6B (DIST-02)**: Open Protocols, Media Pipelines, and Core 5 Adapters (Mastodon, Bluesky, LinkedIn)
- **Sub-Pass 6C (DIST-03)**: Meta Infrastructure (Facebook, Instagram, Threads), Visual Networks (Pinterest), and Social Command Center UI
- **Sub-Pass 6D (DIST-04)**: Video Pipelines (YouTube, TikTok), Monetized APIs (X API v2), and Unified Analytics Ingestion
