# Beginner quick start

The shortest accurate path from nothing to a working site. Two roles:
a **server operator** runs one install command; the **owner** finishes in
the browser. If someone else runs the server for you, skip to step 3.

## 1. What you need

- A Linux server (or VM) with Docker available, at least 2 GB of memory
  recommended (1 GB works for the Lean profile but is not recommended),
  and 10 GB of free disk.
- A domain name pointing at the server if you want a public address now.
  You can finish setup without one and add it later.

## 2. Install (server operator, ~one command)

```sh
./install.sh --app-url https://your-domain.example
```

The installer checks the machine first and tells you exactly what is
missing if anything is. When it finishes it prints your site address and
a one-line command to retrieve the one-time setup token. Keep that token
private — it is shown to whoever runs that command on the server.

Already installed and something interrupted you? Run the same command
again. The installer recognizes its own running installation and safely
continues; it will not wipe or replace anything.

## 3. Finish in the browser (owner, ~five minutes)

1. Open the setup address the installer printed.
2. Paste the one-time token and confirm your email.
3. Name your site. The short address (slug), language, and timezone are
   filled in for you — change them only if they are wrong.
4. Pick a look, or keep the default.
5. Keep the default site features. The database and storage status on
   this step is checked live; if anything shows red, the card says what
   to do.
6. Review, then create your passkey when your device asks. **If you
   cancel the passkey prompt, nothing is lost** — press the button again
   and finish. Your answers stay on the page.
7. Save your recovery codes: use **Copy all codes** or **Download as
   file**, put them in your password manager, tick the box, and open the
   Admin Studio.

## 4. If something goes wrong

- **Closed the setup tab mid-way?** Reopen the setup address in the same
  browser — setup resumes where you left it.
- **Lost the recovery codes screen?** Sign in, open **Security**
  settings, and choose **Generate new recovery codes**. The old codes
  stop working; save the new set.
- **Locked out completely (no passkey, no codes)?** Whoever runs the
  server uses the operator recovery command:
  `npm run installation:recover`
- **Server trouble, updates, backups:** see
  `OPERATOR_RECOVERY_RUNBOOK.md` in this folder.
