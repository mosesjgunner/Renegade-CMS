# Data classification

| Class      | Examples                                                   | Exposure rule                                              |
| ---------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| Public     | published title, public author credit, canonical URL       | Explicitly selected for public API/rendering               |
| Member     | profile preferences, subscriptions                         | Principal or specifically authorized staff only            |
| Staff      | drafts, workflow notes, admin email                        | Authenticated staff policy only                            |
| Secret     | Payload secret, passwords, tokens, database credentials    | Never serialize or log; environment/secret store only      |
| Restricted | IP-derived abuse evidence, financial/security/audit detail | Narrow purpose, redacted diagnostics and bounded retention |

Persistence records are private by default. Public projections are separate typed values assembled through allowlists.
