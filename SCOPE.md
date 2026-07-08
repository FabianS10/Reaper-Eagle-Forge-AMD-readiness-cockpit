# Reaper Eagle Forge ML — Scope and Non-Goals

## What Forge ML does

Forge ML audits a machine-learning repository and produces an AMD-readiness evidence package. The current MVP checks static repository files for CUDA/NVIDIA assumptions, benchmark-discipline weaknesses, missing evidence artifacts, and overbroad claims.

## What Forge ML does not do yet

- It does not execute scanned repository code.
- It does not install dependencies from scanned repositories.
- It does not automatically patch the repository.
- It does not claim universal AMD performance superiority.
- It does not treat replayed MI300X evidence as a live GPU session.
- It does not certify production readiness without human review.

## Why this boundary matters

A migration tool that overclaims can become benchmark theater. Forge is designed to refuse unmeasured claims. Its value is not just detection; its value is the boundary between what is verified, what is risky, and what remains unknown.
