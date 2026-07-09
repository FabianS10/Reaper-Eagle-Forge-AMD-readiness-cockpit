# Reaper Eagle Forge ML

**AMD-readiness and benchmark-truth auditor for machine-learning repositories.**

[![Hackathon](https://img.shields.io/badge/AMD_Hackathon-Act_II-DAA520?style=flat-square)]()
[![Stack](https://img.shields.io/badge/stack-FastAPI_%2B_React%2FVite-1a1a1a?style=flat-square)]()
[![Hardware](https://img.shields.io/badge/verified_on-MI300X-DAA520?style=flat-square)]()

Reaper Eagle Forge ML turns CUDA-centered ML repos and benchmark claims into auditable AMD-readiness evidence packages. It is built as a product, not a raw benchmark contest: the MI300X evidence proves the system is real and complete, while the value proposition is migration confidence, benchmark discipline, and honest claim boundaries.

> Most migration tools tell developers what to change. Forge tells teams what they are allowed to claim.

---

## Table of contents

- [Hackathon positioning](#hackathon-positioning)
- [System architecture](#system-architecture)
- [What is included](#what-is-included)
- [Scope: what Forge does and does not do](#scope-what-forge-does-and-does-not-do)
- [Trust boundaries](#trust-boundaries)
- [Evidence pipeline](#evidence-pipeline)
- [Deployment architecture](#deployment-architecture)
- [Run locally](#run-locally)
- [Docker Compose](#docker-compose)
- [Capture an MI300X evidence capsule](#capture-an-mi300x-evidence-capsule)
- [Hackathon demo arc](#hackathon-demo-arc)
- [Roadmap, not MVP](#roadmap-not-mvp)

---

## Hackathon positioning

Forge is built for startup-style judging: creativity, originality, completeness, use of AMD platforms, and product/market potential.

| | |
|---|---|
| **Problem** | ML teams are trapped between CUDA gravity, GPU scarcity/cost, and benchmark claims that are difficult to reproduce. |
| **User** | ML infrastructure teams, AI startups, research labs, and consultants evaluating whether a CUDA-centered workload can move to AMD. |
| **Wedge** | Scan the repo before expensive migration work begins, then produce a bounded readiness score and evidence package. |
| **AMD proof layer** | Live fixed ROCm diagnostics when available, plus captured MI300X evidence replay with raw logs and a SHA-256 manifest. |
| **Differentiation** | Not a generic CUDA-to-ROCm copilot and not a raw speed leaderboard. Forge audits portability, benchmark integrity, evidence completeness, and claim discipline. |

**Money line:**

> Forge does not ask judges to trust benchmark claims. It shows the code path, the hardware path, the evidence path, and the uncertainty.

---

## System architecture

```mermaid
flowchart LR
    subgraph Client["Frontend — React / Vite"]
        UI[Reaper Eagle black/gold dashboard]
        Topo[Custom canvas 3D topology projection]
        Report[Decision Report view]
    end

    subgraph Server["Backend — FastAPI"]
        Scanner[GitHub Repo Static Scanner]
        Taxonomy[CUDA/NVIDIA Lock-in Taxonomy]
        Score[Multi-axis Forge Score Engine]
        Ledger[Claim Ledger]
        LiveCheck[Live AMD Environment Check<br/>fixed enum diagnostics, shell=False]
        Replay[Evidence Replay Engine]
    end

    subgraph Evidence["Evidence Store"]
        Capsule[MI300X Evidence Capsule<br/>raw logs + SHA-256 manifest]
    end

    GH[(GitHub Repo URL)] --> Scanner
    Scanner --> Taxonomy --> Score
    Score --> Ledger --> Report
    LiveCheck -.optional, host-dependent.-> Score
    Capsule --> Replay --> Report
    UI --> Topo
    UI --> Report

    style Client fill:#1a1a1a,stroke:#DAA520,color:#eee
    style Server fill:#1a1a1a,stroke:#DAA520,color:#eee
    style Evidence fill:#1a1a1a,stroke:#DAA520,color:#eee
```

---

## What is included

| Component | Detail |
|---|---|
| Backend | FastAPI |
| Frontend | React/Vite with Reaper Eagle black/gold structural chrome |
| Styling | CSS variable palette separating brand chrome from status semantics |
| Scanner | GitHub repo static scanner |
| Taxonomy | CUDA/NVIDIA lock-in taxonomy |
| Scoring | Multi-axis Forge score — portability, benchmark integrity, evidence completeness, claim discipline |
| Claim system | Claim ledger: verified claims, allowed claims, blocked claims, required next evidence |
| Live diagnostics | Live AMD environment check using fixed enum diagnostics |
| Replay | Evidence Replay mode for captured MI300X artifacts |
| Visualization | Custom canvas-based 3D topology projection (no WebGL/three.js dependency to ship) |
| Reporting | Deterministic Decision Report fallback |
| Samples | Broken/fixed benchmark samples |
| Evidence tooling | Evidence capsule structure and capture script |
| Packaging | Docker Compose submission path |

---

## Scope: what Forge does and does not do

Forge ML audits a machine-learning repository and produces an AMD-readiness evidence package. The current MVP checks static repository files for CUDA/NVIDIA assumptions, benchmark-discipline weaknesses, missing evidence artifacts, and overbroad claims.

| Supported now (MVP) | Not supported yet (by design) |
|---|---|
| GitHub URL ingestion | Arbitrary user-code execution |
| Static repository analysis | Automatic patch generation |
| Fixed server-side ROCm/PyTorch diagnostics | Graphics/shader workflows |
| Captured MI300X evidence replay | Local ZIP/folder ingestion |
| Report generation from structured findings | Universal performance certification |
| | Unmeasured claims that AMD beats NVIDIA on every workload |
| | Executing scanned repository code, or installing its dependencies |
| | Certifying production readiness without human review |

**Why this boundary matters:** a migration tool that overclaims can become benchmark theater. Forge is designed to refuse unmeasured claims. Its value is not just detection — it's the boundary between what is verified, what is risky, and what remains unknown.

---

## Trust boundaries

| Mode | Boundary |
|---|---|
| **Repo Scan** | Static analysis only. The scanned repository's code is never executed. |
| **Live AMD Check** | Forge-owned diagnostics only, selected by enum and resolved server-side to fixed `argv` lists with `shell=False`, timeouts, output caps, non-root execution, and rate limits. |
| **Known Benchmark** | Fixed script baked into the backend image. |
| **Evidence Replay** | Captured logs and benchmark artifacts, clearly labeled as replayed evidence, never presented as a live GPU session. |

```mermaid
flowchart TD
    A["Untrusted input:<br/>scanned repo code"] -->|never executed| X["❌ blocked"]
    B["Forge-owned diagnostic enum"] -->|resolved server-side, shell=False,<br/>timeout + output cap + non-root| C["✅ Live AMD Check result"]
    D["Captured MI300X capsule<br/>+ SHA-256 manifest"] -->|labeled 'replayed evidence'| E["✅ Evidence Replay result"]

    style X fill:#3a1414,stroke:#b33,color:#eee
    style C fill:#14261a,stroke:#DAA520,color:#eee
    style E fill:#14261a,stroke:#DAA520,color:#eee
```

---

## Evidence pipeline

```mermaid
sequenceDiagram
    participant Judge as Judge / User
    participant UI as Frontend
    participant API as FastAPI Backend
    participant Host as Deployment Host (Railway/ netlify)
    participant MI300X as MI300X Capsule (pre-captured)

    Judge->>UI: Submit GitHub repo URL
    UI->>API: POST /scan
    API->>API: Static analysis + taxonomy match
    API-->>UI: Portability / Integrity / Completeness / Claim scores
    Judge->>UI: Trigger Live AMD Check
    UI->>API: Run fixed diagnostic enum
    API->>Host: rocminfo / rocm-smi (if present)
    Host-->>API: result or "not_available"
    API-->>UI: Honest status (no GPU spoofing)
    Judge->>UI: Open Evidence Replay
    UI->>MI300X: Load captured logs + manifest
    MI300X-->>UI: Verified real-hardware evidence, labeled as replay
    UI-->>Judge: Decision Report — what's claimed, blocked, and next
```

---

## Deployment architecture

**Why not just deploy the whole app on the MI300X box?**

AMD Developer Cloud MI300X instances are allocated for the hackathon window — they are not meant as a permanent host. If the public prototype URL lived there and the instance got reclaimed or rebooted mid-judging, the demo would die. Fly.io (the original plan) or an equivalent like Railway/Render stays up regardless of what happens to the GPU allocation, and that's what `docker-compose.yml` and the Dockerfiles are already built for.

```mermaid
flowchart LR
    subgraph MI["MI300X Box — used once/twice, pre-submission"]
        Cap[Capture real evidence capsule]
        Rec[Optional: screen-record a live<br/>Live AMD Check pass for the demo video]
    end

    subgraph Perm["Railway/ netlify — the permanent judged deployment"]
        BE[Backend]
        FE[Frontend]
        LiveP[Live Check reports 'not_available' /<br/>'cpu_only_runtime' — honestly, no ROCm on host]
        ReplayP[Evidence Replay carries the<br/>'proven on real MI300X' claim]
    end

    Cap -->|copy capsule + regenerate SHA-256| ReplayP
    Rec -.reference for video only.-> Perm

    style MI fill:#1a1a1a,stroke:#888,color:#ccc
    style Perm fill:#1a1a1a,stroke:#DAA520,color:#eee
```

| Host | Role | GPU present? | Live AMD Check result |
|---|---|---|---|
| **MI300X (AMD Developer Cloud)** | One-time evidence capture, optional video recording | Yes | Real pass, used to produce the capsule — not the live judged URL |
| **Railway and netlify (or equivalent)** | Permanent backend + frontend judges click into | No | Honestly reports `not_available` / `cpu_only_runtime` |

This split is consistent with Forge's own claim-discipline pitch: the live deployment never pretends to have GPU access it doesn't have. Evidence Replay is what carries the "proven on real MI300X hardware" claim — clearly labeled as replay, exactly as this document states above.

---

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

---

## Docker Compose

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | `http://localhost:5173` |
| Backend health | `http://localhost:8000/api/health` |

---

## Capture an MI300X evidence capsule

On the AMD Developer Cloud machine, from the project root:

```bash
./scripts/capture_mi300x_evidence.sh forge_evidence_capture
```

Then copy the captured folder into:

- `backend/evidence/`
- `frontend/public/forge_evidence/`

Regenerate the SHA-256 manifest after replacing placeholder files.

---

## Hackathon demo arc

1. Load the broken CUDA-shaped benchmark repo.
2. Forge flags hardcoded CUDA, `nvidia-smi`, missing synchronization, missing p50/p95, and missing evidence artifacts.
3. The dashboard produces portability, benchmark-integrity, evidence-completeness, and claim-discipline scores.
4. Evidence Replay shows captured MI300X artifacts while explicitly labeling them as replayed evidence, not live hardware.
5. The Decision Report states what can be claimed, what is blocked, and what proof comes next.

---

## Roadmap, not MVP

- Automatic patch suggestions
- ZIP/local folder ingestion
- CI/GitHub PR comments
- More ROCm profiler adapters
- vLLM-specific optimization recipes
- Container generation for scanned repositories
- Reaper Eagle Forge Studio for graphics/shaders/real-time rendering
