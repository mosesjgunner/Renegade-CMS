# DISC-04 local search projection

`search_documents` is a versioned, disposable PostgreSQL projection of the canonical
`DiscoveryDocument`. Payload remains authoritative; the index stores only eligible
current public canonical revisions. Lifecycle hooks remove ineligible, deleted, and
changed records, while `rebuildSearchProjection` and `reconcileSearchProjection`
provide idempotent recovery after a restore or detected drift.

The public `/search` route is server rendered and uses weighted PostgreSQL full text
search (`title A`, `excerpt/taxonomy B`, `body C`) with stable published-date/id
tie-breaking and a maximum page size of 50. Query fields are SQL parameters. Result
highlighting is rendered by React from plain text, never database-produced HTML.

The Indexing Center reports projection count, missing body projection and index
version mismatch by site/type. PostgreSQL is the default self-hosted implementation.
An `ExternalSearchAdapter` can be evaluated only after the documented sustained
corpus or p95 latency threshold; it has rebuild and opaque-ID query contracts, so it
cannot expose private documents or internal rank details.
