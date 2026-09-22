# Community conversations: security posture

COMM-07A conversations are authenticated, site-scoped durable inbox records. Clients must use TLS in transit. At-rest encryption is provided only when the deployed PostgreSQL volume, managed database, or platform enables it; operators must verify that platform setting for their deployment.

This release does not provide end-to-end encryption. The service sanitizes message HTML and enforces active membership before writing or reading, but the application can process plaintext message content. Do not describe conversations as E2EE in product or UI copy.

COMM-07B direct conversations begin as `pending_request` unless both members actively follow one another. Pending requests are visible to the recipient but generate no realtime or push delivery. Only the designated recipient may accept, decline, or block-and-report; decline prevents later sending, and every send rechecks bidirectional blocks. New accounts (under seven days) may create at most three non-mutual requests in a rolling hour. Message reports use the moderation report pipeline and retain a text/sequence snapshot.

COMM-07D group conversations have a hard maximum of 100 active participants. Group creators are admins; admins may update the name/avatar, invite/remove members, and promote/demote admins. Membership rows are retained after leaving or removal. Each membership transition is appended as an immutable `system` message in the canonical sequence. Invited/rejoined members start at their join sequence and cannot read earlier messages; there is no backfill policy. A sole admin may not leave a non-empty group without first assigning another admin. When the final participant leaves, the group is archived and read-only.

The UI uses the same accurate posture: protected in transit with TLS; protected at rest according to server/storage configuration; and **not end-to-end encrypted**. Attachments remain subject to COMM-07C's owner, quarantine, and scan policy. Unsupported: external delivery and notification workers.
