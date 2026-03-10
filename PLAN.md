# Saropa Package Vibrancy: Requirements Specification

## 1. Primary Objective

A local CLI utility that analyzes a Flutter project's dependencies to measure their true "Vibrancy." It evaluates not just release dates and closed issues, but real-time community engagement, discussion velocity, and maintainer responsiveness to ensure the project relies on a living ecosystem.

## 2. Functional Requirements

### 2.1 Local Project Discovery

- **Root Identification:** The tool must automatically detect the Flutter project root by locating the `pubspec.yaml` and `pubspec.lock` files.
- **Dependency Extraction:** It must parse the `pubspec.lock` to identify exact versions of direct and transitive dependencies.
- **SDK Alignment:** The tool must read the local Flutter/Dart SDK versions to identify constraints that no longer align with the local environment.

### 2.2 Dynamic Vibrancy Verification

- **Real-Time API Queries:** The tool must query the **Pub.dev API** and **Repository APIs** (GitHub/GitLab).
- **The "Chattiness" Metric:** The tool must evaluate engagement by looking at the `updated_at` timestamps on open issues/PRs and the volume of recent comments, not just the `closed_at` timestamps.
- **Official Status Check:** It must detect the `is_discontinued` and `is_unlisted` flags directly from Pub.dev metadata.

### 2.3 Vibrancy Status Schema

Packages are categorized based on community heartbeat and maintainer action:

| Status            | Criteria                                                                                              | Risk Profile                                                    |
| :---------------- | :---------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------- |
| **Vibrant**       | High volume of recent comments, active discussions, OR closed issues/PRs within the last **90 days**. | Low: Thriving community and active support.                     |
| **Quiet**         | Low comment volume; no major code merges or issue resolutions in **180+ days**.                       | Medium: Stable but potentially stalling.                        |
| **Legacy-Locked** | Complete radio silence (no comments, commits, or issue activity) for **365+ days**.                   | High: Ghosted project; likely incompatible with modern SDKs.    |
| **End of Life**   | Formally marked "Discontinued" or structurally incompatible (e.g., no Null Safety).                   | Critical: Blocks modern builds; immediate replacement required. |

## 3. Technical Requirements

### 3.1 Execution & Performance

- **Zero-Config Execution:** Runs as a standalone binary or via `dart pub global run`.
- **Parallel Processing:** Fetches metadata for multiple packages concurrently.
- **Local Caching:** Results cache locally (`.saropa_cache`) for 24 hours to prevent API throttling during repeated local runs.

### 3.2 Security & Privacy

- **Local-Only Processing:** No proprietary code leaves the machine. Only package names and versions are queried against public APIs.
- **Authentication:** Supports an optional GitHub Personal Access Token (PAT) via environment variables to increase API rate limits for deep community metric scans.

### 3.3 The Vibrancy Algorithm

The tool calculates a **Vibrancy Score (V_score)** to rank the health of each package:

V*score = (W_r * R) + (W*e * E) + (W_p \* P)

Where:

- **R (Resolution Velocity):** The rate at which PRs are merged and issues are closed.
- **E (Engagement Level):** The "Chattiness" factor. Calculated by the average number of comments on recent issues and the recency of the `updated_at` timestamp across the repository.
- **P (Popularity):** Baseline Pub.dev points and GitHub stars.
- **W (Weights):** Adjustable constants where Engagement (W_e) and Resolution (W_r) heavily outweigh static Popularity (W_p).

## 4. Output Requirements

### 4.1 Developer Reports

