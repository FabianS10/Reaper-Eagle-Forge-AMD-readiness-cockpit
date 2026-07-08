from __future__ import annotations

import html

from .models import ClaimLedger, Finding, FindingCategory, ScoreBreakdown

CREDIBILITY_LINE = "The point is not to panic at the word `cuda`; PyTorch ROCm builds may expose AMD devices through the `torch.cuda` API. The real task is distinguishing PyTorch's compatibility API from NVIDIA-only project assumptions."
POSITIONING_LINE = "Forge is not a raw speed leaderboard and not a generic migration copilot. It is an AMD-readiness and benchmark-truth auditor: what is verified, what is risky, and what the team is allowed to claim."


def deterministic_report(
    findings: list[Finding],
    score: int,
    label: str,
    hardware_mode: str,
    score_breakdown: ScoreBreakdown | None = None,
    claim_ledger: ClaimLedger | None = None,
) -> tuple[str, str]:
    blockers = [f for f in findings if f.category == FindingCategory.EXECUTION_BLOCKER]
    gaps = [f for f in findings if f.category == FindingCategory.PORTABILITY_GAP]
    benchmark = [f for f in findings if f.category == FindingCategory.BENCHMARK_DISCIPLINE]
    evidence = [f for f in findings if f.category == FindingCategory.EVIDENCE_GAP]
    claims = [f for f in findings if f.category == FindingCategory.CLAIM_DISCIPLINE]

    breakdown_md = _breakdown_md(score_breakdown)
    ledger_md = _ledger_md(claim_ledger)

    md = f"""# Reaper Eagle Forge ML Report

**Overall Forge Score:** {score}/100  
**Status:** {label}  
**Hardware mode:** {hardware_mode}

## Executive summary

{POSITIONING_LINE}

Forge separates repository assumptions from runtime evidence. Repo Scan is static analysis only; Live Check uses fixed Forge diagnostics and never executes scanned repository code. Evidence Replay is labeled as replayed evidence and must not be presented as a live GPU claim.

> {CREDIBILITY_LINE}

## Score breakdown
{breakdown_md}

## Claim ledger
{ledger_md}

## Main execution blockers
{_finding_list_md(blockers) or "No execution blockers were detected."}

## Portability gaps
{_finding_list_md(gaps) or "No portability gaps were detected."}

## Benchmark discipline
{_finding_list_md(benchmark) or "No benchmark discipline issues were detected."}

## Evidence completeness
{_finding_list_md(evidence) or "No evidence-completeness gaps were detected."}

## Claim discipline
{_finding_list_md(claims) or "No overclaiming or claim-boundary issues were detected."}

## Recommended next actions

1. Replace direct CUDA/NVIDIA-only execution paths with a device/backend abstraction.
2. Add warm-up, synchronization, repeated trials, p50/p95 latency, throughput, batch size, precision, and environment metadata.
3. Preserve raw logs, benchmark configuration, hardware profile, and SHA-256 hashes alongside parsed summaries.
4. Keep replayed evidence and live checks visually separated in the demo and pitch deck.
5. State non-goals explicitly: Forge does not certify universal performance superiority and does not execute arbitrary user repository code.

## Startup pitch translation

- **User:** ML teams deciding whether a CUDA-centered project can move to AMD without blind migration risk.
- **Pain:** benchmark claims are often hard to reproduce, environment details are missing, and CUDA gravity makes AMD adoption feel risky.
- **Wedge:** Forge gives a bounded readiness score and evidence package before expensive migration work starts.
- **Proof layer:** real or replayed MI300X evidence supports completeness; it is not used as a leaderboard claim.

## Trust boundary

Forge never executes user-submitted repository code. Live diagnostics are selected by enum and resolved server-side to fixed `argv` lists with `shell=False`, timeouts, output caps, non-root execution, and rate limits.
"""
    return md, markdown_to_html(md)


def _breakdown_md(score_breakdown: ScoreBreakdown | None) -> str:
    if score_breakdown is None:
        return "Score breakdown was not provided."
    return "\n".join([
        f"- **Portability:** {score_breakdown.portability}/100",
        f"- **Benchmark integrity:** {score_breakdown.benchmark_integrity}/100",
        f"- **Evidence completeness:** {score_breakdown.evidence_completeness}/100",
        f"- **Claim discipline:** {score_breakdown.claim_discipline}/100",
    ])


def _ledger_md(claim_ledger: ClaimLedger | None) -> str:
    if claim_ledger is None:
        return "Claim ledger was not provided."
    sections = [
        ("Verified claims", claim_ledger.verified_claims),
        ("Allowed claims", claim_ledger.allowed_claims),
        ("Blocked claims", claim_ledger.blocked_claims),
        ("Required next evidence", claim_ledger.required_next_evidence),
    ]
    chunks = []
    for title, items in sections:
        body = "\n".join(f"  - {item}" for item in items) if items else "  - None."
        chunks.append(f"- **{title}:**\n{body}")
    return "\n".join(chunks)


def _finding_list_md(findings: list[Finding]) -> str:
    lines = []
    for f in findings[:24]:
        loc = f" `{f.file_path}:{f.line_number}`" if f.file_path and f.line_number else ""
        snippet = f"\n  - Evidence: `{f.snippet}`" if f.snippet else ""
        lines.append(f"- **{f.severity.value.upper()} — {f.code}**{loc}\n  - {f.message}\n  - Suggestion: {f.suggestion}{snippet}")
    return "\n".join(lines)


def markdown_to_html(md: str) -> str:
    # Minimal safe renderer for the fallback report. The frontend can render Markdown separately.
    escaped = html.escape(md)
    escaped = escaped.replace("\n", "<br />\n")
    return f'<article class="report-html"><pre>{escaped}</pre></article>'
