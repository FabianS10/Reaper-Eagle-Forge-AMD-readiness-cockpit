from __future__ import annotations

from collections import Counter

from .models import Finding, FindingCategory, Severity, ScoreBreakdown


PORTABILITY_WEIGHTS = {
    FindingCategory.EXECUTION_BLOCKER: {Severity.HIGH: 12, Severity.MEDIUM: 7, Severity.LOW: 3},
    FindingCategory.PORTABILITY_GAP: {Severity.HIGH: 8, Severity.MEDIUM: 5, Severity.LOW: 2},
}
BENCHMARK_WEIGHTS = {
    FindingCategory.BENCHMARK_DISCIPLINE: {Severity.HIGH: 12, Severity.MEDIUM: 7, Severity.LOW: 3},
}
EVIDENCE_WEIGHTS = {
    FindingCategory.EVIDENCE_GAP: {Severity.HIGH: 12, Severity.MEDIUM: 7, Severity.LOW: 3},
}
CLAIM_WEIGHTS = {
    FindingCategory.CLAIM_DISCIPLINE: {Severity.HIGH: 10, Severity.MEDIUM: 6, Severity.LOW: 3},
}


def readiness_label(score: int) -> str:
    if score >= 85:
        return "AMD-ready evidence package"
    if score >= 70:
        return "AMD-runnable with audit fixes"
    if score >= 50:
        return "Partially portable, major evidence gaps"
    return "Blocked, overclaimed, or NVIDIA-locked"


def _score_axis(findings: list[Finding], weights: dict[FindingCategory, dict[Severity, int]]) -> int:
    penalty = 0
    for finding in findings:
        table = weights.get(finding.category)
        if table:
            penalty += table.get(finding.severity, 0)
    return max(0, min(100, 100 - penalty))


def compute_score_breakdown(findings: list[Finding], environment_bonus: int = 0) -> ScoreBreakdown:
    portability = _score_axis(findings, PORTABILITY_WEIGHTS)
    benchmark_integrity = _score_axis(findings, BENCHMARK_WEIGHTS)
    evidence_completeness = _score_axis(findings, EVIDENCE_WEIGHTS)
    claim_discipline = _score_axis(findings, CLAIM_WEIGHTS)

    # Product-facing score: portability and benchmark integrity matter most, but
    # hackathon judges also need evidence and bounded claims. Environment bonus is
    # intentionally small so replayed/live evidence supports the score without
    # turning this into a raw performance contest.
    overall = round(
        0.35 * portability
        + 0.25 * benchmark_integrity
        + 0.25 * evidence_completeness
        + 0.15 * claim_discipline
        + min(environment_bonus, 5)
    )
    overall = max(0, min(100, overall))

    return ScoreBreakdown(
        overall=overall,
        portability=portability,
        benchmark_integrity=benchmark_integrity,
        evidence_completeness=evidence_completeness,
        claim_discipline=claim_discipline,
    )


def compute_score(findings: list[Finding], environment_bonus: int = 0) -> int:
    return compute_score_breakdown(findings, environment_bonus=environment_bonus).overall


def summarize_findings(findings: list[Finding]) -> dict:
    by_category = Counter(f.category.value for f in findings)
    by_severity = Counter(f.severity.value for f in findings)
    return {
        "total": len(findings),
        "by_category": dict(by_category),
        "by_severity": dict(by_severity),
    }