- **CLI Dashboard:** A rich terminal output using ANSI colors that ranks packages from most vibrant to completely dead.
- **Vibrancy Audit File:** Generates a markdown file detailing the community health metrics, including links to the most active recent discussion threads for context. This file must be written to a `\report\` directory and prefixed with the current datetime (e.g., `\report\YYYY-MM-DD_HH-MM-SS_saropa_vibrancy.md`).

### 4.2 Integration Support

- **Machine-Readable JSON:** Standardized JSON output containing all computed metrics for CI/CD ingestion. This file must be written to a `\report\` directory and prefixed with the current datetime (e.g., `\report\YYYY-MM-DD_HH-MM-SS_saropa_vibrancy.json`).
- **Pipeline Guardrails:** Returns a non-zero exit code if **End of Life** or **Legacy-Locked** packages exceed a user-defined threshold, allowing teams to halt builds when technical debt becomes critical.

## Appendix A: Example JSON Output Schema (Non-Prescriptive)

**Example Filename:** `\report\2026-03-09_14-26-10_saropa_vibrancy.json`

This schema illustrates a potential data structure for the machine-readable audit report. It is designed to be easily parsed by automated guardrails (e.g., GitHub Actions, GitLab CI) to evaluate project health and halt builds if technical debt thresholds are breached.

```json
{
  "audit_metadata": {
    "timestamp": "2026-03-09T14:26:10Z",
    "flutter_version": "3.x.x",
    "dart_version": "3.x.x",
    "total_packages_scanned": 42,
    "execution_time_ms": 1450
  },
  "summary": {
    "vibrant_count": 35,
    "quiet_count": 4,
    "legacy_locked_count": 2,
    "end_of_life_count": 1
  },
  "packages": [
    {
      "name": "example_package",
      "installed_version": "2.1.0",
      "latest_version": "2.1.0",
      "status": "Vibrant",
      "vibrancy_score": 88.5,
      "metrics": {
        "resolution_velocity_R": {
          "closed_issues_last_90d": 45,
          "merged_prs_last_90d": 12,
          "days_since_last_close": 2
        },
        "engagement_level_E": {
          "avg_comments_per_active_issue": 8.4,
          "days_since_last_discussion": 1
        },
        "popularity_P": {
          "pub_points": 140,
          "github_stars": 1250
        }
      },
      "flags": {
        "is_discontinued": false,
        "is_unlisted": false,
        "null_safety": true
      },
      "urls": {
        "pub_dev": "[https://pub.dev/packages/example_package](https://pub.dev/packages/example_package)",
        "repository": "[https://github.com/example/example_package](https://github.com/example/example_package)"
      }
    },
    {
      "name": "ghosted_legacy_package",
      "installed_version": "0.9.5",
      "latest_version": "0.9.5",
      "status": "Legacy-Locked",
      "vibrancy_score": 12.0,
      "metrics": {
        "resolution_velocity_R": {
          "closed_issues_last_90d": 0,
          "merged_prs_last_90d": 0,
          "days_since_last_close": 412
        },
        "engagement_level_E": {
          "avg_comments_per_active_issue": 0.0,
          "days_since_last_discussion": 390
        },
        "popularity_P": {
          "pub_points": 90,
          "github_stars": 450
        }
      },
      "flags": {
        "is_discontinued": false,
        "is_unlisted": false,
        "null_safety": true
      },
      "urls": {
        "pub_dev": "[https://pub.dev/packages/ghosted_legacy_package](https://pub.dev/packages/ghosted_legacy_package)",
        "repository": "[https://github.com/example/ghosted_legacy_package](https://github.com/example/ghosted_legacy_package)"
      }
    }
  ]
}
```

## Appendix B: CI/CD Pipeline Integration (GitHub Actions)

**Example Filename:** `.github/workflows/saropa_vibrancy_check.yml`

This workflow demonstrates how to run the Saropa Package Vibrancy tool on every Pull Request. It uses `jq` to parse the datetime-prefixed JSON report and intentionally breaks the build if any "End of Life" packages are introduced or if "Legacy-Locked" packages exceed an acceptable threshold.

```yaml
name: Saropa Vibrancy Check

on:
  pull_request:
    branches: [main, develop]

