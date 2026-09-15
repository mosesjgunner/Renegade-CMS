# DISC-05 — Rendered Discovery Quality

DISC-05 is a bounded public-output audit, not a ranking predictor and not a single SEO score. It fetches only canonical-origin HTTP(S) URLs, resolves DNS before every request, rejects private addresses by default, sends no credentials, caps concurrency at 12 and the crawl at 1,000 paths, and applies a per-request timeout. Configurable paths are normalized against the canonical origin; cross-origin paths are discarded before fetch.

`runRenderedAudit` deliberately evaluates the response HTML. It records versioned, direct-repair findings for title and description bounds, canonical/noindex disagreement, invalid JSON-LD, heading structure, missing image alt attributes, HTTP/redirect errors, duplicate rendered titles, and uncrawled internal href targets. Findings retain the rendered URL and repair field so Quality Center persistence can use its existing first/last-seen, status, assignment, ignore-reason, and re-scan lifecycle.

The crawler does not execute scripts, follow redirects automatically, fetch third-party links, infer search rankings, or expose response bodies. Canonical relationships and rendered anchors are preserved as graph evidence; lexical similarity/cannibalization must remain a cautious editorial review suggestion, never a traffic or ranking claim. AI rewriting, if enabled later, must use the existing provider boundary and require acceptance; it must not alter deterministic evidence.

Operational use must run against the real public origin after a deliberate publish, then persist findings through the Quality Scan lifecycle and re-run after repairs. Do not enable private-origin crawling in production.
