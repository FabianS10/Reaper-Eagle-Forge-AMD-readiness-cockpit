# Reaper Eagle Forge ML

**AMD-readiness and benchmark-truth auditor for machine-learning repositories.**

Reaper Eagle Forge ML turns CUDA-centered ML repos and benchmark claims into auditable AMD-readiness evidence packages. It is intentionally framed as a product, not a raw benchmark contest: the MI300X evidence proves the system is real and complete, while the value proposition is migration confidence, benchmark discipline, and honest claim boundaries.

> Most migration tools tell developers what to change. Forge tells teams what they are allowed to claim.

## Hackathon positioning

Forge is designed for startup-style judging: creativity, originality, completeness, use of AMD platforms, and product/market potential.

- **Problem:** ML teams are trapped between CUDA gravity, GPU scarcity/cost, and benchmark claims that are difficult to reproduce.
- **User:** ML infrastructure teams, AI startups, research labs, and consultants evaluating whether a CUDA-centered workload can move to AMD.
- **Wedge:** scan the repo before expensive migration work begins, then produce a bounded readiness score and evidence package.
- **AMD proof layer:** live fixed ROCm diagnostics when available, plus captured MI300X evidence replay with raw logs and SHA-256 manifest.
- **Differentiation:** not a generic CUDA-to-ROCm copilot and not a raw speed leaderboard. Forge audits portability, benchmark integrity, evidence completeness, and claim discipline.

## What is included

- FastAPI backend
- React/Vite frontend with Reaper Eagle black/gold structural chrome
- CSS variable palette separating brand chrome from status semantics
- GitHub repo static scanner
- CUDA/NVIDIA lock-in taxonomy
- Multi-axis Forge score:
  - portability
  - benchmark integrity
  - evidence completeness
  - claim discipline
- Claim ledger: verified claims, allowed claims, blocked claims, required next evidence
- Live AMD environment check using fixed enum diagnostics
- Evidence Replay mode for captured MI300X artifacts
- Custom canvas-based 3D topology projection (no WebGL/three.js dependency to ship)
- Deterministic Decision Report fallback
- Broken/fixed benchmark samples
- Evidence capsule structure and capture script
- Docker Compose submission path

## MVP scope

Forge ML currently supports:

- GitHub URL ingestion only
- static repository analysis only
- fixed server-side ROCm/PyTorch diagnostics only
- captured MI300X evidence replay
- report generation from structured findings

Forge ML does **not** currently support:

- arbitrary user-code execution
- automatic patch generation
- graphics/shader workflows
- local ZIP/folder ingestion
- universal performance certification
- unmeasured claims that AMD beats NVIDIA on every workload

## Trust boundaries

Forge never executes user-submitted repository code.

- **Repo Scan:** static analysis only.
- **Live AMD Check:** Forge-owned diagnostics only, selected by enum and resolved server-side to fixed `argv` lists with `shell=False`, timeouts, output caps, non-root execution, and rate limits.
- **Known Benchmark:** fixed script baked into the backend image.
- **Evidence Replay:** captured logs and benchmark artifacts, clearly labeled as replayed evidence.

## Run locally

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Docker Compose

```bash
docker compose up --build
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:8000/api/health`

## Capture an MI300X evidence capsule

On the AMD Developer Cloud machine, from the project root:

```bash
./scripts/capture_mi300x_evidence.sh forge_evidence_capture
```

Then copy the captured folder into:

- `backend/evidence/`
- `frontend/public/forge_evidence/`

Regenerate the SHA-256 manifest after replacing placeholder files.

## Hackathon demo arc

1. Load the broken CUDA-shaped benchmark repo.
2. Forge flags hardcoded CUDA, `nvidia-smi`, missing synchronization, missing p50/p95, and missing evidence artifacts.
3. The dashboard produces portability, benchmark-integrity, evidence-completeness, and claim-discipline scores.
4. Evidence Replay shows captured MI300X artifacts while explicitly labeling them as replayed evidence, not live hardware.
5. The Decision Report states what can be claimed, what is blocked, and what proof comes next.

Money line:

> Forge does not ask judges to trust benchmark claims. It shows the code path, the hardware path, the evidence path, and the uncertainty.

## Roadmap, not MVP

- Automatic patch suggestions
- ZIP/local folder ingestion
- CI/GitHub PR comments
- More ROCm profiler adapters
- vLLM-specific optimization recipes
- Container generation for scanned repositories
- Reaper Eagle Forge Studio for graphics/shaders/real-time rendering
