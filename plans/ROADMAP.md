# Feature Roadmap

15 planned features sorted by effort vs wow factor.

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
| **Package Detail View** | Selection-synced sidebar webview showing full package details. Replaces long tree suffixes with rich, searchable view. Output channel logging for persistence. | [plan](21-package-detail-view.md) |

---

## M effort / ⭐⭐ wow — Core Differentiators

3–5 days each. These are what make Saropa clearly better than everything else.

| Feature | What | Plan |
|---------|------|------|
| **Package Family Conflict Detector** | Detect when Firebase/Riverpod/Bloc packages are on incompatible major versions. Pure pattern matching, no CLI calls. Top-5 pain point. | [plan](08-package-family-conflict-detector.md) |
| **Package Adoption Gate** | Real-time vibrancy check as you type a new dep in pubspec.yaml. Inline decoration before `pub get`. Prevent > detect. | [plan](11-package-adoption-gate.md) |
| **Package Comparison View** | Select 2–3 packages, open side-by-side webview comparing score, size, platforms, stars, license. Winner highlighting. | [plan](18-package-comparison-view.md) |
| **Dependency Budget** | Project-level limits: max deps, min avg vibrancy, max EOL. Visual gauge in sidebar. Non-zero exit code for CI. | [plan](16-dependency-budget.md) |

---

## M effort / ⭐ wow — Solid Additions

3–5 days each. Useful, not flashy. Fill gaps and improve daily workflow.

| Feature | What | Plan |
|---------|------|------|
| **dependency_overrides Tracker** | Parse overrides, track age via git blame, detect stale ones safe to remove. Quick-fix to delete. | [plan](14-smart-dependency-overrides-tracker.md) |
| **Changelog Diff Webview** | Full searchable changelog between pinned and latest. BREAKING markers in red, migration instructions in blue. | [plan](15-changelog-diff-webview.md) |
| **Dependency Freshness Watch** | Background polling, batched toast when deps publish new versions. Like Dependabot but local and instant. | [plan](19-dependency-freshness-watch.md) |

---

## L effort / ⭐⭐⭐ wow — Killer Features

1–2 weeks each. Nobody else does these. Worth the investment.

| Feature | What | Depends On | Plan |
|---------|------|------------|------|
| **Why Can't I Upgrade?** | Plain-English blocker explanations. "You can't upgrade `intl` because `date_picker_timeline` requires `<0.18`." Creates shared `pub-outdated.ts`. | — | [plan](05-why-cant-i-upgrade.md) |
| **Upgrade Sequencer** | Topological sort + risk gradient. Step-by-step upgrades with test gates. Auto-rollback on failure. | Transitive X-Ray (04), Family Conflicts (08) | [plan](10-upgrade-sequencer.md) |

---

## L effort / ⭐⭐ wow — Infrastructure Builders

1–2 weeks each. Impressive on their own, but also unlock the killer features.

| Feature | What | Depends On | Plan |
|---------|------|------------|------|
| **Transitive Dependency X-Ray** | `dart pub deps --json` graph analysis. Count transitives per dep, find shared deps, flag hidden risks. Creates shared `dep-graph.ts`. | — | [plan](04-transitive-dependency-xray.md) |
| **CI Pipeline Generator** | One command generates a GitHub Actions / GitLab CI workflow with auto-configured thresholds. Capstone feature. | Budget (16) | [plan](20-ci-pipeline-generator.md) |

---

## XL effort / ⭐⭐⭐ wow — Moonshots

2+ weeks each. The features that make people say "this can't be a VS Code
extension." Save for last — they build on everything else.

| Feature | What | Depends On | Plan |
|---------|------|------------|------|
| **Pre-Flight SDK Upgrade Simulator** | "What breaks if I upgrade to Flutter 3.29?" Simulates upgrade, cross-references with vibrancy data, shows before/after risk report. | Why Can't I Upgrade (05) | [plan](02-preflight-sdk-upgrade-simulator.md) |
| **Conflict Forensics** | Parse `pub get` failure stderr into readable constraint chains. Enrich with vibrancy scores. Quick-fix actions to resolve. Solves the #1 Flutter pain point. | — | [plan](01-conflict-forensics.md) |

---

## Build Order

Read top-to-bottom. Each row is a step; effort column tells you the time.

| # | Feature | Effort | Wow | Unlocks |
|---|---------|--------|-----|---------|
| 0 | Package Detail View | S | ⭐ | — |
| 1 | Family Conflict Detector | M | ⭐⭐ | Upgrade Sequencer (10) |
| 2 | Adoption Gate | M | ⭐⭐ | — |
| 3 | Dependency Budget | M | ⭐⭐ | CI Pipeline (20) |
| 4 | Comparison View | M | ⭐⭐ | — |
| 5 | Overrides Tracker | M | ⭐ | — |
| 6 | Changelog Diff Webview | M | ⭐ | — |
| 7 | Freshness Watch | M | ⭐ | — |
| 8 | Why Can't I Upgrade? | L | ⭐⭐⭐ | Pre-Flight Sim (02) |
| 9 | Transitive X-Ray | L | ⭐⭐ | Upgrade Sequencer (10) |
| 10 | Upgrade Sequencer | L | ⭐⭐⭐ | — |
| 11 | CI Pipeline Generator | L | ⭐⭐ | — |
| 12 | Pre-Flight Simulator | XL | ⭐⭐⭐ | — |
| 13 | Conflict Forensics | XL | ⭐⭐⭐ | — |

---

## Shared Infrastructure

Build these with the first plan that needs them.

| File | Used By | Build With |
|------|---------|------------|
| `detail-logger.ts` | 21, others | #0 Package Detail View |
| `pub-outdated.ts` | 02, 05 | #8 Why Can't I Upgrade |
| `dep-graph.ts` | 04, 05, 10 | #9 Transitive X-Ray |
| `package-families.ts` | 08, 10 | #1 Family Conflicts |
