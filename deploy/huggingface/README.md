---
title: Minion Yuri SPHEREx API
emoji: 🔭
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
short_description: Aligned, stacked NASA SPHEREx images of any patch of sky
---

# Minion Yuri – SPHEREx API

Backend for **SPHEREx Blink** (NASA Space Apps 2026). Give it a sky position and
it returns aligned, stacked NASA SPHEREx images of that patch, one per visit,
as JSON and PNGs.

- `GET /api/frames?ra=&dec=&fov=&array=`: frames for one patch on one detector array
- `GET /api/resolve?name=`: name or coordinates → RA/Dec (+ proper motion)
- `GET /api/health`
- `/docs`: try every endpoint in the browser

Source code and documentation: https://github.com/rsinghSD/minion-yuri-SphereX

This research has made use of the NASA/IPAC Infrared Science Archive (IRSA),
which is funded by NASA and operated by the California Institute of Technology.
Name lookups by CDS Sesame (SIMBAD, NED, VizieR), Strasbourg, France.
