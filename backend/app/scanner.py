from __future__ import annotations

import os
import re
import shutil
import tempfile
import time
import uuid
import zipfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import requests

from .models import ClaimLedger, Finding, FindingCategory, RepoScanResponse, Severity
from .scoring import compute_score_breakdown, readiness_label
from .topology import build_topology

# Guardrails for scanning arbitrary public repos. These exist because, unlike
# the bundled demo repo, an attacker-controlled or simply huge public repo is
# untrusted input arriving over the network -- every one of these caps closes
# a concrete resource-exhaustion path (slow download, zip bomb, giant single
# file, pathological file count, unbounded scan time).
MAX_GITHUB_REPORTED_SIZE_KB = 80_000       # ~80MB git size reported by the GitHub API; fail fast before downloading
MAX_DOWNLOAD_BYTES = 60_000_000            # hard cap on compressed archive bytes actually read off the wire
MAX_UNCOMPRESSED_BYTES = 250_000_000       # hard cap on total bytes a malicious/oversized zip may claim to expand to
MAX_ZIP_ENTRIES = 15_000                   # zip-bomb-by-file-count guard
SCAN_WALL_CLOCK_BUDGET_SECONDS = 25        # whole-scan time budget; scan is truncated (not killed) past this


@dataclass(frozen=True)
class Rule:
    code: str
    pattern: re.Pattern[str]
    category: FindingCategory
    severity: Severity
    message: str
    suggestion: str


RULES: list[Rule] = [
    Rule(
        "CUDA_DEVICE_HARDCODED",
        re.compile(r"\.cuda\s*\(|\.to\s*\(\s*['\"]cuda['\"]\s*\)", re.I),
        FindingCategory.EXECUTION_BLOCKER,
        Severity.HIGH,
        "Direct CUDA device movement detected.",
        "Use a device abstraction and validate the path under a ROCm-enabled PyTorch runtime.",
    ),
    Rule(
        "TORCH_CUDA_DIRECT_DEVICE",
        re.compile(r"torch\.device\s*\(\s*['\"]cuda['\"]\s*\)|device\s*=\s*['\"]cuda['\"]", re.I),
        FindingCategory.EXECUTION_BLOCKER,
        Severity.HIGH,
        "Hardcoded CUDA device selection detected.",
        "Resolve the active device at runtime and record backend/device identity in the benchmark manifest.",
    ),
    Rule(
        "TENSORRT_DEPENDENCY",
        re.compile(r"\btensorrt\b|import\s+trt\b", re.I),
        FindingCategory.EXECUTION_BLOCKER,
        Severity.HIGH,
        "TensorRT dependency detected.",
        "Add a ROCm-compatible inference path or isolate TensorRT as an optional NVIDIA-only backend.",
    ),
    Rule(
        "CUDA_EXTENSION_BUILD",
        re.compile(r"CUDAExtension|cpp_extension\.CUDAExtension|extra_compile_args.*nvcc", re.I | re.S),
        FindingCategory.EXECUTION_BLOCKER,
        Severity.HIGH,
        "Custom CUDA extension build detected.",
        "Audit the extension for HIP portability or provide a CPU/ROCm-compatible fallback.",
    ),
    Rule(
        "NVCC_REQUIRED",
        re.compile(r"\bnvcc\b|CUDA_HOME", re.I),
        FindingCategory.EXECUTION_BLOCKER,
        Severity.HIGH,
        "NVIDIA CUDA compiler/runtime requirement detected.",
        "Replace NVIDIA compiler assumptions with a HIP/ROCm build path where applicable.",
    ),
    Rule(
        "CUPY_CUDA_DEPENDENCY",
        re.compile(r"cupy\.cuda|cupy-cuda", re.I),
        FindingCategory.EXECUTION_BLOCKER,
        Severity.HIGH,
        "CuPy CUDA-specific dependency detected.",
        "Use a backend-neutral implementation or verify a ROCm-compatible alternative.",
    ),
    Rule(
        "NVIDIA_SMI_DEPENDENCY",
        re.compile(r"nvidia-smi", re.I),
        FindingCategory.PORTABILITY_GAP,
        Severity.MEDIUM,
        "NVIDIA telemetry command detected.",
        "Abstract telemetry and map it to amd-smi or rocm-smi on AMD systems.",
    ),
    Rule(
        "NVIDIA_DOCKER_HINT",
        re.compile(r"FROM\s+nvidia/cuda|--gpus\s+all|nvidia-container-runtime", re.I),
        FindingCategory.PORTABILITY_GAP,
        Severity.MEDIUM,
        "NVIDIA-oriented container assumptions detected.",
        "Provide a ROCm container path and clearly label NVIDIA-specific runtime instructions.",
    ),
    Rule(
        "OVERCLAIMED_PERFORMANCE_LANGUAGE",
        re.compile(r"\b(faster than|beats?|outperforms?|superior to|best|fastest|production[- ]ready|3x|4x|10x)\b", re.I),
        FindingCategory.CLAIM_DISCIPLINE,
        Severity.MEDIUM,
        "Marketing or performance claim language detected without proof attached to this line.",
        "Tie performance and production-readiness claims to raw logs, hardware metadata, repeated runs, and an evidence manifest.",
    ),
]

