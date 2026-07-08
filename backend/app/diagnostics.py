from __future__ import annotations

import os
import shutil
import subprocess
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

from fastapi import HTTPException, Request

from .models import DiagnosticCheck, DiagnosticResult

MAX_OUTPUT_CHARS = 20_000
DEFAULT_TIMEOUT_SECONDS = 10
MAX_CHECKS_PER_REQUEST = 8
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 8

COMMAND_REGISTRY: dict[DiagnosticCheck, list[str]] = {
    DiagnosticCheck.ROCMINFO: ["rocminfo"],
    DiagnosticCheck.ROCM_SMI_PRODUCT: ["rocm-smi", "--showproductname"],
    DiagnosticCheck.AMD_SMI_LIST: ["amd-smi", "list"],
    DiagnosticCheck.HIPCC_VERSION: ["hipcc", "--version"],
    DiagnosticCheck.PYTHON_VERSION: ["python", "--version"],
    DiagnosticCheck.PYTORCH_SMOKE_TEST: ["python", "/app/diagnostics/pytorch_smoke_test.py"],
    DiagnosticCheck.RUNTIME_VARIABLE_AUDIT: ["python", "/app/diagnostics/runtime_variable_audit.py"],
    DiagnosticCheck.PROFILER_AVAILABILITY: ["python", "/app/diagnostics/profiler_availability.py"],
    DiagnosticCheck.BENCHMARK_KNOWN: ["python", "/app/diagnostics/known_benchmark.py"],
}

_RATE_LIMIT: dict[str, deque[float]] = defaultdict(deque)


def enforce_rate_limit(request: Request) -> None:
    client = request.client.host if request.client else "unknown"
    now = time.time()
    events = _RATE_LIMIT[client]
    while events and now - events[0] > RATE_LIMIT_WINDOW_SECONDS:
        events.popleft()
    if len(events) >= RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(status_code=429, detail="Rate limit exceeded for diagnostic endpoints.")
    events.append(now)


def cap_output(value: str | bytes | None, limit: int = MAX_OUTPUT_CHARS) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        value = value.decode(errors="ignore")
    if len(value) <= limit:
        return value
    return value[:limit] + "\n\n[output truncated by Forge]"


def run_fixed_check(check: DiagnosticCheck) -> DiagnosticResult:
    argv = COMMAND_REGISTRY[check]
    started = time.perf_counter()

    try:
        completed = subprocess.run(
            argv,
            shell=False,
            capture_output=True,
            text=True,
            timeout=DEFAULT_TIMEOUT_SECONDS,
            env=_safe_env(),
        )
    except subprocess.TimeoutExpired as exc:
        return DiagnosticResult(
            check=check.value,
            argv_display=argv,
            status="timeout",
            exit_code=None,
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
            stdout=cap_output(exc.stdout),
            stderr=cap_output(exc.stderr),
        )
    except FileNotFoundError as exc:
        return DiagnosticResult(
            check=check.value,
            argv_display=argv,
            status="not_available",
            exit_code=None,
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
            stdout="",
            stderr=str(exc),
        )

    return DiagnosticResult(
        check=check.value,
        argv_display=argv,
        status="passed" if completed.returncode == 0 else "failed",
        exit_code=completed.returncode,
        duration_ms=round((time.perf_counter() - started) * 1000, 2),
        stdout=cap_output(completed.stdout),
        stderr=cap_output(completed.stderr),
    )


def _safe_env() -> dict[str, str]:
    # Keep the environment functional but avoid letting request data influence it.
    allowed_prefixes = ("ROCM", "HIP", "HSA", "ROCR", "PYTORCH", "VLLM", "RCCL", "PATH", "LD_LIBRARY_PATH", "PYTHONPATH")
    return {k: v for k, v in os.environ.items() if k.startswith(allowed_prefixes) or k in {"HOME", "LANG", "LC_ALL"}}


def local_capabilities() -> dict[str, Any]:
    rocm_available = shutil.which("rocminfo") is not None or shutil.which("rocm-smi") is not None
    gpu_name = None
    gpu_available = False

    if shutil.which("rocm-smi"):
        try:
            out = subprocess.run(["rocm-smi", "--showproductname"], shell=False, capture_output=True, text=True, timeout=5)
            if out.returncode == 0 and out.stdout.strip():
                gpu_available = True
                gpu_name = _parse_gpu_name(out.stdout)
        except Exception:
            pass

    return {
        "live_backend": True,
        "gpu_available": gpu_available,
        "gpu_name": gpu_name,
        "rocm_available": rocm_available,
        "pytorch_rocm_available": None,
        "mode": "live_amd_gpu_available" if gpu_available else ("rocm_present_no_gpu" if rocm_available else "cpu_only_runtime"),
        "message": "Live backend detected. Run Current Environment Check for detailed ROCm/PyTorch status.",
    }


def _parse_gpu_name(output: str) -> str | None:
    for line in output.splitlines():
        stripped = line.strip()
        if "Card" in stripped and ":" in stripped:
            return stripped.split(":", 1)[-1].strip()
        if "MI" in stripped or "AMD" in stripped:
            return stripped
    return None
