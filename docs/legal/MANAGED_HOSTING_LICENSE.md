# Managed-hosting license transition (proposed; legal review required)

## Commercial policy

Renegade's intended business model is free, source-available self-hosting for personal and commercial first-party use, with a separate commercial agreement for third-party managed-service offerings that expose a substantial set of Renegade's features.

* A person, creator, nonprofit, company, or merchant operating its own Renegade site, podcast, community, or shop may self-host and monetize it without a Renegade fee.
* A provider making Renegade itself available to third-party customers as a hosted or managed service with access to substantial Renegade functionality must negotiate a commercial agreement with the rights holder for rights-cleared future ELv2 code.
* Selling web-design, implementation, migration, consulting, or general-purpose VPS infrastructure is not automatically prohibited; classification depends on what service is actually provided and the license's exact scope.
* This proposal does not impose a royalty on site, shop, podcast, donation, or membership revenue.
* The proposed future distribution license is the standard Elastic License 2.0 (ELv2), a source-available license, **not** an OSI-approved open-source license. The definitive text is in the repository root LICENSE. Commercial exceptions require a separate written contract.

## Critical transition limitations

1. **Existing AGPL rights cannot be revoked.** Copies previously published under AGPL-3.0 (or AGPL-3.0-or-later where specified) remain licensed under those terms. They can be commercially hosted without buying a new license as long as applicable AGPL obligations are met. Restriction applies only to future source that can actually be licensed under ELv2.
2. **Confirm ownership and permissions before merge or release.** Audit author and contributor history for copyright interests, including work contributed through pull requests, collaborators, and any third-party code copied into the repository. A commit credited to an account is not sufficient evidence of exclusive ownership. Secure written permission for all required portions or keep them on their original compatible licensing track/remove and replace them lawfully.
3. **Preserve third-party notices and licenses.** This change is not a relicense of dependencies or vendor software (including Payload, Next.js, React, Puck, and components listed in THIRD_PARTY_NOTICES). Audit vendored or adapted source and their licenses separately. Determine whether any retained AGPL-only code has requirements inconsistent with combined distribution under ELv2.
4. **Clarify the commercial contract.** ELv2 defines a hosted or managed service using access to a *substantial set of features*. It is not a blanket prohibition on every agency, developer, SaaS integration, or generic hosting provider. Commercial contracts should define scope, prices, sublicensing, service levels, termination, trademark rights, support, and audit/compliance terms.
5. **Align claims and automation before release.** Search source headers, notices, README, release docs, container/package metadata, website, tests and distribution archives for legacy assertions and license manifests. Verify accurate SPDX and third-party notices. Do not ship mixed terms that accidentally claim ELv2 rights over AGPL-only code.
6. **Legal review.** Have qualified counsel review copyright provenance, compliance with AGPL and any mixed licenses, enforceability in target jurisdictions, and commercial offering terms before merging this branch. No license-key enforcement mechanism is introduced by this change.

## Intentional sequencing

This branch is a documentation-and-metadata proposal, not proof of clean copyright title or completed migration. Do not merge until rights audit is complete. Do not modify existing tagged releases, published AGPL source archives, or third-party license texts.

Reference: https://www.elastic.co/licensing/elastic-license/
