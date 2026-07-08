from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class FindingCategory(str, Enum):
    EXECUTION_BLOCKER = "execution_blocker"
    PORTABILITY_GAP = "portability_gap"
    BENCHMARK_DISCIPLINE = "benchmark_discipline"
    EVIDENCE_GAP = "evidence_gap"
    CLAIM_DISCIPLINE = "claim_discipline"
    ENVIRONMENT = "environment"


class Finding(BaseModel):
    code: str
    category: FindingCategory
    severity: Severity
    status: Literal["fail", "warn", "pass", "not_checked"] = "warn"
    file_path: str | None = None
    line_number: int | None = None
    snippet: str | None = None
    message: str
    suggestion: str
    evidence: dict[str, Any] = Field(default_factory=dict)


class ScoreBreakdown(BaseModel):
    overall: int
    portability: int
    benchmark_integrity: int
    evidence_completeness: int
    claim_discipline: int


class ClaimLedger(BaseModel):
    verified_claims: list[str] = Field(default_factory=list)
    allowed_claims: list[str] = Field(default_factory=list)
    blocked_claims: list[str] = Field(default_factory=list)
    required_next_evidence: list[str] = Field(default_factory=list)


class RepoScanRequest(BaseModel):
    repo_url: HttpUrl | None = None
    use_demo_repo: bool = False


class RepoScanResponse(BaseModel):
    project_id: str
    repo_name: str
    scan_mode: str
    repo_code_executed: bool = False
    findings: list[Finding]
    score: int
    label: str
    score_breakdown: ScoreBreakdown
    claim_ledger: ClaimLedger
    topology: dict[str, Any] | None = None


class DiagnosticCheck(str, Enum):
    ROCMINFO = "ROCMINFO"
    ROCM_SMI_PRODUCT = "ROCM_SMI_PRODUCT"
    AMD_SMI_LIST = "AMD_SMI_LIST"
    HIPCC_VERSION = "HIPCC_VERSION"
    PYTHON_VERSION = "PYTHON_VERSION"
    PYTORCH_SMOKE_TEST = "PYTORCH_SMOKE_TEST"
    RUNTIME_VARIABLE_AUDIT = "RUNTIME_VARIABLE_AUDIT"
    PROFILER_AVAILABILITY = "PROFILER_AVAILABILITY"
    BENCHMARK_KNOWN = "BENCHMARK_KNOWN"


class DiagnosticRequest(BaseModel):
    checks: list[DiagnosticCheck]


class DiagnosticResult(BaseModel):
    check: str
    argv_display: list[str]
    status: Literal["passed", "failed", "timeout", "not_available"]
    exit_code: int | None = None
    duration_ms: float
    stdout: str
    stderr: str


class EnvironmentCheckResponse(BaseModel):
    mode: str
    trust_boundary: str
    repo_code_executed: bool = False
    results: list[DiagnosticResult]
    topology: dict[str, Any]


class CapabilitiesResponse(BaseModel):
    live_backend: bool
    gpu_available: bool
    gpu_name: str | None = None
    rocm_available: bool
    pytorch_rocm_available: bool | None = None
    mode: str
    message: str


class ReportRequest(BaseModel):
    findings: list[Finding] = Field(default_factory=list)
    score: int = 0
    label: str = "not_checked"
    score_breakdown: ScoreBreakdown | None = None
    claim_ledger: ClaimLedger | None = None
    hardware_mode: str = "unknown"
    environment_summary: dict[str, Any] = Field(default_factory=dict)


class ReportResponse(BaseModel):
    generation_mode: Literal["deterministic_fallback", "llm_assisted"] = "deterministic_fallback"
    markdown: str
    html: str
