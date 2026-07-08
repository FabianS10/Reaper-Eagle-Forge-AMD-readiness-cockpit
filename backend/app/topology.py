from __future__ import annotations

from typing import Any

from .models import DiagnosticResult, Finding, FindingCategory, Severity

ZONE_COORDS = {
    "repository": {"x": -260, "y": -120, "z": 0},
    "host": {"x": 0, "y": -240, "z": 0},
    "amd_runtime": {"x": 0, "y": -120, "z": 0},
    "ml_framework": {"x": 0, "y": 0, "z": 0},
    "benchmark": {"x": 0, "y": 120, "z": 0},
    "evidence": {"x": 260, "y": 0, "z": 0},
    "report": {"x": 0, "y": 240, "z": 0},
}

STATUS_PRIORITY = {"fail": 4, "warn": 3, "running": 2, "pass": 1, "not_checked": 0, "replay": 1}


def zone_status(statuses: list[str]) -> str:
    if not statuses:
        return "not_checked"
    return max(statuses, key=lambda s: STATUS_PRIORITY.get(s, 0))


def finding_to_node(finding: Finding, idx: int) -> dict[str, Any]:
    group = "repository"
    if finding.category == FindingCategory.BENCHMARK_DISCIPLINE:
        group = "benchmark"
    elif finding.category in {FindingCategory.EVIDENCE_GAP, FindingCategory.CLAIM_DISCIPLINE}:
        group = "evidence"
    elif finding.category == FindingCategory.ENVIRONMENT:
        group = "amd_runtime"

    status = "fail" if finding.severity == Severity.HIGH and finding.category == FindingCategory.EXECUTION_BLOCKER else finding.status
    if finding.category == FindingCategory.PORTABILITY_GAP:
        status = "warn"
    if finding.category in {FindingCategory.BENCHMARK_DISCIPLINE, FindingCategory.EVIDENCE_GAP, FindingCategory.CLAIM_DISCIPLINE}:
        status = "fail" if finding.severity == Severity.HIGH else "warn"

    return {
        "id": f"finding_{idx}_{finding.code}",
        "label": finding.code,
        "type": "finding",
        "status": status,
        "severity": finding.severity.value,
        "group": group,
        "parent": group,
        "file_path": finding.file_path,
        "line_number": finding.line_number,
        "snippet": finding.snippet,
        "message": finding.message,
        "suggestion": finding.suggestion,
        "source": "repo_scan",
    }


def diagnostic_to_node(result: DiagnosticResult) -> dict[str, Any]:
    group = "amd_runtime"
    if result.check in {"PYTORCH_SMOKE_TEST"}:
        group = "ml_framework"
    elif result.check in {"BENCHMARK_KNOWN"}:
        group = "benchmark"
    elif result.check in {"PYTHON_VERSION"}:
        group = "host"
    status = "pass" if result.status == "passed" else "fail" if result.status == "failed" else "not_checked"
    if result.status == "not_available":
        status = "not_checked"
    return {
        "id": f"diag_{result.check}",
        "label": result.check,
        "type": "diagnostic",
        "status": status,
        "severity": None,
        "group": group,
        "parent": group,
        "raw_output": result.stdout[:1000],
        "stderr": result.stderr[:1000],
        "duration_ms": result.duration_ms,
        "source": "live_check",
    }


def build_topology(findings: list[Finding] | None = None, diagnostics: list[DiagnosticResult] | None = None, source_mode: str = "combined") -> dict[str, Any]:
    findings = findings or []
    diagnostics = diagnostics or []
    leaf_nodes: list[dict[str, Any]] = []
    leaf_nodes.extend(finding_to_node(f, idx) for idx, f in enumerate(findings))
    leaf_nodes.extend(diagnostic_to_node(d) for d in diagnostics)

    grouped_statuses: dict[str, list[str]] = {key: [] for key in ZONE_COORDS}
    for node in leaf_nodes:
        grouped_statuses.setdefault(node["group"], []).append(node["status"])

    # Evidence and report are available for replay/report contexts.
    if source_mode == "evidence_replay":
        grouped_statuses["evidence"].append("replay")
    if findings or diagnostics:
        grouped_statuses["report"].append("pass")

    zones = []
    for zone_id, coord in ZONE_COORDS.items():
        status = zone_status(grouped_statuses.get(zone_id, []))
        zones.append({
            "id": zone_id,
            "label": _zone_label(zone_id),
            "type": "zone",
            "status": status,
            "group": zone_id,
            "fx": coord["x"],
            "fy": coord["y"],
            "fz": coord["z"],
            "x": coord["x"],
            "y": coord["y"],
            "z": coord["z"],
            "evidence_count": len(grouped_statuses.get(zone_id, [])),
            "source": source_mode,
        })

    links = [
        {"source": "host", "target": "amd_runtime", "type": "depends_on"},
        {"source": "amd_runtime", "target": "ml_framework", "type": "depends_on"},
        {"source": "ml_framework", "target": "benchmark", "type": "depends_on"},
        {"source": "benchmark", "target": "report", "type": "depends_on"},
        {"source": "repository", "target": "benchmark", "type": "informs"},
        {"source": "repository", "target": "report", "type": "informs"},
        {"source": "evidence", "target": "report", "type": "supports"},
    ]
    for node in leaf_nodes:
        links.append({"source": node["parent"], "target": node["id"], "type": "expands_to"})

    return {"source_mode": source_mode, "nodes": zones + leaf_nodes, "links": links}


def _zone_label(zone_id: str) -> str:
    return {
        "repository": "Repository Layer",
        "host": "Host System",
        "amd_runtime": "AMD Runtime",
        "ml_framework": "ML Framework",
        "benchmark": "Benchmark Layer",
        "evidence": "Evidence Layer",
        "report": "Report Layer",
    }[zone_id]
