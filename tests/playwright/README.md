# Browser test configurations

Playwright runs automated browser checks. These configurations select different suites and runtime boundaries; they are test source, not generated output.

Run commands from the repository root. The default `playwright.config.ts` remains there for `npm run test:browser`. Specialized configurations live here:

```sh
npx playwright test -c tests/playwright/playwright.production.config.ts --list
```

Use `npx.cmd` on Windows PowerShell. `--list` discovers tests without running browser workflows.

| Configuration                                                   | Purpose                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `playwright.production.config.ts`                               | Production browser checks                                                |
| `playwright.disc03.config.ts`                                   | Discovery checks                                                         |
| `playwright.01b.config.ts`, `playwright.01c.config.ts`          | RC1 owner and profile acceptance                                         |
| `playwright.r01b.config.ts`, `playwright.r01b.local.config.ts`  | Owner recovery acceptance; Docker and local variants                     |
| `playwright.rc01.config.ts` through `playwright.rc04.config.ts` | Historical release acceptance suites                                     |
| `playwright.rc08b.config.ts`                                    | Historical RC-08B checks                                                 |
| `playwright.rc1.config.ts`                                      | RC1 checks requiring explicit disposable database, media and TLS targets |

Historical configurations may require their original `.env.rc*` files, certificates, runtime and isolated resources. Old local environment files were archived under `../_archive/environments/` relative to the repository directory. Restore the specific file to its original root filename before reproducing that historical setup. These private files are not part of Git; a fresh clone needs its own configuration.

Ordinary local development uses `.env`; deployment uses `.env.production`. Their tracked `.example` counterparts document setup. Do not combine environment files: they can identify different databases, tenants and secrets. Test discovery alone does not establish workflow acceptance.
