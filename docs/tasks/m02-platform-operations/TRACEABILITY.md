# M02 traceability

| Requirement                                       | Task | Evidence                                      |
| ------------------------------------------------- | ---- | --------------------------------------------- |
| Typed production config, proxy and cookies        | 01   | unit tests, config docs, production rejection |
| Locked first-run install and recovery             | 02   | route/integration/restart tests               |
| Durable scheduled/retrying jobs                   | 03   | Payload job integration and restart proof     |
| Minimal/public and rich/private diagnostics       | 04   | route/auth/database tests                     |
| Backup, retention and restore                     | 05   | disposable restore drill output               |
| VPS image, worker, proxy and rollback conventions | 06   | Compose/build/smoke and operations docs       |
