# Background jobs

Payload Jobs stores Renegade's M02 queue in PostgreSQL. The web process never starts an in-process autorunner. A dedicated process runs the same application image and configuration:

```powershell
npm run jobs:worker
```

The worker checks the `operations` queue every ten seconds, handles recurring schedules and processes retained jobs FIFO. Run one cycle for diagnostics with:

```powershell
npm run payload -- jobs:run --queue operations --handle-schedules
```

The harmless `operations-heartbeat` task is scheduled every five minutes. `operations-forced-failure` exists only as a proof fixture: it records three attempts with 100 ms exponential backoff and ends in a visible failed state. Do not queue it in routine production operation.

The Payload admin shows **System → Payload Jobs** to authenticated staff. Successful jobs are retained for operational evidence. Queue, run and cancellation HTTP operations require authentication; product actions must enforce owner/capability policy before calling Local API, which overrides access by default.

Concurrency keys are the M02 idempotency boundary. Later external tasks must also store provider-specific idempotency and reconciliation data. Queued jobs may be cancelled. A running task is cancelled only at documented safe checkpoints; terminating a worker relies on persisted state and task idempotency during recovery.
