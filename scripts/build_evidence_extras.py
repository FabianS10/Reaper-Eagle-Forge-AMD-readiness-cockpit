    """Populate the scanner/, topology/, and report/ sections of an evidence capsule.

    capture_mi300x_evidence.sh only captures environment/benchmark/profiler raw
    command output. It never generates scanner findings, the topology graph, or
    the decision report -- those three folders were being filled in by hand,
    which is how backend/evidence/ and frontend/public/forge_evidence/ silently
    drifted apart. This script generates all three from the *same* backend code
    path the live app uses, so replayed evidence always matches what a live scan
    would produce.

    Usage (run from the project root, after capture_mi300x_evidence.sh):
        python scripts/build_evidence_extras.py forge_evidence_capture
    """
    from __future__ import annotations

    import json
    import sys
    from pathlib import Path

    ROOT = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(ROOT / "backend"))

    from app.scanner import scan_demo_repo  # noqa: E402
    from app.topology import build_topology  # noqa: E402
    from app.reporting import deterministic_report  # noqa: E402


    def main() -> None:
        out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "forge_evidence_capture")
        for sub in ("scanner", "topology", "report"):
            (out_dir / sub).mkdir(parents=True, exist_ok=True)

        scan = scan_demo_repo()

        findings_payload = [f.model_dump() for f in scan.findings]
        (out_dir / "scanner" / "repo_scan_findings.json").write_text(
            json.dumps(findings_payload, indent=2)
        )

        readiness_payload = {
            "repo_name": scan.repo_name,
            "score": scan.score,
            "label": scan.label,
            "score_breakdown": scan.score_breakdown.model_dump(),
            "claim_ledger": scan.claim_ledger.model_dump(),
        }
        (out_dir / "scanner" / "amd_readiness_score.json").write_text(
            json.dumps(readiness_payload, indent=2)
        )

        topology = build_topology(findings=scan.findings, source_mode="evidence_replay")
        (out_dir / "topology" / "topology_graph.json").write_text(
            json.dumps(topology, indent=2)
        )

        markdown, html = deterministic_report(
            scan.findings,
            scan.score,
            scan.label,
            hardware_mode="mi300x_captured_evidence_replay",
            score_breakdown=scan.score_breakdown,
            claim_ledger=scan.claim_ledger,
        )
        (out_dir / "report" / "forge_report.md").write_text(markdown)
        (out_dir / "report" / "forge_report.html").write_text(html)

        print(f"[forge] scanner/topology/report written to {out_dir}")


    if __name__ == "__main__":
        main()
