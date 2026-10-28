# Security Policy

## Supported versions

Security fixes are intended for the latest version of RRAnime. Upgrade to the latest release before reporting an issue against an older version.

## Reporting a vulnerability

Please report suspected security vulnerabilities privately. If this repository is hosted on GitHub and private vulnerability reporting is enabled, use the repository's **Security advisories** page to contact the maintainers. Otherwise, contact the project maintainer through the private contact method listed on the repository hosting service.

Please do not publish an unpatched vulnerability in a public issue, discussion, or pull request. Include the affected version or commit, the relevant deployment details, reproduction steps, and the potential impact. Do not include passwords, session cookies, API keys, personal data, or other live secrets in the report. The maintainers will investigate and coordinate any fix and disclosure.

## Deployment security

RRAnime currently uses a small, password-gated account model. Login passwords are supplied through `USER_1`, `USER_2`, and `USER_3`; the application does not provide public registration, individual password management, multi-factor authentication, or account recovery. Do not treat this setup as a substitute for a full identity and access management system for a public service.

For deployments:

- Keep `.env` and all production secrets out of source control. Use unique, strong values for each `USER_*` password and a long, randomly generated `SESSION_SECRET`.
- If a password, session secret, API credential, or database credential may have been exposed, rotate it promptly and invalidate affected sessions where possible.
- Serve the application over HTTPS. Session cookies are configured as secure, and the app trusts one reverse proxy; configure that proxy to set forwarding headers correctly and prevent direct untrusted access to the application server.
- Restrict database access to the application host, use a database account with only the required privileges, and maintain protected backups.
- Keep Node.js and installed dependencies current. Use the committed lockfile for repeatable installs (`npm ci`) and review dependency advisories before deploying updates.
- Treat MyAnimeList, AniList, the schedule data source, and the streaming embed providers as external services. Do not place secrets in client-side code or report vulnerabilities in those services as RRAnime issues unless the RRAnime integration creates the vulnerability.

## Scope

This policy covers the RRAnime application code and its deployment configuration. It includes authentication and sessions, server routes and APIs, database access, profile and comment features, notification handling, and browser-side code maintained in this repository.

