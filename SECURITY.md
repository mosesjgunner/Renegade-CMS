# Security Policy

The Renegade CMoS team takes security and sovereign data protection seriously. As a self-hosted platform handling authentication, media assets, personal identity, and commerce, maintaining robust defenses against vulnerabilities is a top priority.

---

## Supported Versions

Only the latest active minor release receives official security patches:

| Version        | Supported                    |
| -------------- | ---------------------------- |
| `0.1.0-beta.x` | :white_check_mark: Supported |
| `< 0.1.0`      | :x: Unsupported              |

---

## Reporting a Vulnerability

If you discover a security vulnerability in Renegade CMoS, please **do not open a public GitHub issue**. Disclosing vulnerabilities publicly puts existing installations at risk.

Instead, report vulnerabilities responsibly via:

1. **GitHub Private Security Advisory**: Use the [Security Advisories](https://github.com/mosesjgunner/Renegade-CMS/security/advisories/new) feature on GitHub.
2. **Security Contact**: Email our core security team at `security@renegadeparty.org`.

### What to Include in Your Report

To help us triage and resolve the issue quickly, please provide:

- A detailed description of the vulnerability and its potential impact.
- Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
- Affected versions, endpoints, or modules (e.g. `src/modules/commerce`, WebAuthn passkey flow, etc.).
- Any suggested mitigations or patches if you have them.

### Response Timeline

- **Initial Acknowledgment:** Within 48 hours of receipt.
- **Triage & Assessment:** Within 5 business days.
- **Resolution & Disclosure:** We will work with you to test and release a patch before public disclosure.

---

## Security Architecture & Defenses

Renegade CMoS incorporates defense-in-depth protections across all layers:

- **Authentication**: Passwordless WebAuthn passkeys (FIDO2) with virtual authenticator isolation and nonces.
- **Data Privacy**: Member PII boundaries, mutual block isolation, and anonymous donation walls.
- **Commerce Integrity**: Server-authoritative totals calculation, tamper-evident checkout proposal hashes, and cryptographic webhook signature verification.
- **Network Boundaries**: Strict URL validation blocking open redirects and SSRF attacks; direct internal PostgreSQL networking on Docker without published host ports in production.
- **Asset Security**: MIME validation, Sharp image sanitize pipeline, and signed private media download tokens.