jobs:
  audit-dependencies:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Flutter
        uses: subosito/flutter-action@v2
        with:
          flutter-version: "3.x.x"
          channel: "stable"

      - name: Install Dependencies
        run: flutter pub get

      - name: Run Saropa Package Vibrancy
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # Prevents API rate limits
        run: |
          # Assuming the tool is globally activated
          dart pub global run saropa_vibrancy:scan --output-dir ./report

      - name: Evaluate Vibrancy Thresholds
        run: |
          # Find the most recently generated JSON report
          LATEST_REPORT=$(ls -t ./report/*_saropa_vibrancy.json | head -n 1)

          echo "Analyzing report: $LATEST_REPORT"

          EOL_COUNT=$(jq '.summary.end_of_life_count' $LATEST_REPORT)
          LEGACY_COUNT=$(jq '.summary.legacy_locked_count' $LATEST_REPORT)

          echo "End of Life Packages: $EOL_COUNT"
          echo "Legacy-Locked Packages: $LEGACY_COUNT"

          if [ "$EOL_COUNT" -gt 0 ]; then
            echo "❌ BUILD FAILED: PR introduces or relies on End of Life packages."
            exit 1
          fi

          # Optional: Warn or fail on too much legacy debt
          if [ "$LEGACY_COUNT" -gt 5 ]; then
            echo "⚠️ WARNING: Technical debt threshold exceeded ($LEGACY_COUNT Legacy-Locked packages)."
            # exit 1 # Uncomment to enforce strict legacy limits
          fi

      - name: Archive Vibrancy Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: saropa-vibrancy-reports
          path: ./report/
```

---

## Appendix C: Customizable Configuration Schema

**Example Filename:** `saropa.yaml` (Placed in project root)

Different teams have different risk tolerances. An enterprise banking app might consider 6 months of silence a massive risk, while a side project might not care until 2 years have passed. This schema allows Tech Leads to override the default algorithm weights and thresholds.

```yaml
saropa_vibrancy:
  # The maximum days of silence before triggering status changes
  thresholds:
    quiet_days: 180
    legacy_locked_days: 365

  # Algorithm weights (Must sum to 1.0)
  weights:
    resolution_velocity: 0.5 # Heavy focus on maintainers actually merging code
    engagement_level: 0.4 # Focus on community chattiness/issue triage
    popularity: 0.1 # Low focus on historical GitHub stars/Pub points

  # Exemptions for internal or known-safe packages that rarely update
  allowlist:
    - my_internal_ui_library
    - simple_equatable_fork

  # Optional overrides for specific repository URLs if Pub.dev data is wrong
  repo_overrides:
    custom_package: "[https://github.com/my-org/custom_package](https://github.com/my-org/custom_package)"
```

---

## Appendix D: The Remediation Playbook

When the tool flags a package, the engineering team needs a standardized way to respond. This matrix defines the required actions based on the tool's output.

| Tool Output       | Project State                                                                   | Required Engineering Action                                                                                                                                                                                      |
| :---------------- | :------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vibrant**       | The package is actively maintained and discussed.                               | **No action.** Proceed with feature development.                                                                                                                                                                 |
| **Quiet**         | The maintainer has stepped back, but the code still compiles on modern Flutter. | **Monitor.** Do not build core architectural features around this package without a backup plan.                                                                                                                 |
| **Legacy-Locked** | The community has abandoned the repository. Unmerged PRs are piling up.         | **Decision Point:**<br>1. _Trivial Package:_ Replace it with native Flutter code.<br>2. _Complex Package:_ Fork the repository internally and merge the outstanding community Null Safety/Impeller PRs yourself. |
| **End of Life**   | The package is officially dead, completely insecure, or fails to compile.       | **Halt.** Refactor the codebase to rip out the dependency and replace it with a modern equivalent before the next major release.                                                                                 |

# Appendix E: VS Code Extension Architecture

## 1. Overview

While the Saropa Package Vibrancy tool functions as a standalone CLI for CI/CD pipelines, its primary developer interface should be a **Visual Studio Code Extension**. This surfaces maintenance decay directly in the IDE exactly when the developer is modifying the `pubspec.yaml`, preventing technical debt from entering the codebase in the first place.

## 2. Developer Experience (DX) Features

### 2.1 Inline Diagnostics (The "Squiggles")

The extension actively listens to the `onDidSaveTextDocument` event for `pubspec.yaml`. When saved, it runs the Saropa scan in the background and maps the results to VS Code's `DiagnosticCollection`.

- **Yellow Underline (Warning):** Applied to packages flagged as `Quiet` or `Stagnant`.
- **Red Underline (Error):** Applied to packages flagged as `Legacy-Locked` or `End of Life`.

### 2.2 Rich Hover Tooltips

Hovering over any dependency in the `pubspec.yaml` reveals a custom tooltip containing the live Saropa metrics:

- **Status:** 🔴 Legacy-Locked
- **Vibrancy Score:** 12/100
- **Last Activity:** 412 Days Ago
- **Quick Links:** `[View GitHub Issues]` | `[View Pub.dev Metrics]`

### 2.3 Code Actions (Quick Fixes)

When the tool detects a known abandoned package with a standard migration path (e.g., `connectivity`), the extension provides a VS Code "Quick Fix" (the lightbulb icon).

- Clicking **"Migrate to connectivity_plus"** automatically updates the package name and version constraint in the `pubspec.yaml`.

### 2.4 The Saropa Dashboard (Sidebar)

A dedicated panel in the VS Code Activity Bar (TreeView API) that lists all dependencies in the current project, sorted by their Vibrancy Score from highest (green) to lowest (red). This provides Tech Leads with an instant, project-wide health check without leaving the IDE.

## 3. System Architecture (The "Sidecar" Pattern)

To avoid duplicating logic and maintain a single source of truth, the extension does not perform the API calls or scoring itself. It acts as a frontend UI for the Dart CLI.

### 3.1 The Engine (Dart CLI)

- The core logic remains in pure Dart.
- It is executed by the extension using a special `--json-stdout` flag.
- It parses the lockfile, hits the Pub.dev/GitHub APIs, calculates the $V_{score}$, and streams a JSON array back to the standard output.

### 3.2 The Extension (TypeScript)

- The VS Code extension (written in TypeScript) spawns the Dart CLI process using Node's `child_process.spawn`.
- It consumes the JSON output and translates the `status` fields into VS Code `DiagnosticSeverity` levels (Warning/Error).
- It handles all UI rendering, hover providers, and code actions.

## Appendix F: VS Code Extension Manifest (`package.json`)

This manifest configures the extension's activation events, contributes the custom views to the Activity Bar, and exposes the settings needed to pass a GitHub token to the underlying Dart CLI.

```json
{
  "name": "saropa-package-vibrancy",
  "displayName": "Saropa Package Vibrancy",
  "description": "Real-time auditing of Flutter dependencies to detect legacy-locked and abandoned packages.",
  "version": "1.0.0",
  "publisher": "saropa",
  "engines": {
    "vscode": "^1.80.0"
  },
  "categories": ["Linters", "Other"],
  "activationEvents": ["workspaceContains:pubspec.yaml", "onLanguage:yaml"],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "saropa.scan",
        "title": "Saropa: Scan Flutter Dependencies",
        "icon": "$(sync)"
      },
      {
        "command": "saropa.clearDiagnostics",
        "title": "Saropa: Clear Vibrancy Warnings"
      }
    ],
    "viewsContainers": {
      "activitybar": [
        {
          "id": "saropa-explorer",
          "title": "Saropa Vibrancy",
          "icon": "resources/saropa-icon.svg"
        }
      ]
    },
    "views": {
      "saropa-explorer": [
        {
          "id": "saropa.dependencyView",
          "name": "Dependency Health",
          "type": "tree"
        }
      ]
    },
    "configuration": {
      "title": "Saropa Vibrancy",
      "properties": {
        "saropa.githubToken": {
          "type": "string",
          "default": "",
          "description": "Optional: Personal Access Token to prevent GitHub API rate limits during deep scans."
        },
        "saropa.runOnSave": {
          "type": "boolean",
          "default": true,
          "description": "Automatically run a vibrancy scan when pubspec.yaml is saved."
        },
        "saropa.thresholds.legacyLockedDays": {
          "type": "number",
          "default": 365,
          "description": "Number of days without merged PRs or closed issues before flagging as Legacy-Locked."
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "pretest": "npm run compile && npm run lint",
    "lint": "eslint src --ext ts",
    "test": "node ./out/test/runTest.js"
  },
  "devDependencies": {
    "@types/vscode": "^1.80.0",
    "@types/node": "18.x",
    "typescript": "^5.1.3",
    "eslint": "^8.41.0"
  }
}
```
