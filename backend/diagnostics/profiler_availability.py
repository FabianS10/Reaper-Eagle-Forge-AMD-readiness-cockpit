from __future__ import annotations

import json
import shutil

result = {
    "rocprofv3": shutil.which("rocprofv3"),
    "rocprof": shutil.which("rocprof"),
    "torch_profiler_fallback": "available_if_torch_imports",
    "policy": "Try rocprofv3 first. If parsing is unstable, fallback to torch.profiler for demo reliability.",
}
print(json.dumps(result, indent=2))