SCAN_SUFFIXES = {".py", ".ipynb", ".txt", ".md", ".yml", ".yaml", ".toml", ".cfg", ".ini", ".json"}
MAX_FILE_BYTES = 400_000
MAX_FINDINGS = 240
BENCHMARK_HINTS = ("benchmark", "latency", "throughput", "inference", "tokens/sec", "images/sec")
MANIFEST_HINTS = ("manifest", "run_metadata", "benchmark_results", "sha256", "hardware_profile", "evidence")


def _is_scannable(path: Path) -> bool:
    if path.name == "Dockerfile" or path.name.startswith("Dockerfile"):
        return True
    return path.suffix.lower() in SCAN_SUFFIXES


def _scan_text(path: Path, rel: str) -> list[Finding]:
    try:
        with path.open("r", errors="ignore") as fh:
            data = fh.read(MAX_FILE_BYTES)
    except Exception:
        return []

    findings: list[Finding] = []
    lines = data.splitlines()
    lowered = data.lower()

    for rule in RULES:
        for idx, line in enumerate(lines, start=1):
            if rule.pattern.search(line):
                findings.append(
                    Finding(
                        code=rule.code,
                        category=rule.category,
                        severity=rule.severity,
                        status="fail" if rule.category == FindingCategory.EXECUTION_BLOCKER else "warn",
                        file_path=rel,
                        line_number=idx,
                        snippet=line.strip()[:240],
                        message=rule.message,
                        suggestion=rule.suggestion,
                    )
                )
                break

    has_benchmark_hint = any(hint in lowered for hint in BENCHMARK_HINTS)
    if has_benchmark_hint:
        if ("time.time" in lowered or "time.perf_counter" in lowered) and "synchronize" not in lowered:
            findings.append(_finding(
                "NO_SYNCHRONIZATION_BEFORE_TIME",
                FindingCategory.BENCHMARK_DISCIPLINE,
                Severity.HIGH,
                "fail",
                rel,
                _first_line_containing(lines, "time."),
                "GPU timing appears to be collected without an explicit synchronization boundary.",
                "Add warm-up and synchronize before/after GPU timing to avoid misleading latency measurements.",
                "Timing API present; synchronization token missing.",
            ))
        if "warmup" not in lowered and "warm-up" not in lowered:
            findings.append(_finding(
                "NO_WARMUP_POLICY",
                FindingCategory.BENCHMARK_DISCIPLINE,
                Severity.MEDIUM,
                "warn",
                rel,
                _first_line_containing(lines, "benchmark"),
                "Benchmark-like code does not declare a warm-up policy.",
                "Declare warm-up count separately from timed runs.",
                "Benchmark hint present; warm-up policy missing.",
            ))
        if "p50" not in lowered or "p95" not in lowered:
            findings.append(_finding(
                "NO_P50_P95_LATENCY",
                FindingCategory.BENCHMARK_DISCIPLINE,
                Severity.MEDIUM,
                "warn",
                rel,
                _first_line_containing(lines, "latency") or _first_line_containing(lines, "benchmark"),
                "Benchmark output does not appear to capture both p50 and p95 latency.",
                "Report p50 and p95 latency over repeated timed runs instead of relying on a single average.",
                "Benchmark hint present; p50/p95 tokens missing.",
            ))
        if "precision" not in lowered and "dtype" not in lowered and "bf16" not in lowered and "fp16" not in lowered:
            findings.append(_finding(
                "NO_PRECISION_DECLARATION",
                FindingCategory.BENCHMARK_DISCIPLINE,
                Severity.MEDIUM,
                "warn",
                rel,
                _first_line_containing(lines, "benchmark"),
                "Benchmark does not declare precision or dtype.",
                "Record fp32/fp16/bf16 and relevant autocast or AMP policy in the benchmark manifest.",
                "Benchmark hint present; precision/dtype missing.",
            ))
        if not re.search(r"for\s+\w+\s+in\s+range\s*\(\s*(?:[2-9]|[1-9][0-9]+)", data):
            findings.append(_finding(
                "SINGLE_RUN_BENCHMARK_RISK",
                FindingCategory.BENCHMARK_DISCIPLINE,
                Severity.MEDIUM,
                "warn",
                rel,
                _first_line_containing(lines, "latency") or _first_line_containing(lines, "benchmark"),
                "Benchmark may rely on a single measurement instead of repeated trials.",
                "Use repeated timed trials and report distribution statistics.",
                "Repeated-run loop was not detected near benchmark-like code.",
            ))

    return findings


