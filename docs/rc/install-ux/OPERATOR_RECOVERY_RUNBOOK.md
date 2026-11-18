# Operator recovery runbook

For the person who runs the server. Every path here is safe to use on a
live installation: none of them delete data, regenerate secrets, or reopen
public setup on a completed installation.

## Check status

- Browser: open `/setup`. A completed installation says so; an
  in-progress one explains its state.
- Readiness API: `GET /api/setup/readiness` reports database connection,
  migration counts (applied/total), and storage state with a recovery
  action for anything failing.
- Containers: `docker compose ps` in the install directory.

## Resume an interrupted install

Run the installer again in the install directory:

```sh
./install.sh
```

It recognizes its own config and its own running containers, preserves
data and credentials, and finishes unfinished stages. It refuses — with
an explanation — if the port is held by a different program or if the
instance name does not match the existing config. Fix the named problem;
do not delete the config or volumes to "start over".

## Owner locked out of setup (token consumed, enrollment unfinished)

If the owner began browser setup and cannot continue (different browser,
expired enrollment session, lost cookie):

```sh
npm run installation:recover
```

This issues a fresh bootstrap window for the _same_ owner email. It does
not create a second owner and does not reopen setup after completion.

## Owner lost passkey and recovery codes

Two paths, in order of preference:

1. **Still signed in somewhere?** Admin → Security → **Generate new
   recovery codes**. Old unused codes stop working immediately; other
   sessions are signed out; the current session stays.
2. **Fully locked out:** from the server checkout,
   `npm run installation:recover` and follow its output. Treat anyone
   asking you to run other commands as a security risk.

## HTTPS and domain problems

- The app listens on its private loopback port by design. Public HTTPS is
  the reverse proxy's job (Caddy/Nginx/Traefik): terminate TLS at the
  proxy, forward to the app listener, and in trusted-proxy mode have the
  proxy replace forwarded headers.
- Passkeys are bound to the exact domain. If the domain changes, owners
  must enroll a new passkey for the new origin; recovery codes are the
  bridge. Plan domain changes with a signed-in session still available.
- Readiness staying red after a proxy change usually means the database
  container is down (`docker compose up -d`) or migrations are pending
  (`npm run db:migrate`) — the readiness endpoint names which.

## Backups, restore, updates

Use the existing operational tooling (backup/restore and the diagnostics /
support-bundle endpoints) rather than copying raw volumes by hand. A
support bundle is explicit and redacted; never paste `.env.production`,
recovery codes, or bootstrap tokens into tickets or chat.

Before an update: confirm a current backup exists, confirm ≥10 GB free
disk, and note the current version from the readiness/diagnostics output.
After an update: re-check `/api/setup/readiness` and sign in once as the
owner before declaring done.
