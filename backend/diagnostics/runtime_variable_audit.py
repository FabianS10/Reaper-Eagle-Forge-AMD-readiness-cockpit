from __future__ import annotations

import json
import os

PREFIXES = ("ROCM", "HIP", "HSA", "ROCR", "CUDA", "PYTORCH", "VLLM", "RCCL")
SENSITIVE_HINTS = ("KEY", "TOKEN", "SECRET", "PASSWORD")

def redact(key: str, value: str) -> str:
    if any(hint in key.upper() for hint in SENSITIVE_HINTS):
        return "[redacted]"
    return value

result = {k: redact(k, v) for k, v in sorted(os.environ.items()) if k.startswith(PREFIXES)}
print(json.dumps({"runtime_variables": result, "count": len(result)}, indent=2))