def _finding(
    code: str,
    category: FindingCategory,
    severity: Severity,
    status: str,
    file_path: str | None,
    line_number: int | None,
    message: str,
    suggestion: str,
    snippet: str | None = None,
) -> Finding:
    return Finding(
        code=code,
        category=category,
        severity=severity,
        status=status,  # type: ignore[arg-type]
        file_path=file_path,
        line_number=line_number,
        snippet=snippet,
        message=message,
        suggestion=suggestion,
    )


def _first_line_containing(lines: list[str], needle: str) -> int | None:
    needle = needle.lower()
    for idx, line in enumerate(lines, start=1):
        if needle in line.lower():
            return idx
    return None


def _root_level_findings(root: Path) -> list[Finding]:
    findings: list[Finding] = []
    files = [p for p in root.rglob("*") if p.is_file()]
    names = {p.name.lower() for p in files}
    rel_paths = {str(p.relative_to(root)).lower() for p in files}
    joined_names = "\n".join(sorted(rel_paths))

    has_docker = any(name == "dockerfile" or name.startswith("dockerfile") for name in names) or "docker-compose.yml" in names or "docker-compose.yaml" in names
    if not has_docker:
        findings.append(_finding(
            "MISSING_CONTAINER_ARTIFACT",
            FindingCategory.EVIDENCE_GAP,
            Severity.HIGH,
            "fail",
            None,
            None,
            "No Dockerfile or Docker Compose artifact was detected.",
            "Add a runnable container path so the repository is an executable submission artifact, not just source code.",
            "Containerization artifact missing.",
        ))

    has_readme = any(name.startswith("readme") for name in names)
    if not has_readme:
        findings.append(_finding(
            "MISSING_SETUP_README",
            FindingCategory.EVIDENCE_GAP,
            Severity.MEDIUM,
            "warn",
            None,
            None,
            "No README/setup instructions were detected.",
            "Add setup, run, expected inputs, expected outputs, and known limitations.",
            "README missing.",
        ))

    has_requirements = any(name in {"requirements.txt", "pyproject.toml", "poetry.lock", "pdm.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"} for name in names)
    if not has_requirements:
        findings.append(_finding(
            "MISSING_DEPENDENCY_LOCK_OR_SPEC",
            FindingCategory.EVIDENCE_GAP,
            Severity.MEDIUM,
            "warn",
            None,
            None,
            "Dependency specification or lockfile was not detected.",
            "Record dependencies with versions so benchmark and migration evidence can be reproduced.",
            "Dependency provenance missing.",
        ))

    has_manifest = any(hint in joined_names for hint in MANIFEST_HINTS)
    if not has_manifest:
        findings.append(_finding(
            "MISSING_EVIDENCE_MANIFEST",
            FindingCategory.EVIDENCE_GAP,
            Severity.HIGH,
            "fail",
            None,
            None,
            "No evidence manifest, run metadata, or hash artifact was detected.",
            "Attach run metadata, hardware profile, benchmark config/results, and SHA-256 hashes for evidence-bearing claims.",
            "Evidence manifest not found.",
        ))

    has_scope_doc = any("scope" in path or "limits" in path or "submission" in path for path in rel_paths)
    if not has_scope_doc:
        findings.append(_finding(
            "MISSING_SCOPE_AND_NON_GOALS",
            FindingCategory.CLAIM_DISCIPLINE,
            Severity.MEDIUM,
            "warn",
            None,
            None,
            "No explicit scope, non-goals, or claim boundaries were detected.",
            "State what the tool does, what it does not do yet, and which claims require human review or live hardware evidence.",
            "Claim boundary document missing.",
        ))

    return findings


