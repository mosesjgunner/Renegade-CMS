# RC3-UX-INSTALL-01 — Install and UX contracts

These contracts describe behavior as implemented on branch
`rc3-ux-install-01` at the pass baseline plus this pass's changes. Where a
contract predates the pass, it is stated because the UX depends on it.

## Installation identity and reruns

- One installation = one instance name + one `.env.production` + one
  per-instance image reference (`RENEGADE_IMAGE`), all persisted in the
  config file. A rerun must present the same instance name; a mismatch is
  refused before anything is touched.
- A rerun against the installation's **own running deployment** is a safe,
  supported operation: the port preflight exempts the listener owned by
  this installation's own `renegade-web` container. A port held by anything
  else is refused with guidance, and the foreign service is never disturbed.
- Reruns never regenerate secrets, never replace the config, and never
  change the recorded image. `--image` is a fresh-install-only option for
  exactly that reason.
- Prebuilt path: `--image <ref>` pulls a published release image instead of
  building from source. Release images are **not signed**; the honest
  verification is digest pinning (`--image repo@sha256:<digest>`), and the
  installer says so. Do not claim signature verification anywhere.

## Resource support matrix (one matrix, used everywhere)

| Resource profile | Installer minimum        | Recommended floor | Notes                                                                         |
| ---------------- | ------------------------ | ----------------- | ----------------------------------------------------------------------------- |
| Lean             | 1 GB RAM                 | 2 GB RAM          | Fits at 1 GB under measured fixture load; 1 GB is supported, not recommended. |
| Standard         | 2 GB RAM                 | 2 GB RAM          | Installer refuses below 2 GB.                                                 |
| Media            | 2 GB RAM (Standard rule) | —                 | Resource profile only; site features default to Standard.                     |
| Scale            | 2 GB RAM (Standard rule) | —                 | Resource profile only; site features default to Standard.                     |

Disk: ≥10 GB free required by preflight for every profile. The setup form
makes **no** memory claims; it reports the installed resource profile as an
installer-chosen fact and labels the two-value site feature profile as what
it is ("Site features": media processing + quality scanning on/off).

## Enrollment resume (setup state machine)

States: `incomplete → installing → complete`, unchanged. The change is what
`installing` permits:

- The browser that began enrollment holds an HttpOnly `renegade-setup`
  cookie containing the enrollment session token (hash stored server-side,
  15-minute expiry).
- While `installing`, presenting that cookie to the passkey-options call
  **rotates** the WebAuthn challenge and the enrollment session (fresh
  15-minute window) and returns fresh options. Cancelling the device prompt
  is therefore an ordinary retry, not a dead end.
- The bootstrap token is never restored or re-accepted once consumed.
  A wrong session is rejected as `INSTALLATION_IN_PROGRESS`; a wrong email
  as `INSTALLATION_INVALID`; an expired session as `INSTALLATION_EXPIRED`
  (operator recovery via `npm run installation:recover`).
- `/setup` renders a resume mode (prefilled owner email, no token field)
  only when state is `installing` **and** the request carries the cookie.
  Without the cookie, the locked screen and CLI recovery path are unchanged.
- Completion remains single-use and permanent: once `complete`, public
  setup never reopens.

## Recovery codes

- Codes are generated at completion, shown exactly once, stored only as
  hashes, and each code signs in exactly once.
- **Rotation is an in-product, owner-only operation**
  (`POST /api/auth/recovery/rotate`, Security settings in the admin): in one
  transaction it invalidates all unused codes, inserts a fresh set of 10,
  revokes the owner's _other_ admin sessions (the current session survives),
  and writes an audit record (`recovery_codes.rotated`). The fresh set is
  returned exactly once.
- The completion screen offers copy-all and download, and "Open Admin
  Studio" stays disabled until the operator checks "I saved these codes
  somewhere safe." The product does not claim to verify safe storage.
- The local CLI rotation script remains as the server-operator path for a
  fully locked-out owner.

## Status honesty

- Setup provider cards render only live data from `/api/setup/readiness`
  (real migration counts, real storage check). A failed check renders as
  failed with the recovery action; an unreachable check renders as
  "not checked", never as verified. The readiness API's own error fallback
  reports the real migration total.
- Nothing in the setup flow may present a capability, provider, or profile
  as verified/validated from static text.
