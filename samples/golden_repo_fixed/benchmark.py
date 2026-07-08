import time
import statistics
import torch

# PyTorch ROCm builds may expose AMD devices through the torch.cuda API.
# This is a compatibility API, not proof of NVIDIA hardware.
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = torch.nn.Linear(1024, 1024).to(device)
x = torch.randn(32, 1024, device=device)

for _ in range(5):
    _ = model(x)
if device.type == "cuda":
    torch.cuda.synchronize()

latencies = []
for _ in range(30):
    start = time.perf_counter()
    _ = model(x)
    if device.type == "cuda":
        torch.cuda.synchronize()
    latencies.append((time.perf_counter() - start) * 1000)

print("p50_ms:", statistics.median(latencies))
print("p95_ms:", sorted(latencies)[int(0.95 * len(latencies)) - 1])
print("runs:", len(latencies))