def _claim_ledger(findings: list[Finding]) -> ClaimLedger:
    codes = {finding.code for finding in findings}
    verified: list[str] = [
        "Repository code was statically inspected without execution.",
        "CUDA/NVIDIA assumptions are categorized separately from benchmark-methodology issues.",
    ]
    allowed: list[str] = [
        "Forge can identify migration-readiness risks before a team invests in AMD porting work.",
        "Forge can generate an audit report that separates repository findings from live/replayed hardware evidence.",
    ]
    blocked: list[str] = []
    required: list[str] = []

    if any(code in codes for code in {"MISSING_EVIDENCE_MANIFEST", "NO_P50_P95_LATENCY", "SINGLE_RUN_BENCHMARK_RISK"}):
        blocked.append("Do not claim benchmark superiority or production-grade performance from this repository yet.")
        required.append("Add repeated timed runs, p50/p95, hardware metadata, raw logs, and SHA-256 evidence manifest.")
    if any(f.category == FindingCategory.EXECUTION_BLOCKER for f in findings):
        blocked.append("Do not claim the workload is AMD-ready until execution blockers are removed or isolated.")
        required.append("Replace hardcoded CUDA/NVIDIA-only paths or label them as optional backends.")
    if "MISSING_CONTAINER_ARTIFACT" in codes:
        blocked.append("Do not claim the project is hackathon-complete until it has a runnable container path.")
        required.append("Add Dockerfile/Docker Compose and setup instructions.")
    if not blocked:
        verified.append("No high-level blocker was detected for making a bounded AMD-readiness claim.")

    return ClaimLedger(
        verified_claims=verified,
        allowed_claims=allowed,
        blocked_claims=blocked,
        required_next_evidence=required,
    )


def scan_directory(root: Path, repo_name: str = "local-demo") -> RepoScanResponse:
    findings: list[Finding] = []
    findings.extend(_root_level_findings(root))

    deadline = time.monotonic() + SCAN_WALL_CLOCK_BUDGET_SECONDS
    time_budget_exceeded = False
    for path in root.rglob("*"):
        if len(findings) >= MAX_FINDINGS:
            break
        if time.monotonic() > deadline:
            time_budget_exceeded = True
            break
        if path.is_file() and _is_scannable(path):
            rel = str(path.relative_to(root))
            findings.extend(_scan_text(path, rel))

    if time_budget_exceeded:
        findings.append(_finding(
            "SCAN_TIME_BUDGET_EXCEEDED",
            FindingCategory.EVIDENCE_GAP,
            Severity.MEDIUM,
            "warn",
            None,
            None,
            f"Repository scan hit its {SCAN_WALL_CLOCK_BUDGET_SECONDS}s time budget before covering every file.",
            "Findings below are real, but this scan may be incomplete for very large repositories. Re-run against a narrower path if a full sweep is needed.",
            "Scan truncated by time budget, not by finding content.",
        ))

    # Stable ordering helps screenshots, videos, and demo narration.
    severity_order = {Severity.HIGH: 0, Severity.MEDIUM: 1, Severity.LOW: 2}
    findings = sorted(findings, key=lambda f: (severity_order[f.severity], f.category.value, f.code, f.file_path or ""))[:MAX_FINDINGS]
    breakdown = compute_score_breakdown(findings)
    score = breakdown.overall
    ledger = _claim_ledger(findings)
    topology = build_topology(findings=findings, source_mode="repo_scan")
    return RepoScanResponse(
        project_id=str(uuid.uuid4()),
        repo_name=repo_name,
        scan_mode="static_analysis_only",
        repo_code_executed=False,
        findings=findings,
        score=score,
        label=readiness_label(score),
        score_breakdown=breakdown,
        claim_ledger=ledger,
        topology=topology,
    )


def _parse_owner_repo(repo_url: str) -> tuple[str, str]:
    parsed = urlparse(repo_url)
    if parsed.netloc.lower() != "github.com":
        raise ValueError("Only github.com repository URLs are accepted in the MVP.")
    parts = [p for p in parsed.path.strip("/").split("/") if p]
    if len(parts) < 2:
        raise ValueError("Expected GitHub URL shaped as https://github.com/<owner>/<repo>.")
    owner, repo = parts[0], parts[1].replace(".git", "")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", owner) or not re.fullmatch(r"[A-Za-z0-9_.-]+", repo):
        raise ValueError("Invalid GitHub owner or repository name.")
    return owner, repo


