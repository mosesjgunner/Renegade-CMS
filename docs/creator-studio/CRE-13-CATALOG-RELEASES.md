# Creator catalog releases

Use **Creator Studio → Catalog releases** to link a published portfolio, project, podcast episode, or video replay with an approved private trailer asset, full recording, and published products. Paste IDs from the canonical records. The download product supplies its approved files, prices, and entitlement through the existing storefront and checkout. Related products can include merch, donations, subscriptions, or memberships.

Choose **Site members** for a recording available to active members with a role on the site. Use a separate digital-download product for the downloadable files. For **Paid access**, the recording must be included in the specified digital product. Playback checks the existing unmetered subscription entitlement or unmetered order delivery grant on every request. Buyer downloads redirect to the existing commerce delivery route, which authorizes and counts the download.

Catalog playback uses same-site, five-minute signed URLs. A signed URL for a member or paid recording is bound to the current member and the media checksum. Rights expiry, entitlement revocation, and catalog withdrawal close access on subsequent requests. The catalog serves first-party audio and video blobs through the configured storage backend. Existing external embeds, including YouTube, retain their own player and access behavior.

Add the announcement copy and optional IDs for prepared promotion clips and graphics. Selecting an owned Social Studio account creates a draft variant with those attachments and a link back to the catalog. Newsletter copy creates a draft email message. The release appears in the existing calendar as a draft at the selected planning time. Publishing the catalog does not send promotions. If one channel fails, retry the release to create missing drafts. Existing draft and variant IDs are reused. The report lists local publication and draft outcomes.

The catalog links prepared assets. Clip and graphic rendering remain in their existing editors.

## Verification

The PostgreSQL integration gate created a release with a free trailer, a member recording, a digital download, and related merchandise. It verified signed range delivery, rejection of a copied member URL, canonical download byte delivery with a real member session, and denial after revocation for both fresh and previously signed URLs. A separate paid-recording release exercised the same order grant.

An injected newsletter failure left the catalog and Social Studio draft intact. Retrying created the missing newsletter draft and reused the social variant. The Social Studio queue remained empty. The commerce runtime acceptance suite separately exercised local settlement, subscriptions, donations, and fulfillment.
