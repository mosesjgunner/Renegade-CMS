# Privacy-safe personalization and experimentation

Experiences use only declarative approved rules and registered components/content revisions. They may use explicit language/region, role, Space membership, entitlement, consented segment, documented first-party session state, campaign/referral, device class, explicit preference, and time/event/campaign state. Sensitive inference, purchased data, cross-site identity, fingerprinting, hidden audiences, and arbitrary code are prohibited.

Without analytics/experiment consent—or when Lean disables collection—the renderer returns the control/default variant and normal site rendering continues. Assignment is salted and deterministic. Exposure and conversion use separate idempotency keys. Analyses report sample, counts, rates, practical effect, and uncertainty; small samples warn rather than declare a winner. A selected winner always needs recorded human approval.

The runtime writes exposures and conversions only to canonical `analytics-events` as `experiment_exposure` and `experiment_conversion`; legacy experience event collections are not an analytics sink. A runtime subject may only be an already-permitted first-party cookie, session, or member identifier. It never accepts an IP address, user agent, fingerprint, or arbitrary targeting attribute. Components must be present in the deploy-time public component registry.
