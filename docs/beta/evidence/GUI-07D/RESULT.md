# GUI-07D — Audience, forms, community and moderation

**Result: PARTIAL (audit — surface already honors the prompt's consent rules; no bounded fix found)**

Audit findings (source, this tree):
- The destructive audience action (erase subject) carries an
  exemplary scope confirmation, matching the GUI-02C dangerous-action
  pattern almost verbatim: it states what happens (suppress +
  anonymize the address), what is retained (CRM, delivery and
  consent history), and what it does NOT do (delete an account or
  all subject data) — before the operator confirms. Consent
  provenance is a first-class part of the contact views (verified
  consent history with an audit trail), not an afterthought.
- AudienceCommandCenter is 2,505 lines of grouped administration
  (contacts, segments, campaigns/delivery, policies); moderation
  lives in CommunityModerationCenter. No silent destructive path,
  no casual exposure pattern found in the audited flows.

Per the RC2 anti-trap rule (Nov 10), restructuring these surfaces
for grouping aesthetics without a measured defect is out of bounds;
recorded as audited, not churned. Live workflow proof (contact/form/
moderation journeys, denial paths) rides the capture cycle — the
audience module is gated, so the fixture needs it enabled.

**Exact next prompt: GUI-07E.**
