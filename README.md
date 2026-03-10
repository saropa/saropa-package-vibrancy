![Saropa Package Vibrancy](images/banner.png)

# Saropa Package Vibrancy

Analyze Flutter/Dart dependency health and community vibrancy directly in VS Code.

## Features

### Tree View
Dedicated sidebar showing all dependencies with color-coded vibrancy scores. Packages are sorted worst-first so you see problems immediately. Expand any package to see score breakdown, publish date, GitHub stars, and known issues.

### Diagnostics
Inline squiggles in `pubspec.yaml`:
- **Error** for End of Life packages
- **Warning** for Legacy-Locked packages
- **Info** for Quiet packages

Quick-fix suggestions offer replacements for known-bad packages.

### Hover Info
Hover over any package name in `pubspec.yaml` to see a tooltip with vibrancy score, category, publish date, GitHub stats, and a link to pub.dev.

### Status Bar
Shows overall project vibrancy score. Click to open the full report.

### Vibrancy Report
Full dashboard with sortable table, category breakdown, and summary cards.

## Commands

| Command | Description |
|---------|-------------|
| `Saropa: Scan Package Vibrancy` | Run a full vibrancy scan |
| `Saropa: Show Vibrancy Report` | Open the report dashboard |
| `Saropa: Clear Cache` | Clear cached API responses |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `saropaPackageVibrancy.githubToken` | `""` | GitHub PAT for increased rate limits |
| `saropaPackageVibrancy.scanOnOpen` | `true` | Auto-scan when project opens |
| `saropaPackageVibrancy.includeDevDependencies` | `false` | Include dev_dependencies |
| `saropaPackageVibrancy.cacheTtlHours` | `24` | Cache TTL in hours |

## Scoring Algorithm

```
V_score = (0.5 * R) + (0.4 * E) + (0.1 * P)

R = Resolution Velocity (closed issues + merged PRs in 90 days)
E = Engagement Level (comment volume + recency)
P = Popularity (pub.dev points + GitHub stars)
```

## Categories

| Category | Score Range | Meaning |
|----------|-----------|---------|
| Vibrant | 70-100 | Actively maintained, healthy community |
| Quiet | 40-69 | Maintained but low activity |
| Legacy-Locked | 10-39 | No recent updates, risky |
| End of Life | 0-9 | Abandoned, find replacement |

## Development

```bash
npm install
npm run compile
npm test
```

Press F5 in VS Code to launch the Extension Development Host for testing.
