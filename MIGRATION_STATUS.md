# Migration Status: Dart CLI → VS Code Extension

Reference spec: `saropa_package_validator/PLAN.md`

## Implemented (verified in source)

### Scoring Algorithm (PLAN.md §3.3)

| Component | Dart File | TypeScript File | Notes |
|-----------|-----------|-----------------|-------|
| V_score formula | `scoring/vibrancy_calculator.dart` | `src/scoring/vibrancy-calculator.ts` | Same formula: `(0.5*R) + (0.4*E) + (0.1*P)` |
| Resolution Velocity (R) | same | same | Closed issues + merged PRs in 90d + recency |
| Engagement Level (E) | same | same | Avg comments + recency of last update |
| Popularity (P) | same | same | Pub points (normalized to 150) + stars (normalized to 5000) |
| Status Classifier | `scoring/status_classifier.dart` | `src/scoring/status-classifier.ts` | Categories: vibrant (≥70), quiet (≥40), legacy-locked (≥10), end-of-life (<10) |
| Known Issues DB | `data/known_issues.json` | `src/data/knownIssues.json` | 100 curated packages, same data |

**Weights are hardcoded** (0.5, 0.4, 0.1). Dart CLI supports override via `saropa.yaml`. Extension does not.

### API Services (PLAN.md §2.2)

| Service | Dart File | TypeScript File | Notes |
|---------|-----------|-----------------|-------|
| Pub.dev metadata | `services/pub_api_service.dart` | `src/services/pub-dev-api.ts` | Fetches name, version, published date, repo URL, discontinued/unlisted flags |
| Pub.dev score | same | same | Fetches `grantedPoints` from `/score` endpoint |
| GitHub metrics | `services/github_api_service.dart` | `src/services/github-api.ts` | 3 parallel calls: repo + issues + pulls. Extracts stars, closed issues/PRs in 90d, avg comments, recency |
| GitHub URL parsing | same | same | Regex: `github.com/owner/repo` |
| GitHub auth token | same | same | Optional PAT via VS Code setting (Dart used env var) |

### Pubspec Parsing (PLAN.md §2.1)

