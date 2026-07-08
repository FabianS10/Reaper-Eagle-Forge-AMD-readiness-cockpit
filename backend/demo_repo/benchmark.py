import time
import subprocess
import torch

subprocess.run(["nvidia-smi"])

device = "cuda"
model = torch.nn.Linear(1024, 1024).cuda()
x = torch.randn(32, 1024).cuda()

start = time.time()
y = model(x)
end = time.time()

print("latency:", end - start)
