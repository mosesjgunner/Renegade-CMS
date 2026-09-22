# AUD-03 email renderer

Email is a versioned channel projection, not a website rendering mode. `EmailTemplate` supplies narrowly scoped brand tokens and registered block/layout metadata; `email-messages.messageDesign` supplies a versioned message design. The renderer accepts only registered blocks, emits deterministic HTML and a plain-text companion, uses only inline styles, and never loads theme CSS or JavaScript.

Canonical content cards pin content id, revision id, and resolved absolute URL. A card reports stale when the current source revision differs; rebase replaces only source facts and preserves editor title/summary overrides. Approved output records HTML, text, template version and SHA-256 hash. Any design/template/source rebase must clear that approval before scheduling.

Personalization has a fixed allowlist, explicit missing-value policy, HTML escaping, and no expressions. Recipient data must never be used in a shared render cache key. Preview is an approximation; authorized test sends traverse the existing outbox/provider boundary. AUD-03 does not initiate bulk dispatch.
