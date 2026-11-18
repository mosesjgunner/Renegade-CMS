# UXI-03 — Finish the installation entry point
Goal: one supported bootstrap; safe reruns; a prebuilt-artifact path.
Done: rerun recognizes its own running deployment (own-listener port exemption); foreign listener and instance mismatch still refused; `--image` prebuilt path (pull, never build; refused on reruns); Lean <2 GB recommendation note; claim one-liner replaces the log dump. Proven by tests/installer/install-sh.test.sh, 12/12 with stubbed docker/ss.
Blocked: real-host Docker proof — no Docker daemon in the execution environment. Signatures: none exist upstream; digest pinning is the documented verification. Do not claim otherwise.