| Feature | Dart File | TypeScript File | Notes |
|---------|-----------|-----------------|-------|
| Parse pubspec.yaml | `services/pubspec_parser.dart` | `src/services/pubspec-parser.ts` | Extracts direct + dev dependency names |
| Parse pubspec.lock | same | same | Extracts name, version, source, isDirect |
| Find package range | N/A (CLI didn't need this) | same | Locates package name position for inline diagnostics |

### Caching (PLAN.md §3.1)

| Feature | Dart File | TypeScript File | Notes |
|---------|-----------|-----------------|-------|
| TTL-based cache | `cache/file_cache.dart` | `src/services/cache-service.ts` | Dart: file-based in `.saropa_cache/`. Extension: VS Code Memento (global state) |
| 24h default TTL | same | same | Extension adds configurable TTL (1–168h via setting) |
| Cache clear | N/A | same | Extension adds command to clear cache |

### Orchestration

| Feature | Dart File | TypeScript File | Notes |
|---------|-----------|-----------------|-------|
| Full scan pipeline | `orchestrator.dart` | `src/scan-orchestrator.ts` + `src/extension-activation.ts` | Dart: single class. Extension: split across orchestrator (per-package) and activation (scan loop) |
| Progress reporting | `cli/progress.dart` | `src/extension-activation.ts` | Dart: CLI spinner. Extension: VS Code notification progress bar |
| Auto-scan on change | N/A | `src/extension-activation.ts` | Extension watches `pubspec.lock` for changes |

### VS Code Extension UI (PLAN.md Appendix E)

| Feature | Spec Section | TypeScript File | Notes |
|---------|-------------|-----------------|-------|
| Inline diagnostics (squiggles) | §2.1 | `src/providers/diagnostics.ts` | Error for EOL, Warning for Legacy-Locked, Info for Quiet, skips Vibrant |
| Hover tooltips | §2.2 | `src/providers/hover-provider.ts` | Markdown table: score, category, version, published date, pub points, stars, known issue |
| Code actions (quick fix) | §2.3 | `src/providers/code-action-provider.ts` | "Replace with X" when known-issues has a replacement |
| Sidebar tree view | §2.4 | `src/providers/tree-data-provider.ts` + `tree-items.ts` | Sorted worst-first, expandable detail items |
| Status bar | N/A | `src/ui/status-bar.ts` | Shows avg score, clickable to open report |
| Webview report panel | N/A | `src/views/report-webview.ts` + `report-html.ts` + `report-styles.ts` + `report-script.ts` | Sortable HTML table with summary cards |

### Configuration

| Setting | Spec Source | Implemented |
|---------|------------|-------------|
| GitHub token | PLAN.md §3.2 | Yes — `saropaPackageVibrancy.githubToken` |
| Auto-scan on open | Appendix E §2.1 | Yes — `saropaPackageVibrancy.scanOnOpen` |
| Include dev deps | N/A (new) | Yes — `saropaPackageVibrancy.includeDevDependencies` |
| Cache TTL | N/A (new) | Yes — `saropaPackageVibrancy.cacheTtlHours` |

### Tests

14 test files covering: vibrancy calculator, status classifier, known issues, pub.dev API, GitHub API, cache service, pubspec parser, tree data provider, diagnostics, hover provider, code actions, status bar, report HTML, extension entry point.

---

## Recently Implemented (formerly gaps)

### 1. Report File Export — DONE

- `src/services/report-exporter.ts` — exports timestamped markdown + JSON to `report/` directory
- Command: `Saropa: Export Vibrancy Report`
- JSON schema matches PLAN.md Appendix A format

### 2. Custom Scoring Weights — DONE

- VS Code settings: `saropaPackageVibrancy.weights.resolutionVelocity`, `.engagementLevel`, `.popularity`
- `computeVibrancyScore()` accepts optional `ScoringWeights` parameter
- Defaults: 0.5, 0.4, 0.1 (same as spec)

### 3. SDK Version Detection — DONE

- `src/services/sdk-detector.ts` — runs `dart --version` and `flutter --version`
- SDK versions included in exported report metadata

### 4. Allowlist — DONE

- VS Code setting: `saropaPackageVibrancy.allowlist` (string array)
- Packages in the allowlist are skipped during scan

### 5. Execution Metadata — DONE

- Scan timing tracked via `Date.now()` delta
- Included in exported report metadata alongside SDK versions

## Remaining Gaps

### CI/CD Exit Codes (PLAN.md §4.2) — N/A for extension

CLI-specific feature. Not applicable to a VS Code extension.

### Repo URL Overrides (Appendix C) — LOW

Custom repository URL overrides for packages where Pub.dev data is wrong. Not yet implemented.

---

## Architecture Differences

| Aspect | Dart CLI | VS Code Extension |
|--------|----------|-------------------|
| Language | Dart | TypeScript |
| Caching | File-based (`.saropa_cache/`) | VS Code Memento (global state) |
| Config | `saropa.yaml` file | VS Code settings JSON |
| Output | CLI terminal + file reports | Webview + inline diagnostics + sidebar |
| HTTP client | `package:http` (injectable) | Native `fetch` (not injectable) |
| Scanning | Parallel with `Future.wait` | Sequential loop with progress |

---

## Project Meta / Tooling (migrated)

### 7. Publish Pipeline — DONE

- `scripts/publish.py` + `scripts/modules/` — 13-step gated pipeline adapted for `vsce package` / `vsce publish`
- Same pattern as Dart CLI: prerequisites, git state, deps, lint, compile, tests, quality, version, publish

### 8. Banner Image — DONE

- `images/banner.png` copied from Dart CLI
- Referenced in README header

### 9. Claude Config — DONE

- `CLAUDE.md` — project overview, structure, commands, conventions
- `.claude/rules/global.md` — code quality limits, commit hygiene
- `.claude/rules/testing.md` — test structure, required cases
- `.claude/rules/typescript.md` — TypeScript-specific style and architecture rules

### 10. LICENSE File — DONE

- `LICENSE` (MIT, Copyright 2025 Saropa) copied from Dart CLI

### 11. ABOUT_SAROPA.md — DONE

- Copied from Dart CLI

### 12. TOP_100_STATUS.md — DONE

- Copied from Dart CLI (research backing the known-issues database)

### 13. PLAN.md (Spec) — DONE

- Copied from Dart CLI (canonical requirements spec)

### 14. .gitignore — DONE

- Updated with: `.saropa/`, `*.bak`, `.idea/`, `*.iml`, AI tool configs (`.cursor/`, `.copilot/`, `.aider*`, `.codeium/`)

### 15. .vscodeignore — OK (no change needed)

- Already correctly configured for marketplace packaging

---

## Dart CLI Files NOT Needed in Extension

These exist in the Dart CLI but are replaced by VS Code APIs or not applicable:

- `cli/arg_parser.dart` — replaced by VS Code commands
- `cli/scan_command.dart` — replaced by `extension-activation.ts`
- `cli/ansi.dart` — replaced by VS Code theme colors
- `reporters/cli_dashboard.dart` — replaced by webview report
- `bin/saropa_package_validator.dart` — replaced by `extension.ts`
- `analysis_options.yaml` — Dart-specific; extension uses `eslint.config.mjs`
- `.pubignore` — Dart-specific; extension uses `.vscodeignore`
