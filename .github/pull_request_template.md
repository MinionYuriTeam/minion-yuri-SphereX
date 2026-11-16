<!-- Title: short and specific, e.g. "Loupe: follow the Gaia track" -->

Closes #

## What works now
<!-- What this PR does, and how you checked it (locally / on the deployed site). -->

## Ready for others
<!-- What teammates can now use: new components, endpoints, fields, props. -->

## Note
<!-- Gaps, known issues, follow-ups. Write "None" if there aren't any. -->

## Screenshots / GIF
<!-- For anything visible. Delete if not relevant. -->

## Checklist
- [ ] Branched off `main` and pulled the latest `main` in
- [ ] Works against the API contract (README → API)
- [ ] Frontend: no component fetches directly; calls go through `src/api/frames.js`
- [ ] Backend: the frontend only gets JSON and PNGs, no FITS
- [ ] API changed? Updated `backend/readme.md`, `public/mock/frames.json` and the README table
- [ ] No data or secrets committed (`backend/output/`, `.venv/`, `deploy/.env`)
- [ ] Added a line to `docs/changelog.md` if users or teammates will notice
