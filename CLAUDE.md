# Claude Code Instructions - Saropa Package Vibrancy

## Project Overview

VS Code extension that analyzes Flutter project dependencies for community
"vibrancy" (health/activity). Queries Pub.dev and GitHub APIs, calculates a
Vibrancy Score, and categorizes packages as Vibrant, Quiet, Legacy-Locked,
or End of Life. Surfaces results as inline diagnostics, hover tooltips,
code actions, a sidebar tree view, and a webview dashboard.

## Key Structure

| Category    | Location                | Purpose                            |
| ----------- | ----------------------- | ---------------------------------- |
| Entry Point | `src/extension.ts`      | VS Code activate/deactivate        |
| Activation  | `src/extension-activation.ts` | Wiring: commands, providers, watcher |
| Orchestrator| `src/scan-orchestrator.ts` | Per-package analysis pipeline     |
| Types       | `src/types.ts`          | Core interfaces                    |
| Scoring     | `src/scoring/`          | V_score calculation, classifier    |
| Services    | `src/services/`         | API clients, parsers, cache        |
| Providers   | `src/providers/`        | Tree view, diagnostics, hover, code actions |
| UI          | `src/ui/`               | Status bar                         |
| Views       | `src/views/`            | Webview report panel               |
| Data        | `src/data/`             | Bundled known-issues JSON          |
| Tests       | `src/test/`             | Unit tests + VS Code mock          |
| Fixtures    | `src/test/fixtures/`    | Sample API responses               |
| Spec        | `PLAN.md`               | Full requirements specification    |

## Commands

- `npm run compile` — Type-check, lint, and bundle
- `npm test` — Run Mocha test suite
- `npm run lint` — Run ESLint
- `npm run package` — Production build for marketplace
- Press F5 in VS Code to launch Extension Development Host

## Conventions

- Services use native `fetch` for HTTP calls
- Scoring layer is pure functions (no I/O, no VS Code API)
- Caching uses VS Code `Memento` (globalState), not filesystem
- Known issues JSON is bundled data — a speed hint only; live APIs are authoritative
- File naming: kebab-case (`vibrancy-calculator.ts`, not `vibrancyCalculator.ts`)
- Tests use Mocha + Sinon with a comprehensive VS Code mock (`src/test/vscode-mock.ts`)