def _github_headers() -> dict:
    headers = {"Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _github_repo_metadata(owner: str, repo: str) -> dict:
    """Fail fast on repos that are too large, private, or don't exist -- before spending
    a download on them -- and resolve the *real* default branch instead of guessing
    main/master, which is the actual blocker for scanning arbitrary repos."""
    resp = requests.get(
        f"https://api.github.com/repos/{owner}/{repo}",
        timeout=10,
        headers=_github_headers(),
    )
    if resp.status_code == 404:
        raise ValueError(f"GitHub repo {owner}/{repo} was not found (private repos aren't supported in the MVP).")
    if resp.status_code == 403:
        hint = "" if os.environ.get("GITHUB_TOKEN") else " Set a GITHUB_TOKEN env var to raise this from 60 to 5,000 requests/hour."
        raise ValueError(f"GitHub API rate limit hit while checking this repo.{hint} Try again in a few minutes.")
    resp.raise_for_status()
    data = resp.json()
    size_kb = data.get("size", 0)
    if size_kb and size_kb > MAX_GITHUB_REPORTED_SIZE_KB:
        raise ValueError(
            f"Repository is ~{size_kb / 1000:.0f}MB, over the {MAX_GITHUB_REPORTED_SIZE_KB / 1000:.0f}MB MVP scan limit. "
            "Point Forge at a smaller repo or a focused subdirectory fork."
        )
    return data


def _download_archive(archive_url: str) -> bytes:
    """Stream the archive and abort as soon as it exceeds MAX_DOWNLOAD_BYTES, rather than
    trusting Content-Length (which can be absent or wrong) or buffering an unbounded body."""
    chunks: list[bytes] = []
    total = 0
    with requests.get(archive_url, timeout=20, stream=True, headers=_github_headers()) as response:
        response.raise_for_status()
        for chunk in response.iter_content(chunk_size=262_144):
            total += len(chunk)
            if total > MAX_DOWNLOAD_BYTES:
                raise ValueError(f"Archive exceeded the {MAX_DOWNLOAD_BYTES // 1_000_000}MB download cap; aborted.")
            chunks.append(chunk)
    return b"".join(chunks)


def _safe_extract(zip_path: Path, dest: Path) -> None:
    """Zip-bomb and zip-slip guardrails. GitHub-generated archives are trustworthy in
    practice, but the archive's *content* is entirely attacker-controlled (anyone can
    push arbitrary file names/sizes to a public repo), so this validates the archive
    structurally before trusting it -- the same discipline the rest of Forge applies to
    every other claim."""
    dest = dest.resolve()
    with zipfile.ZipFile(zip_path) as zf:
        infos = zf.infolist()
        if len(infos) > MAX_ZIP_ENTRIES:
            raise ValueError(f"Archive contains {len(infos)} entries, over the {MAX_ZIP_ENTRIES} file MVP limit.")
        total_uncompressed = sum(info.file_size for info in infos)
        if total_uncompressed > MAX_UNCOMPRESSED_BYTES:
            raise ValueError(
                f"Archive would expand to ~{total_uncompressed / 1_000_000:.0f}MB, "
                f"over the {MAX_UNCOMPRESSED_BYTES / 1_000_000:.0f}MB MVP limit."
            )
        for info in infos:
            target = (dest / info.filename).resolve()
            if dest not in target.parents and target != dest:
                raise ValueError(f"Archive entry {info.filename!r} resolves outside the extraction root; rejected.")
        zf.extractall(dest)


def scan_github_repo(repo_url: str) -> RepoScanResponse:
    owner, repo = _parse_owner_repo(repo_url)
    metadata = _github_repo_metadata(owner, repo)
    branch = metadata.get("default_branch") or "main"

    tmp = Path(tempfile.mkdtemp(prefix="forge_scan_"))
    try:
        zip_path = tmp / "repo.zip"
        archive_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip"
        zip_path.write_bytes(_download_archive(archive_url))
        repo_root = tmp / "repo"
        _safe_extract(zip_path, repo_root)
        roots = [p for p in repo_root.iterdir() if p.is_dir()]
        root = roots[0] if roots else repo_root
        return scan_directory(root, repo_name=f"{owner}/{repo}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def scan_demo_repo() -> RepoScanResponse:
    root = Path(__file__).resolve().parents[1] / "demo_repo"
    return scan_directory(root, repo_name="forge-golden-path-broken")
