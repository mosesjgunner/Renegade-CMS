# Unified Site Quality policy

Quality Center stores policy, rule, scan, issue, exception, waiver, and report records. Findings point to the exact target and revision and are deduplicated by rule, target, revision, location, and dependency fingerprint. Resolved findings remain resolved until content, dependency, or rule changes, or a rescan finds them again.

Publication-blocking findings prevent ContentRelease scheduling when supplied to the release gate. Local deterministic checks cover internal links, canonical URLs, headings, alt text, rights expiry, and translation currency. Remote checks are provider-dependent: unavailable or unreachable external URLs are warnings marked uncertain, never confirmed broken links. Only owners may waive non-security/non-privacy, non-blocking findings with a reason and expiry.
