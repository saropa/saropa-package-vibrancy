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

## M effort / ⭐⭐ wow — Core Differentiators

3–5 days each. These are what make Saropa clearly better than everything else.

| Feature | What | Plan |
|---------|------|------|
| ~~**Package Comparison View**~~ | ✅ Completed | — |
| ~~**Dependency Budget**~~ | ✅ Completed | — |
| ~~**Prerelease Versions**~~ | ✅ Completed | — |

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
| ~~**CI Pipeline Generator**~~ | ✅ Completed | — | — |
| ~~**Private Registry Auth**~~ | ✅ Completed | — | — |

---

## XL effort / ⭐⭐⭐ wow — Moonshots

2+ weeks each. The features that make people say "this can't be a VS Code
extension." Save for last — they build on everything else.

| Feature | What | Depends On | Plan |
|---------|------|------------|------|
| **Pre-Flight SDK Upgrade Simulator** | "What breaks if I upgrade to Flutter 3.29?" Simulates upgrade, cross-references with vibrancy data, shows before/after risk report. **Partial:** `flutter-releases.ts`, `pub-outdated.ts` exist. | — | [plan](plans/02-preflight-sdk-upgrade-simulator.md) |

---

## Build Order

Read top-to-bottom. Each row is a step; effort column tells you the time.

| # | Feature | Effort | Wow | Unlocks |
|---|---------|--------|-----|---------|
| 1 | ~~Dependency Budget (16)~~ | ✅ | ⭐⭐ | CI Pipeline (20) |
| 2 | ~~Comparison View (18)~~ | ✅ | ⭐⭐ | — |
| 3 | ~~Prerelease Versions (30)~~ | ✅ | ⭐⭐ | — |
| 4 | Changelog Diff Webview (15) | M | ⭐ | — |
| 5 | ~~Private Registry Auth (33)~~ | ✅ | ⭐⭐ | — |
| 6 | ~~CI Pipeline Generator (20)~~ | ✅ | ⭐⭐ | — |
| 7 | Pre-Flight Simulator (02) | XL | ⭐⭐⭐ | — |

**Note:** Vulnerability Radar (03) already covers OSV.dev integration — no new
plan needed.

---

## Shared Infrastructure

Build these with the first plan that needs them.

| File | Used By | Status |
|------|---------|--------|
| `detail-logger.ts` | 21 | ✅ Built |
| `pub-outdated.ts` | 02 | ✅ Built (for plan 05) |
| `flutter-releases.ts` | 02 | ✅ Built |

---

## Completed Features

The following features have been implemented and their plans moved to
`plans/history/`.

### 2026-03-11

- **Conflict Forensics** (01) — `blocker-enricher.ts`
- **Transitive Dependency X-Ray** (04) — `dep-graph.ts`, `transitive-analyzer.ts`
- **"Why Can't I Upgrade?"** (05) — `pub-outdated.ts`, `blocker-analyzer.ts`
- **Package Family Conflict Detector** (08) — `family-conflict-detector.ts`
- **Dependency Drift Timeline** (09) — `drift-calculator.ts`
- **Upgrade Sequencer** (10) — `upgrade-sequencer.ts`
- **Package Adoption Gate** (11) — `adoption-gate.ts`
- **Inline CodeLens Vibrancy Badges** (12) — `codelens-provider.ts`
- **Lock-File Diff Narrator** (13) — `lock-diff.ts`, `diff-narrator.ts`
- **Smart dependency_overrides Tracker** (14) — `override-parser.ts`, `override-analyzer.ts`
- **SBOM Generator** (17) — `sbom-generator.ts`, `sbom-exporter.ts`
- **Dependency Freshness Watch** (19) — `freshness-watcher.ts`, `version-comparator.ts`
- **License in Tree View** — `license-classifier.ts`
- **Unused Dependency Detection** — `unused-detector.ts`, `import-scanner.ts`

### 2026-03-12

- **Package Detail View** (21) — `detail-logger.ts`, webview panel
- **Post-Processing Consolidator** (23) — `consolidate-insights.ts`
- **Bulk Update Commands** (26) — `bulk-updater.ts`, `version-increment.ts`
- **Sort Dependencies** (27) — `pubspec-sorter.ts`
- **Custom Save Tasks** (28) — `dependency-differ.ts`, `save-task-runner.ts`
- **CodeLens Toggle** (29) — `context-state.ts`, status bar
- **Click-to-Update CodeLens** (31) — `upgrade-command.ts`
- **Customizable Indicators** (32) — `indicator-config.ts`
- **Context State Pattern** (34) — `state/context-state.ts`, `state/vibrancy-state.ts`
- **Alternative Package Suggestions** — `pub-dev-search.ts`
- **Package Comparison View** (18) — `comparison-ranker.ts`, `comparison-html.ts`, `comparison-webview.ts`
- **Private Registry Auth** (33) — `registry-service.ts`, `registry-commands.ts`
- **CI Pipeline Generator** (20) — `ci-generator.ts`, `threshold-suggester.ts`
- **Vulnerability Radar** (03) — `osv-api.ts`, `vuln-classifier.ts`
