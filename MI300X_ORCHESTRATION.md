# MI300X Orchestration

Two separate jobs were getting conflated: **(1) capturing real MI300X evidence**
and **(2) hosting the public prototype URL**. They don't have to run on the same
machine, and for this hackathon they shouldn't.

## Why not just deploy the whole app on the MI300X box

AMD Developer Cloud MI300X instances are allocated for the hackathon window,
not meant as a permanent host. If the public prototype URL lives there and the
instance gets reclaimed/rebooted mid-judging, the demo dies. Fly.io (your
original plan) or Railway/Render stay up regardless of what happens to the GPU
allocation, and that's what `docker-compose.yml` / the Dockerfiles are already
built for.

The recommended split:

1. **MI300X box**: used once (or a couple of times before submission) to
   capture a real evidence capsule, and optionally to screen-record a live
   `Live AMD Check` pass for the video. Nothing on it needs to stay running.
2. **Fly.io (or equivalent)**: hosts the actual backend + frontend that judges
   click into. On that host, `rocminfo`/`rocm-smi`/etc genuinely won't exist,
   so Live Check will honestly report `not_available` / `cpu_only_runtime` —
   which is consistent with the product's own claim-discipline pitch: it's not
   pretending to have GPU access it doesn't have. Evidence Replay is what
   carries the "this was proven on real MI300X hardware" claim, clearly
   labeled as replay, exactly as SCOPE.md already states.

If you specifically want judges to see a **live** ROCm check pass during
judging (not just replay), that has to happen in the video or a live screen
share from the MI300X terminal — not from the public URL — because Live Check
is intentionally scoped to run wherever the backend process lives.

## Step 1 — Capture a real evidence capsule on the MI300X

The capture script was incomplete: it only wrote `environment/`, `benchmark/`,
and `profiler/` raw output. It never generated `scanner/`, `topology/`, or
`report/` — those were being hand-filled, which is how `backend/evidence/` and
`frontend/public/forge_evidence/` could silently drift out of sync. I added
`scripts/build_evidence_extras.py`, which generates those three from the same
backend code the live app uses (not hand-written JSON), and wired it into
`capture_mi300x_evidence.sh` so one command produces the full capsule.

On the AMD Developer Cloud instance:

```bash
git clone <your-repo-url> reaper-eagle-forge-ml
cd reaper-eagle-forge-ml

python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

./scripts/capture_mi300x_evidence.sh forge_evidence_capture
```

This now writes all seven sections (`environment/`, `benchmark/`, `profiler/`,
`scanner/`, `topology/`, `report/`, `integrity/`) plus `run_metadata.json`,
with a SHA-256 manifest computed last so it covers every file.

Copy it back to your dev machine:

```bash
scp -r user@mi300x-host:~/reaper-eagle-forge-ml/forge_evidence_capture ./forge_evidence_capture
```

Then replace both copies (this dual-copy step is the one part of the pipeline
that's still manual — see the note at the bottom):

```bash
rm -rf backend/evidence frontend/public/forge_evidence
cp -r forge_evidence_capture backend/evidence
cp -r forge_evidence_capture frontend/public/forge_evidence
```

Sanity-check before committing:

```bash
curl -s http://localhost:8000/api/evidence/replay | python3 -m json.tool | head -20
```

## Step 2 — Deploy the persistent prototype

You already have the Dockerfiles and `docker-compose.yml` needed for this;
there's no `fly.toml` in the archive yet, which is the actual gap. Fly.io
deploy from the repo root, once you have `flyctl` installed and are logged in:

```bash
fly launch --dockerfile backend/Dockerfile --name reaper-eagle-forge-backend --no-deploy
fly deploy --config fly.backend.toml   # or whatever launch generates

fly launch --dockerfile frontend/Dockerfile --name reaper-eagle-forge-frontend --no-deploy
fly deploy --build-arg VITE_API_BASE=https://reaper-eagle-forge-backend.fly.dev --config fly.frontend.toml
```

The frontend bakes `VITE_API_BASE` in at build time (see
`FRONTEND_BUILD_FIX.md`), so the backend needs a stable URL *before* you build
the frontend image — deploy backend first, then point the frontend build arg
at it.

I didn't fabricate `fly.toml` files myself since I can't verify app names,
region, or your Fly account state from here — that's a five-minute
`fly launch` on your side once you're happy with everything else.

## Note: the dual evidence-copy step

Keeping `backend/evidence/` and `frontend/public/forge_evidence/` as two
manually-synced copies is a real drift risk — it's how `topology_graph.json`
ended up hand-authored in the first place. If you want, the frontend doesn't
need its own copy at all: `EvidenceReplay.tsx` already tries `/api/evidence/*`
first and only falls back to the static `/forge_evidence/*` path if the API
call fails. Dropping `frontend/public/forge_evidence/` entirely and always
serving evidence through the backend would remove the second copy as a source
of truth — say the word if you want that wired up.
