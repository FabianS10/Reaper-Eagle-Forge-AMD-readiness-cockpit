# Reaper Eagle Forge ML Report

**Overall Forge Score:** 69/100  
**Status:** Partially portable, major evidence gaps  
**Hardware mode:** mi300x_captured_evidence_replay

## Executive summary

Forge is not a raw speed leaderboard and not a generic migration copilot. It is an AMD-readiness and benchmark-truth auditor: what is verified, what is risky, and what the team is allowed to claim.

Forge separates repository assumptions from runtime evidence. Repo Scan is static analysis only; Live Check uses fixed Forge diagnostics and never executes scanned repository code. Evidence Replay is labeled as replayed evidence and must not be presented as a live GPU claim.

> The point is not to panic at the word `cuda`; PyTorch ROCm builds may expose AMD devices through the `torch.cuda` API. The real task is distinguishing PyTorch's compatibility API from NVIDIA-only project assumptions.

## Score breakdown
- **Portability:** 71/100
- **Benchmark integrity:** 60/100
- **Evidence completeness:** 62/100
- **Claim discipline:** 94/100

## Claim ledger
- **Verified claims:**
  - Repository code was statically inspected without execution.
  - CUDA/NVIDIA assumptions are categorized separately from benchmark-methodology issues.
- **Allowed claims:**
  - Forge can identify migration-readiness risks before a team invests in AMD porting work.
  - Forge can generate an audit report that separates repository findings from live/replayed hardware evidence.
- **Blocked claims:**
  - Do not claim benchmark superiority or production-grade performance from this repository yet.
  - Do not claim the workload is AMD-ready until execution blockers are removed or isolated.
  - Do not claim the project is hackathon-complete until it has a runnable container path.
- **Required next evidence:**
  - Add repeated timed runs, p50/p95, hardware metadata, raw logs, and SHA-256 evidence manifest.
  - Replace hardcoded CUDA/NVIDIA-only paths or label them as optional backends.
  - Add Dockerfile/Docker Compose and setup instructions.

## Main execution blockers
- **HIGH — CUDA_DEVICE_HARDCODED** `benchmark.py:8`
  - Direct CUDA device movement detected.
  - Suggestion: Use a device abstraction and validate the path under a ROCm-enabled PyTorch runtime.
  - Evidence: `model = torch.nn.Linear(1024, 1024).cuda()`
- **HIGH — TORCH_CUDA_DIRECT_DEVICE** `benchmark.py:7`
  - Hardcoded CUDA device selection detected.
  - Suggestion: Resolve the active device at runtime and record backend/device identity in the benchmark manifest.
  - Evidence: `device = "cuda"`

## Portability gaps
- **MEDIUM — NVIDIA_SMI_DEPENDENCY** `benchmark.py:5`
  - NVIDIA telemetry command detected.
  - Suggestion: Abstract telemetry and map it to amd-smi or rocm-smi on AMD systems.
  - Evidence: `subprocess.run(["nvidia-smi"])`

## Benchmark discipline
- **HIGH — NO_SYNCHRONIZATION_BEFORE_TIME** `benchmark.py:11`
  - GPU timing appears to be collected without an explicit synchronization boundary.
  - Suggestion: Add warm-up and synchronize before/after GPU timing to avoid misleading latency measurements.
  - Evidence: `Timing API present; synchronization token missing.`
- **MEDIUM — NO_P50_P95_LATENCY** `benchmark.py:15`
  - Benchmark output does not appear to capture both p50 and p95 latency.
  - Suggestion: Report p50 and p95 latency over repeated timed runs instead of relying on a single average.
  - Evidence: `Benchmark hint present; p50/p95 tokens missing.`
- **MEDIUM — NO_PRECISION_DECLARATION**
  - Benchmark does not declare precision or dtype.
  - Suggestion: Record fp32/fp16/bf16 and relevant autocast or AMP policy in the benchmark manifest.
  - Evidence: `Benchmark hint present; precision/dtype missing.`
- **MEDIUM — NO_WARMUP_POLICY**
  - Benchmark-like code does not declare a warm-up policy.
  - Suggestion: Declare warm-up count separately from timed runs.
  - Evidence: `Benchmark hint present; warm-up policy missing.`
- **MEDIUM — SINGLE_RUN_BENCHMARK_RISK** `benchmark.py:15`
  - Benchmark may rely on a single measurement instead of repeated trials.
  - Suggestion: Use repeated timed trials and report distribution statistics.
  - Evidence: `Repeated-run loop was not detected near benchmark-like code.`

## Evidence completeness
- **HIGH — MISSING_CONTAINER_ARTIFACT**
  - No Dockerfile or Docker Compose artifact was detected.
  - Suggestion: Add a runnable container path so the repository is an executable submission artifact, not just source code.
  - Evidence: `Containerization artifact missing.`
- **HIGH — MISSING_EVIDENCE_MANIFEST**
  - No evidence manifest, run metadata, or hash artifact was detected.
  - Suggestion: Attach run metadata, hardware profile, benchmark config/results, and SHA-256 hashes for evidence-bearing claims.
  - Evidence: `Evidence manifest not found.`
- **MEDIUM — MISSING_DEPENDENCY_LOCK_OR_SPEC**
  - Dependency specification or lockfile was not detected.
  - Suggestion: Record dependencies with versions so benchmark and migration evidence can be reproduced.
  - Evidence: `Dependency provenance missing.`
- **MEDIUM — MISSING_SETUP_README**
  - No README/setup instructions were detected.
  - Suggestion: Add setup, run, expected inputs, expected outputs, and known limitations.
  - Evidence: `README missing.`

## Claim discipline
- **MEDIUM — MISSING_SCOPE_AND_NON_GOALS**
  - No explicit scope, non-goals, or claim boundaries were detected.
  - Suggestion: State what the tool does, what it does not do yet, and which claims require human review or live hardware evidence.
  - Evidence: `Claim boundary document missing.`

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
