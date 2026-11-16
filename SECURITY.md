# Security Policy

## Supported versions

Only the latest `main` branch, which is what https://stealingthemoon.earth is
built from, gets security fixes.

| Version | Supported |
|---|---|
| `main` / the live site | ✅ |
| Older commits, forks | ❌ |

## What's in scope

- The React frontend (`frontend/minion-yuri/`) and the live site.
- The FastAPI backend (`backend/`), including when a visitor runs it on their
  own computer for the public site (see the README's
  [Public Site](README.md#the-public-site-built-in-targets--your-own-backend)
  section). Things we especially want to hear about:
  - a web page being able to use a visitor's local backend to read or write
    files outside `backend/output/`;
  - path traversal through `/files/...` or any query parameter;
  - requests that make the backend fetch arbitrary URLs (SSRF);
  - anything in the `?api=` override that lets a link run script on the site.
- The deploy scripts (`deploy/`), e.g. a way they could leak `HF_TOKEN`.

Out of scope: NASA IRSA, AWS S3, CDS Sesame, Gaia, Vercel and Hugging Face
themselves. Report problems with those to their owners.

## Reporting a vulnerability

**Please don't open a public issue.** Instead:

1. Go to the repository's **Security** tab → **Report a vulnerability**
   (GitHub private vulnerability reporting), or
2. message a maintainer privately (see the [Team](README.md#team)).

Include what you found, how to reproduce it, and what an attacker could do
with it. You'll hear back within **7 days**. We'll tell you when it's fixed and
credit you in the [changelog](docs/changelog.md) unless you'd rather stay
anonymous.

## For contributors

- Never commit `deploy/.env`, tokens or passwords. If you do by accident,
  revoke the token straight away (rewriting history isn't enough).
- Keep the backend's file serving limited to `backend/output/`.
