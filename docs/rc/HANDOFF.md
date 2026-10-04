# RC-02 handoff ? PASS ? 2026-10-03

Tested source `b684ee11460637bf2177f349057f14d6e804bbbd` on local branch `rc02-site-build-candidate`; active branch/index preserved. Fresh production Standard/all journey passed, including private-draft search isolation and real web/worker restart. All required checks passed (100 unit, 24 integration, bundle/typecheck/lint/build, consolidated browser). See [RC-02 evidence](evidence/RC-02.md) for trace, records, media and HTTP assertions.

Narrow claim approved: ?usable to build and launch a serious self-hosted publishing site.? No RC-02 core blocker remains. **NEXT: RC-03**; do not execute it automatically. Historical RC-01 constraints below were superseded only by the user's explicit RC-02 authorization; separate RC-01 blockers remain open.

# RC-01 handoff — BLOCKED

Base HEAD: `6818864c9e601860d6a7c7874ae02fd0b7fdb48d`; repairs uncommitted. Date: 2026-10-03 (America/Chicago). **NEXT: resume RC-01; RC-02 is not authorized to advance.**

Read [RC-01 evidence](evidence/RC-01.md), [current blockers](BLOCKERS.md), and current admin appendix in [route matrix](ROUTE_MATRIX.md). Required typecheck/lint/build and focused checks passed; full route/role acceptance failed at ordinary owner Moderation (403 from member-auth APIs with siteId=default). Final failing JSON/trace/screenshot and console/network/server logs are under evidence/rc-01; ignored test-results also holds browser artifacts. 16 tests passed, one failed, 156 unexecuted. No lifecycle or staff/anonymous matrix proof is inferred.

Repair scoped admin/community authorization and ordinary authorized-site discovery without a bypass, then create a fresh disposable database and rerun the matrix. Preserve existing local data. Use prepare-rc01-instance.mjs and playwright.rc01.config.ts, not default destructive global setup or LOCAL_E2E_TEST_MODE. Continue missing CRUD/preview/publish/provider/error/role acceptance only after the first failure is repaired. Audience/Social/Fulfillment command centers report explicitly unavailable; restoration is a release blocker. Lean direct-view safety, non-admin studios/connections, remaining provider synthesis, tenant boundaries and clean-candidate freeze remain open. Do not run the entire RC suite or advance automatically.
