# GUI-07C — Distribution, email and campaign flows

**Result: PARTIAL** (the audit's named correctness defect fixed properly; flow captures ride the cycle)

## Fixed: EmailComposer's hardcoded production host (audit §9 risk, closed)

Deriving a newsletter from an article resolved relative canonical
paths against a hardcoded `https://renegadeparty.org` — every other
site and install would mint "Read Story" buttons pointing at
Renegade Party's domain. The prompt allows this fix only when
bounded and backed by canonical site resolution; it is:

- The campaign API (`api/admin/audience/campaign`) now resolves the
  canonical origin via the existing `resolveSiteSettings` (per-site
  `canonicalOriginsBySite` first, then the global canonical origin)
  and returns it additively as `site.canonicalOrigin`. Resolution
  happens after the route's existing grant/site checks — no access
  behavior change.
- The composer builds the derived URL from that origin; when no
  origin is configured it keeps the relative path instead of
  inventing an absolute URL to a foreign domain.

Left alone deliberately: the composer's demo-flavored initial field
values (sample subject lines, a sample legal address, the
renegadeparty.org preference/unsubscribe placeholders) — those are
visible starting content an operator edits, not derivation logic;
sweeping them is a separate content/defaults decision, noted here
rather than silently rewritten.

## Audited

- Unmounted CalendarCenter/ScheduleHealthCenter NOT mounted (per
  explicit boundary).
- No test sends exercised; provider/consent machinery untouched.

## Not verified here

Compose → preview → schedule live flow with a connected provider;
partial-success reporting against a real queue — capture cycle +
provider fixtures (newsletter module gating applies).

**Exact next prompt: GUI-07D.**
