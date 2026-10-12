# Local owner recovery

If the owner has lost both their passkey device and saved recovery codes, a server operator with access to the deployment environment can issue replacement recovery codes. Run this from the deployed checkout with its actual database and Payload secret configured:

```powershell
npm.cmd run installation:recover -- --owner-email owner@example.com --confirm-rotate-owner-codes
```

The email must identify an existing owner. This command invalidates that owner's previous recovery codes, revokes their admin sessions, and records `owner.local_recovery_codes.rotated` in the authentication audit. It does not reopen setup, create a user, change site grants, or remove passkeys. Treat terminal output as credentials: keep the ten codes offline and out of logs, tickets, and source control.

Use one code on `/login` under **Emergency Recovery Code**, then add a replacement passkey in **Security**. Each recovery code works once. Remove lost passkeys through Security after enrolling the replacement.

Without the owner arguments, `installation:recover` retains its incomplete-installation bootstrap recovery behavior. Completed installations remain locked.
