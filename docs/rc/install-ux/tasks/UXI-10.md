# UXI-10 — Make optional capabilities easy to connect

Done on the setup spine: optional connections in setup remain explicitly "Skippable / unconfigured until verified in Admin Studio" — no success is claimed before validation, and the readiness API reports optional providers (email, analytics, AI) as configured/unconfigured from real environment state. The full connect→verify→activate pattern per provider belongs to the provider passes (email: RC3-EMAIL-01).
