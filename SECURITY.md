# Security Policy

## Supported Versions

Favewise 1.x is supported from the 1.0.0 public release onward. Security fixes are applied to the `main` branch and the latest tagged release.

| Version | Supported |
|---|---|
| 1.x | Yes |

## Reporting a Vulnerability

Please do not open a public issue for a suspected vulnerability.

Email security reports to `security@joyx.io` with:

- a short summary of the issue
- affected version, browser, and operating system
- steps to reproduce or a proof of concept
- expected impact, including whether bookmark data, permissions, storage, or extension UI integrity is affected

We aim to acknowledge reports within 7 days. Fix timelines depend on severity, exploitability, and browser-store review requirements.

## Security Scope

Reports are especially useful for:

- excessive or incorrectly scoped extension permissions
- bookmark data exposure outside the local browser profile
- unsafe backup import/export behavior
- XSS, script injection, or unsafe HTML rendering in extension pages
- dead-link checking behavior that could access local/private network URLs
- supply-chain or build pipeline issues

## Out of Scope

The following are usually out of scope unless they demonstrate a concrete exploit in Favewise:

- issues requiring full control of the user's browser profile or device
- browser bugs unrelated to extension behavior
- denial-of-service reports that only require extremely large local bookmark sets and do not corrupt data
- social engineering or phishing using unofficial forks

## Disclosure

Please give maintainers a reasonable opportunity to investigate and release a fix before public disclosure.
