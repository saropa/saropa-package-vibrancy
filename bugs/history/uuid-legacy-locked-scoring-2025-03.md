# UUID (and similar) reported Unhealthy / Legacy-Locked despite recent publish

**Resolved:** 2025-03 (Unreleased)

## Summary

Packages that were recently published on pub.dev (e.g. uuid 4.5.3, published 20 days ago) were reported as "Unhealthy", score ~18.9/100, category Legacy-Locked. The algorithm relied on GitHub issue/PR closure for 50% of the score (resolution velocity); stable packages with little issue activity got resolution ≈ 0 and could not escape legacy-locked even with recent releases.

## Resolution

- **effectiveResolutionVelocity** in `vibrancy-calculator.ts`: when GitHub-derived resolution is 0, use pub.dev publish recency on the same 0–100 scale (up to cap 100) so recency and issue/PR vibrancy are treated equally.
- **scan-orchestrator.ts** now calls `effectiveResolutionVelocity(github, daysSincePublish)` instead of `calcResolutionVelocity(github)` only.
- Recently published packages (e.g. 20 days ago) now receive a resolution contribution from publish recency and can score in Quiet or Vibrant range instead of Legacy-Locked.
