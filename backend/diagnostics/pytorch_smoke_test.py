from __future__ import annotations

import json
import sys


def main() -> int:
    result = {
        "torch_import": False,
        "torch_version": None,
        "torch_hip_version": None,
        "cuda_available_api": None,
        "device_count": 0,
        "device_name": None,
        "tensor_allocation": False,
        "gemm_smoke_test": False,
        "note": "PyTorch ROCm builds may expose AMD devices through the torch.cuda API; this is a compatibility API, not proof of NVIDIA hardware.",
    }
    try:
        import torch
        result["torch_import"] = True
        result["torch_version"] = torch.__version__
        result["torch_hip_version"] = getattr(torch.version, "hip", None)
        result["cuda_available_api"] = bool(torch.cuda.is_available())
        result["device_count"] = int(torch.cuda.device_count()) if torch.cuda.is_available() else 0
        if torch.cuda.is_available():
            result["device_name"] = torch.cuda.get_device_name(0)
            x = torch.randn(1024, 1024, device="cuda")
            y = x @ x
            torch.cuda.synchronize()
            result["tensor_allocation"] = True
            result["gemm_smoke_test"] = tuple(y.shape) == (1024, 1024)
    except Exception as exc:
        result["error"] = repr(exc)
        print(json.dumps(result, indent=2))
        return 1
    print(json.dumps(result, indent=2))
    return 0 if result["torch_import"] else 1


if __name__ == "__main__":
    sys.exit(main())
