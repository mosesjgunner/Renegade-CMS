# Documentation

Start with the guide that matches your task. Dated reports describe the source and environment tested at that time; consult the release ledger for scoped results and outstanding work.

## Getting started

- [Project overview and local setup](../README.md)
- [Contributing and development checks](../CONTRIBUTING.md)
- [Security policy](../SECURITY.md)
- [Production deployment](PRODUCTION_DEPLOYMENT.md)
- [Backup and restore](OPERATIONAL_BACKUP.md)
- [Import and export](IMPORT_EXPORT.md)
- [Public API and webhooks](PUBLIC_API_WEBHOOKS.md)

## Current work and release tracking

- [RC1 subpass ledger](rc/RC1-70-SUBPASS-LEDGER.md)
- [Beta interface and UX audit](beta/GUI-01A-UX-AUDIT.md)
- [Release notes and historical limitations](release/BETA_RELEASE_NOTES.md)
- [Project state and audit history](../PROJECT_STATE.md)

## Reference areas

| Area                                                      | Contents                                   |
| --------------------------------------------------------- | ------------------------------------------ |
| [Architecture](architecture/) and [decisions](decisions/) | System design and architectural decisions  |
| [Editorial](editorial/) and [presentation](presentation/) | Publishing, authoring and page layout      |
| [Media](media/) and [discovery](discovery/)               | Assets, metadata, search and distribution  |
| [Audience](audience/) and [commerce](commerce/)           | Audience workflows and commerce contracts  |
| [Operations](operations/)                                 | Operator procedures and recovery           |
| [Requirements](requirements/) and [research](research/)   | Product requirements and investigations    |
| [Tasks](tasks/) and [execution](execution/)               | Implementation plans and execution records |
| [Audits](audits/), [evidence](evidence/) and [RC](rc/)    | Retained verification reports and receipts |

## Repository hygiene

Keep source, tests, configuration examples and referenced evidence in Git. Local environment files, uploaded media, database backups, dependency directories, build output and disposable test reports belong outside the published tree and are excluded by `.gitignore`.

Historical acceptance receipts and the beta audit screenshots are intentional documentation assets. Preserve their original paths and bytes so existing links and source-bound reports remain inspectable. Personal editor settings must never contain credentials in tracked files.
