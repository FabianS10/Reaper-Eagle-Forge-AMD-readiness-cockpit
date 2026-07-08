#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-forge_evidence_capture}"
mkdir -p "$OUT_DIR"/{environment,benchmark,profiler,scanner,topology,report,integrity}

capture() {
  local name="$1"; shift
  echo "[forge] running: $*"
  if command -v "$1" >/dev/null 2>&1; then
    "$@" > "$OUT_DIR/$name" 2>&1 || true
  else
    echo "command not available: $1" > "$OUT_DIR/$name"
  fi
}

capture environment/rocminfo.txt rocminfo
capture environment/rocm_smi.txt rocm-smi
capture environment/amd_smi.txt amd-smi list
capture environment/hipcc_version.txt hipcc --version
python --version > "$OUT_DIR/environment/python_version.txt" 2>&1 || true
python backend/diagnostics/runtime_variable_audit.py > "$OUT_DIR/environment/env_vars_redacted.txt" 2>&1 || true
python backend/diagnostics/pytorch_smoke_test.py > "$OUT_DIR/environment/pytorch_rocm_smoke_test.txt" 2>&1 || true
python backend/diagnostics/known_benchmark.py > "$OUT_DIR/benchmark/benchmark_stdout.txt" 2> "$OUT_DIR/benchmark/benchmark_stderr.txt" || true
python - "$OUT_DIR" <<'PY' || echo "[forge] warning: could not parse known_benchmark.py output into benchmark_results.json/benchmark_config.json"
import json, sys
from pathlib import Path

out_dir = Path(sys.argv[1])
stdout = (out_dir / "benchmark" / "benchmark_stdout.txt").read_text()
result = json.loads(stdout)

(out_dir / "benchmark" / "benchmark_results.json").write_text(json.dumps(result, indent=2))
config = {
    "benchmark_name": result.get("benchmark_name"),
    "device_type": result.get("device_type"),
    "gpu_name": result.get("gpu_name"),
    "batch_size": result.get("batch_size"),
    "precision": result.get("precision"),
    "warmup_count": result.get("warmup_count"),
    "timed_runs": result.get("timed_runs"),
}
(out_dir / "benchmark" / "benchmark_config.json").write_text(json.dumps(config, indent=2))
PY

if command -v rocprofv3 >/dev/null 2>&1; then
  echo "rocprofv3 available. Add profiling command here if needed." > "$OUT_DIR/profiler/rocprofv3_summary.txt"
else
  echo "rocprofv3 unavailable; use torch.profiler fallback." > "$OUT_DIR/profiler/rocprofv3_summary.txt"
fi
python backend/diagnostics/profiler_availability.py > "$OUT_DIR/profiler/torch_profiler_fallback.txt" 2>&1 || true

python scripts/build_evidence_extras.py "$OUT_DIR" || echo "[forge] warning: scanner/topology/report generation failed, evidence capsule will be missing those files"

cat > "$OUT_DIR/run_metadata.json" <<META
{
  "project": "Reaper Eagle Forge ML",
  "run_id": "forge-mi300x-$(date -u +%Y%m%dT%H%M%SZ)",
  "capture_mode": "real_mi300x_captured_run",
  "hardware": {"provider": "AMD Developer Cloud", "gpu": "AMD Instinct MI300X", "gpu_count": 1},
  "software": {"os": "$(uname -a)", "rocm_version": "see raw logs", "python_version": "$(python --version 2>&1)", "pytorch_version": "see smoke test", "torch_hip_version": "see smoke test"},
  "captured_at_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "public_demo_note": "The hosted demo replays this captured evidence and is not connected to live MI300X hardware."
}
META

(cd "$OUT_DIR" && find . -type f ! -path './integrity/*' -print0 | sort -z | xargs -0 sha256sum > integrity/sha256_manifest.txt)
echo "[forge] evidence capsule written to $OUT_DIR"
