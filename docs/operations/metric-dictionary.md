# First-party metric dictionary

Raw `analytics-events` are consent-gated, first-party only, deduplicated by `dedupeKey`, and retained for a bounded period. Rollup workers aggregate bounded event windows into `analytics-rollups`; reporting must read rollups rather than repeatedly scan raw events.

| Metric                                                           | Definition                                                       |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `page_view`                                                      | One consented, deduplicated view of a first-party surface.       |
| `read_depth`                                                     | A consented reader progress event.                               |
| `click_internal` / `click_outbound`                              | A consented activation of a first-party or external link.        |
| `signup`, `form_submit`, `payment_completed`, `media_engagement` | First-party interaction events, never inferred identity signals. |
| `goal:<key>`                                                     | A configured goal matched from a trusted or consented event.     |

Campaign/referrer fields are attribution context only. First-touch and last-non-direct reporting explicitly state that they are first-party-path estimates.
