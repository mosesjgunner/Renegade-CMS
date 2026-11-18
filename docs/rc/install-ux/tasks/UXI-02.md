# UXI-02 — Make defaults and progress reliable

Goal: shared state/defaults contracts; idempotent, resume-safe mutations on the setup spine.
Done: enrollment resume contract (challenge+session rotation, bootstrap token never restored); feature-profile default derived from the installed resource profile; slug derived from name; readiness fallback uses real migration count. Contracts in INSTALL_UX_CONTRACTS.md.
Not done: a platform-wide shared task-readiness service and server-side setup-draft persistence beyond the enrollment session — larger than this pass's spine scope; recorded as follow-up, not silently dropped.
