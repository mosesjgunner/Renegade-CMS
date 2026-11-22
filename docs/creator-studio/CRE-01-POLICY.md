# CRE-01 creator access

Creator access is per site and separate from staff operator permissions. A member must have an active account, an active site, a site standing row, no applicable posting sanction, an enabled site creator policy, and an explicit grant on that row. Space operations additionally resolve the Space's site and its profile's member on every request. A member session does not cache grants. Removing a grant denies subsequent requests; requests already in progress are not cancelled.

For a site, an operator can set `creatorPolicy` to, for example:

```json
{"enabled":true,"selfServiceSpaces":true,"quotas":{"bytes":1000000000,"uploadCount":100,"concurrentRecordings":1,"processingMinutes":60,"liveMinutes":60,"audienceCap":100,"exportJobs":5,"retentionDays":30}}
```

The site owner grants a member names in the `creatorCapabilities` JSON array on the member's site-role record. The Studio draft and Space workflow needs `content.draft-own` and `space.manage-own`. Optional `creatorQuotaOverride` uses the same quota keys and nonnegative integer values. Missing limits are unspecified, not an unlimited allowance. No role name automatically grants creator operations. Self-service Space creation and editing require `selfServiceSpaces: true`; joining the site does not grant creator capabilities.

`/studio` and `/members/{handle}/studio` provide Space description editing and a plain-text private article draft. The draft uses canonical `content`, belongs to the Space and member, and remains in draft state. Rich editorial drafts must be edited in the existing editorial interface. These pages do not grant member uploads, live hosting, publishing, media editing, or stream tokens. The capability names and quota settings for those features are policy inputs for future operations; they do not enable those operations or enforce their resource usage yet. Existing staff-only media and podcast workflows retain their own operator policies.

The JSON policy fields are managed through the Payload site and Community member-site-role records, or the scoped operator API. Only site-authorized owners can change member-site-role grants. Creator grant and override changes are recorded by the existing identity audit hook. The policy fields have validation; a dedicated creator-specific management screen is not yet available.
