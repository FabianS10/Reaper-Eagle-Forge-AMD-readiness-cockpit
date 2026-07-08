from __future__ import annotations

import json
import statistics
import sys
import time


def main() -> int:
    try:
        import torch
    except Exception as exc:
        print(json.dumps({"status": "torch_import_failed", "error": repr(exc)}, indent=2))
        return 1

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = torch.nn.Sequential(
        torch.nn.Linear(1024, 2048),
        torch.nn.GELU(),
        torch.nn.Linear(2048, 1024),
    ).to(device)
    model.eval()
    x = torch.randn(64, 1024, device=device)

    warmup = 5
    timed_runs = 30
    with torch.no_grad():
        for _ in range(warmup):
            _ = model(x)
        if device.type == "cuda":
            torch.cuda.synchronize()

        latencies_ms = []
        wall_start = time.perf_counter()
        for _ in range(timed_runs):
            start = time.perf_counter()
            _ = model(x)
            if device.type == "cuda":
                torch.cuda.synchronize()
            latencies_ms.append((time.perf_counter() - start) * 1000)
        wall_time = time.perf_counter() - wall_start

    result = {
        "status": "ok",
        "benchmark_name": "forge_known_linear_gemm",
        "repo_code_executed": False,
        "device_type": device.type,
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "torch_version": torch.__version__,
        "torch_hip_version": getattr(torch.version, "hip", None),
        "batch_size": 64,
        "precision": "fp32",
        "warmup_count": warmup,
        "timed_runs": timed_runs,
        "wall_time_s": wall_time,
        "p50_latency_ms": statistics.median(latencies_ms),
        "p95_latency_ms": sorted(latencies_ms)[int(0.95 * len(latencies_ms)) - 1],
        "throughput_items_per_s": (64 * timed_runs) / wall_time if wall_time > 0 else None,
        "note": "Known Forge-owned benchmark. It never executes scanned repository code.",
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
