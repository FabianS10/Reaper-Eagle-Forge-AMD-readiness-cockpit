# Hackathon Submission Checklist

## Required artifacts

- [ ] Public GitHub repository
- [ ] Working online prototype URL
- [ ] Dockerized application
- [ ] Video presentation
- [ ] Pitch deck
- [ ] Setup and usage instructions
- [ ] AMD platform use clearly shown

## Prototype acceptance checks

- [ ] `docker compose up --build` starts backend and frontend
- [ ] `/api/health` returns `status: ok`
- [ ] Frontend loads at `http://localhost:5173`
- [ ] Broken demo repo scan produces findings and score breakdown
- [ ] Claim ledger shows allowed and blocked claims
- [ ] Live AMD Check runs fixed diagnostics without arbitrary shell execution
- [ ] Evidence Replay loads MI300X evidence capsule or placeholder with replay warning
- [ ] Decision Report generates markdown output
- [ ] README states scope, non-goals, trust boundaries, and demo arc

## Pitch emphasis

Do not lead with raw throughput. Lead with product value:

> Forge turns CUDA-centered ML repos and benchmark claims into auditable AMD-readiness evidence packages.

Use MI300X evidence as proof that the product is real and complete, not as a leaderboard claim.

## v7 Frontend/Product Notes

The v7 cockpit layout is graph-first and report-first:

- Audit tab: one clean overview graph, score cards, findings, and claim ledger without page-level scrolling.
- Explore Graph: full-screen interactive canvas with drag-to-rotate, wheel-to-zoom, mode filters, node inspection, and reduced label clutter.
- Live tab: readable fixed-probe diagnostics with no arbitrary shell execution.
- Evidence Replay tab: large readable raw evidence output and explicit replay-only capsule labeling.
- Report tab: structured judge-facing preview with PDF export through `/api/report/pdf`.

The PDF export is a decision artifact, not a benchmark leaderboard. It includes score breakdown, claim ledger, blockers, next proof, trust boundary, and judging translation.
