# Reaper Eagle Forge ML — 3 Minute Demo Script

## 0:00–0:20 — Hook

"GPU migration is not just a code problem. It is a trust problem. Teams see benchmark claims, CUDA assumptions, and missing environment details, then they have to decide whether AMD migration is worth the risk. Reaper Eagle Forge ML turns that uncertainty into an auditable evidence package."

## 0:20–0:50 — Product framing

"Forge is not a raw speed leaderboard and not a generic CUDA-to-ROCm copilot. It audits what a team can honestly claim: portability, benchmark integrity, evidence completeness, and claim discipline."

## 0:50–1:30 — Repo scan

Load the broken demo repo. Show hardcoded `.cuda()`, `nvidia-smi`, timing without synchronization, no p50/p95, and missing evidence manifest. Emphasize that Forge does not execute the scanned repo.

## 1:30–2:00 — Score and claim ledger

Show the four score cards and the claim ledger. Say: "This repo may contain a benchmark, but Forge blocks performance superiority claims until the evidence exists."

## 2:00–2:30 — AMD evidence

Open Evidence Replay. Show the MI300X evidence capsule and SHA-256 manifest. Say: "This hosted demo labels captured evidence as replay. It does not pretend to be connected to live MI300X hardware."

## 2:30–2:55 — Decision report

Generate the Decision Report. Show the blocked claims and required next evidence.

## 2:55–3:00 — Close

"Forge does not ask judges or teams to trust benchmark claims. It shows the code path, the hardware path, the evidence path, and the uncertainty."
