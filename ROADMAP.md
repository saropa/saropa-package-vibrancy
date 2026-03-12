# Feature Roadmap

Planned features sorted by effort vs wow factor.

## Rating Scale

| Effort | Meaning                 | Wow     | Meaning                         |
| ------ | ----------------------- | ------- | ------------------------------- |
| **S**  | 1–2 days, mostly wiring | ⭐      | Nice-to-have, expected feature  |
| **M**  | 3–5 days, new logic     | ⭐⭐    | Impressive, clear differentiator |
| **L**  | 1–2 weeks, new systems  | ⭐⭐⭐  | Jaw-drop, nobody else does this |
| **XL** | 2+ weeks, multi-system  |         |                                 |

---

## S effort / ⭐ wow — Quick Wins

1–2 days each. Polish and UX improvements that make the extension feel complete.

| Feature | What | Plan |
|---------|------|------|
| **Package Detail View** | Selection-synced sidebar webview showing full package details. Replaces long tree suffixes with rich, searchable view. Output channel logging for persistence. | [plan](plans/21-package-detail-view.md) |

---

## M effort / ⭐⭐ wow — Core Differentiators

3–5 days each. These are what make Saropa clearly better than everything else.

| Feature | What | Plan |
|---------|------|------|
| **Package Comparison View** | Select 2–3 packages, open side-by-side webview comparing score, size, platforms, stars, license. Winner highlighting. | [plan](plans/18-package-comparison-view.md) |
| **Dependency Budget** | Project-level limits: max deps, min avg vibrancy, max EOL. Visual gauge in sidebar. Non-zero exit code for CI. | [plan](plans/16-dependency-budget.md) |

---

## M effort / ⭐ wow — Solid Additions

3–5 days each. Useful, not flashy. Fill gaps and improve daily workflow.

| Feature | What | Plan |
|---------|------|------|
| **Changelog Diff Webview** | Full searchable changelog between pinned and latest. BREAKING markers in red, migration instructions in blue. | [plan](plans/15-changelog-diff-webview.md) |

---

## L effort / ⭐⭐ wow — Infrastructure Builders

1–2 weeks each. Impressive on their own, but also unlock other features.

| Feature | What | Depends On | Plan |
|---------|------|------------|------|
| **CI Pipeline Generator** | One command generates a GitHub Actions / GitLab CI workflow with auto-configured thresholds. Capstone feature. | Budget (16) | [plan](plans/20-ci-pipeline-generator.md) |

---

## XL effort / ⭐⭐⭐ wow — Moonshots

2+ weeks each. The features that make people say "this can't be a VS Code
extension." Save for last — they build on everything else.

| Feature | What | Depends On | Plan |
|---------|------|------------|------|
| **Pre-Flight SDK Upgrade Simulator** | "What breaks if I upgrade to Flutter 3.29?" Simulates upgrade, cross-references with vibrancy data, shows before/after risk report. **Partial:** `flutter-releases.ts`, `pub-outdated.ts` exist. | — | [plan](plans/02-preflight-sdk-upgrade-simulator.md) |
| **Conflict Forensics** | Parse `pub get` failure stderr into readable constraint chains. Enrich with vibrancy scores. Quick-fix actions to resolve. Solves the #1 Flutter pain point. | — | [plan](plans/01-conflict-forensics.md) |

---

## Build Order

Read top-to-bottom. Each row is a step; effort column tells you the time.

| # | Feature | Effort | Wow | Unlocks |
|---|---------|--------|-----|---------|
| 0 | Package Detail View | S | ⭐ | — |
| 1 | Dependency Budget | M | ⭐⭐ | CI Pipeline (20) |
| 2 | Comparison View | M | ⭐⭐ | — |
| 3 | Changelog Diff Webview | M | ⭐ | — |
| 4 | CI Pipeline Generator | L | ⭐⭐ | — |
| 5 | Pre-Flight Simulator (partial) | XL | ⭐⭐⭐ | — |
| 6 | Conflict Forensics | XL | ⭐⭐⭐ | — |

---

## Shared Infrastructure

Build these with the first plan that needs them.

| File | Used By | Status |
|------|---------|--------|
| `detail-logger.ts` | 21, others | Not started |
| `pub-outdated.ts` | 02 | ✅ Built (for plan 05) |
| `flutter-releases.ts` | 02 | ✅ Built |

---

## Completed Features

The following features have been implemented and their plans moved to
`plans/history/`:

- **Transitive Dependency X-Ray** (04) — `dep-graph.ts`, `transitive-analyzer.ts`
- **"Why Can't I Upgrade?"** (05) — `pub-outdated.ts`, `blocker-analyzer.ts`
- **Package Family Conflict Detector** (08) — `family-conflict-detector.ts`
- **Upgrade Sequencer** (10) — `upgrade-sequencer.ts`
- **Package Adoption Gate** (11) — `adoption-gate.ts`
- **dependency_overrides Tracker** (14) — `override-parser.ts`, `override-analyzer.ts`
- **Dependency Freshness Watch** (19) — `freshness-watcher.ts`, `version-comparator.ts`
- **Alternative Package Suggestions** — `pub-dev-search.ts`
