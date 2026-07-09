from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .diagnostics import enforce_rate_limit, local_capabilities, run_fixed_check
from .models import (
    CapabilitiesResponse,
    DiagnosticCheck,
    DiagnosticRequest,
    EnvironmentCheckResponse,
    ReportRequest,
    ReportResponse,
    RepoScanRequest,
    RepoScanResponse,
)
from .reporting import deterministic_report
from .pdf_reporting import build_pdf_report
from .scanner import scan_demo_repo, scan_github_repo
from .topology import build_topology

app = FastAPI(title="Reaper Eagle Forge ML", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://reaper-eagle-forge-ml.netlify.app"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

EVIDENCE_DIR = Path(__file__).resolve().parents[1] / "evidence"


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "project": "Reaper Eagle Forge ML",
        "trust_boundary": "Repo Scan is static analysis only; Live Check uses fixed diagnostics only.",
    }


@app.get("/api/capabilities", response_model=CapabilitiesResponse)
def capabilities() -> dict:
    return local_capabilities()


@app.post("/api/repo/scan", response_model=RepoScanResponse)
def repo_scan(payload: RepoScanRequest, request: Request) -> RepoScanResponse:
    if payload.use_demo_repo or payload.repo_url is None:
        return scan_demo_repo()
    enforce_rate_limit(request)
    try:
        return scan_github_repo(str(payload.repo_url))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/environment/check", response_model=EnvironmentCheckResponse)
def environment_check(payload: DiagnosticRequest, request: Request) -> EnvironmentCheckResponse:
    enforce_rate_limit(request)
    if len(payload.checks) > 8:
        raise HTTPException(status_code=400, detail="Too many checks requested.")
    results = [run_fixed_check(check) for check in payload.checks]
    topology = build_topology(diagnostics=results, source_mode="live_check")
    return EnvironmentCheckResponse(
        mode="live_environment_check",
        trust_boundary="fixed_server_side_diagnostics_only",
        repo_code_executed=False,
        results=results,
        topology=topology,
    )


@app.post("/api/benchmark/known")
def benchmark_known(request: Request) -> dict:
    enforce_rate_limit(request)
    result = run_fixed_check(DiagnosticCheck.BENCHMARK_KNOWN)
    return {
        "mode": "known_forge_benchmark",
        "repo_code_executed": False,
        "result": result.model_dump(),
    }


@app.get("/api/evidence/replay")
def evidence_replay() -> JSONResponse:
    metadata_path = EVIDENCE_DIR / "run_metadata.json"
    topology_path = EVIDENCE_DIR / "topology" / "topology_graph.json"
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="Evidence capsule not found.")
    metadata = json.loads(metadata_path.read_text())
    topology = json.loads(topology_path.read_text()) if topology_path.exists() else build_topology(source_mode="evidence_replay")
    return JSONResponse({"metadata": metadata, "topology": topology, "base_path": "/api/evidence/file"})


@app.get("/api/evidence/file/{section}/{filename}")
def evidence_file(section: str, filename: str) -> FileResponse:
    safe_sections = {"environment", "benchmark", "profiler", "scanner", "topology", "report", "integrity"}
    if section not in safe_sections or "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid evidence file path.")
    path = EVIDENCE_DIR / section / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Evidence file not found.")
    return FileResponse(path)


@app.post("/api/report/generate", response_model=ReportResponse)
def report_generate(payload: ReportRequest) -> ReportResponse:
    markdown, html = deterministic_report(
        payload.findings,
        payload.score,
        payload.label,
        payload.hardware_mode,
        score_breakdown=payload.score_breakdown,
        claim_ledger=payload.claim_ledger,
    )
    return ReportResponse(generation_mode="deterministic_fallback", markdown=markdown, html=html)


@app.post("/api/report/pdf")
def report_pdf(payload: ReportRequest) -> Response:
    pdf_bytes = build_pdf_report(payload)
    headers = {"Content-Disposition": "attachment; filename=reaper-eagle-forge-decision-report.pdf"}
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@app.get("/api/product/positioning")
def product_positioning() -> dict:
    return {
        "one_liner": "Forge turns CUDA-centered ML repos and benchmark claims into auditable AMD-readiness evidence packages.",
        "not_a": [
            "Not a raw speed leaderboard",
            "Not a CUDA-to-ROCm copilot clone",
            "Not a claim that AMD beats NVIDIA on every workload",
        ],
        "is_a": [
            "Static AMD-readiness auditor",
            "Benchmark-integrity checker",
            "Evidence manifest and live/replay trust boundary",
            "Decision-support layer for ML migration planning",
        ],
        "mvp_scope": [
            "GitHub URL ingestion only",
            "Static analysis of repository files",
            "Fixed Forge-owned ROCm diagnostics",
            "Captured MI300X evidence replay with hash manifest",
        ],
        "non_goals": [
            "No arbitrary user code execution",
            "No automatic patches in the hackathon MVP",
            "No shader/graphics workflow yet",
            "No unmeasured performance claims",
        ],
    }


@app.get("/api/topology/demo")
def topology_demo() -> dict:
    scan = scan_demo_repo()
    return build_topology(findings=scan.findings, source_mode="combined")

