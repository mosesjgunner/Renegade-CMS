# UXI-04 — Close the HTTPS and claim gap

Goal: trusted public HTTPS and a secure claim handoff.
Done: claim token retrieval reduced to a one-line grep of the web container's log (no full log dump). The installer's existing proxy-boundary guidance and the completion screen's HTTPS section were verified as present and accurate.
Blocked: public HTTPS proof — no domain/host authority in this environment. DNS/cert/proxy failure-injection cases were NOT run. The claim token still travels via server logs to the operator (operator-only channel); a fragment-based browser handoff was not implemented and remains an open design item, recorded honestly rather than papered over.
