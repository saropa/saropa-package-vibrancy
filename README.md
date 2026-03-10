![Saropa Package Vibrancy](https://raw.githubusercontent.com/saropa/saropa-package-vibrancy/master/images/banner.png)

<!-- # Saropa Package Vibrancy -->

> Analyze Flutter/Dart dependency health and community vibrancy directly in VS Code.

## Install

```
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Saropa Package Vibrancy"
4. Click Install
```

## Use

```
1. Open a Flutter/Dart project with a pubspec.yaml
2. Dependencies are scanned automatically on open
3. To scan manually: Ctrl+Shift+P → "Saropa: Scan Package Vibrancy"
4. View results in:
   - Sidebar    → per-package vibrancy scores (worst-first)
   - Editor     → inline diagnostics in pubspec.yaml
   - Hover      → tooltip summary on any package name
   - Status bar → overall project score (click for full report)

Optional: set a GitHub token for higher API rate limits
  Settings → saropaPackageVibrancy.githubToken
```

## Features

### Tree View

Dedicated sidebar showing all dependencies with color-coded vibrancy scores. Packages are sorted worst-first so you see problems immediately. Expand any package to see score breakdown, publish date, GitHub stars, and known issues.

### Diagnostics

Inline squiggles in `pubspec.yaml`:

- **Warning** for End of Life packages
- **Information** for Legacy-Locked packages
- **Hint** for Quiet packages

Quick-fix suggestions offer replacements for known-bad packages.

### Hover Info

Hover over any package name in `pubspec.yaml` to see a tooltip with vibrancy score, category, publish date, GitHub stats, and a link to pub.dev.

### Status Bar

Shows overall project vibrancy score. Click to open the full report.

### Vibrancy Report

Full dashboard with sortable table, category breakdown, and summary cards.

## Commands

| Command                                | Description                                        |
| -------------------------------------- | -------------------------------------------------- |
| `Saropa: Scan Package Vibrancy`        | Run a full vibrancy scan                           |
| `Saropa: Show Vibrancy Report`         | Open the report dashboard                          |
| `Saropa: Export Vibrancy Report`       | Export results as Markdown + JSON to report/        |
| `Saropa: Browse Known Issues Library`  | Browse the bundled known issues database            |
| `Saropa: Clear Cache`                  | Clear cached API responses                         |
| `Upgrade & Test`                       | Upgrade a dependency and auto-rollback on test fail |

Tree view context menu actions: Go to pubspec.yaml, Open on pub.dev, Update to Latest, Copy as JSON, Suppress/Unsuppress Package.

## Configuration

| Setting                                             | Default | Description                                       |
| --------------------------------------------------- | ------- | ------------------------------------------------- |
| `saropaPackageVibrancy.githubToken`                 | `""`    | GitHub PAT for increased rate limits              |
| `saropaPackageVibrancy.scanOnOpen`                  | `true`  | Auto-scan when project opens                      |
| `saropaPackageVibrancy.includeDevDependencies`      | `false` | Include dev_dependencies                          |
| `saropaPackageVibrancy.cacheTtlHours`               | `24`    | Cache TTL in hours                                |
| `saropaPackageVibrancy.suppressedPackages`          | `[]`    | Suppress packages from diagnostics and hover      |
| `saropaPackageVibrancy.allowlist`                   | `[]`    | Package names to skip during scan                 |
| `saropaPackageVibrancy.repoOverrides`               | `{}`    | Override GitHub repo URLs for packages            |
| `saropaPackageVibrancy.weights.resolutionVelocity`  | `0.5`   | Weight for Resolution Velocity in V_score         |
| `saropaPackageVibrancy.weights.engagementLevel`     | `0.4`   | Weight for Engagement Level in V_score            |
| `saropaPackageVibrancy.weights.popularity`           | `0.1`   | Weight for Popularity in V_score                  |

## Scoring Algorithm

```
V_score = (0.5 * R) + (0.4 * E) + (0.1 * P)

R = Resolution Velocity (closed issues + merged PRs in 90 days)
E = Engagement Level (comment volume + recency)
P = Popularity (pub.dev points + GitHub stars)
```

## Categories

| Category      | Score | Meaning                                |
| ------------- | ----- | -------------------------------------- |
| Vibrant       | 7-10  | Actively maintained, healthy community |
| Quiet         | 4-6   | Maintained but low activity            |
| Legacy-Locked | 1-3   | No recent updates, risky               |
| End of Life   | 0     | Abandoned, find replacement            |

## Development

```bash
npm install
npm run compile
npm test
```

Press F5 in VS Code to launch the Extension Development Host for testing.
