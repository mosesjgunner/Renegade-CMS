# Optional federated network experience

Federation is an opt-in publication capability. It does not change local forums, publishing, editorial workflow, or canonical content ownership. When networking is disabled, no network navigation is shown and public `/network` renders an honest unavailable state.

Remote actor and object records are cache records: they retain their canonical remote URL, origin, fetched metadata, and `remoteOnly` reference marker. The only public remote-content surface links back to the original source. Importing remote material into canonical Renegade content is a separate portability/import action.

Authorized operators use Network administration records for discovery, follow/unfollow state, inbound activity inspection, outbound delivery attempts, blocked actors/instances, moderation notes, and append-only audit events. Follow delivery is queued durable work; outages leave local publishing and community paths untouched.

Moderation is human-directed. Actor or instance blocks override all other policy. An optional allowlist denies unlisted sources, future inbound activity is rejected before remote metadata is fetched, and cached remote references are hidden when the configured policy requires it. No AI participation decision exists.

Abuse controls bound ActivityPub body size, safe remote fetch responses/timeouts/redirects, inbox/discovery/fetch/follow quotas, replay keys, repeated invalid request rejection, and worker delivery retries. They are process-local bounded controls by default and should be backed by a shared limiter for multi-process deployments.
