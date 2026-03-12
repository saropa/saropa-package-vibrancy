# Plan: Package Comparison View

## Problem

When a package is flagged as unhealthy and alternatives are suggested,
developers need to compare candidates side-by-side. Currently they open
multiple pub.dev tabs and manually compare stats. This is the #7 pain point
from the research: "7+ packages claim similar functionality" and there's no
good way to evaluate them.

## Goal

Select 2–3 packages and open a side-by-side comparison webview showing
vibrancy score, size, platforms, stars, last update, license, and more.
Works for both packages already in the project and candidates being
evaluated.

## How It Works

### Step 1: Select Packages

Three entry points:

1. **Tree view**: Multi-select 2–3 packages → right-click → "Compare"
2. **Command palette**: `Saropa: Compare Packages` → quick-pick to select
   2–3 packages from scan results
3. **Command palette with search**: `Saropa: Compare Packages` → type
   package names manually (for packages not in the project)

### Step 2: Fetch Data

For packages already in the project: use existing scan results.

For external packages (typed by name): run the same lightweight check as
the Adoption Gate — `fetchPackageInfo()`, `fetchPackageScore()`,
`fetchPublisher()`. This gives enough data for comparison without a full
vibrancy scan.

### Step 3: Build Comparison Table

Render a webview with a horizontal comparison table:

```
                    | http          | dio           | chopper
--------------------|---------------|---------------|----------
Vibrancy Score      | 🟢 92/100    | 🟢 88/100    | 🟡 54/100
Category            | Vibrant       | Vibrant       | Quiet
Latest Version      | 1.3.0         | 5.4.0         | 7.3.0
Published           | 2026-02-14    | 2026-01-30    | 2025-09-12
Publisher           | dart.dev ✓    | — (unverified)| — (unverified)
Pub Points          | 140           | 130           | 110
GitHub Stars        | 890           | 12,400        | 870
Open Issues         | 12            | 89            | 34
Archive Size        | 0.3 MB        | 1.2 MB        | 0.8 MB
Bloat Rating        | 2/10          | 5/10          | 4/10
License             | BSD-3-Clause  | MIT           | MIT
Platforms           | All           | All           | All
In This Project     | ✅ Yes        | ❌ No         | ❌ No
```

### Step 4: Highlight Winner

For each row, bold the "best" value:
- Highest vibrancy score
- Smallest archive size
- Most recent publish date
- Verified publisher preferred
- Most pub points

Show a summary line: "Recommendation: **http** scores highest overall.
**dio** has more community traction (stars)."

## UI: Webview

- Side-by-side responsive table
- Themed for light/dark VS Code
- Each package name is a clickable link to pub.dev
- "Add to project" button for packages not yet in pubspec.yaml (inserts
  the dependency line)

## Changes

### New File: `src/views/comparison-html.ts`

- `buildComparisonHtml(packages: ComparisonData[]): string`
- HTML template with comparison table
- Client-side JavaScript for winner highlighting

### New File: `src/views/comparison-webview.ts`

- `ComparisonPanel` class — webview lifecycle
- `createOrShow(packages)` — static factory
- Handles "Add to project" messages from webview

### New File: `src/scoring/comparison-ranker.ts`

- `rankPackages(packages: ComparisonData[]): RankedComparison`
  — pure function
- Identifies "winner" per dimension
- Generates summary recommendation text

### New Types in `src/types.ts`

```typescript
interface ComparisonData {
  readonly name: string;
  readonly vibrancyScore: number | null;
  readonly category: VibrancyCategory | null;
  readonly latestVersion: string;
  readonly publishedDate: string | null;
  readonly publisher: string | null;
  readonly pubPoints: number;
  readonly stars: number | null;
  readonly openIssues: number | null;
  readonly archiveSizeBytes: number | null;
  readonly bloatRating: number | null;
  readonly license: string | null;
  readonly platforms: readonly string[];
  readonly inProject: boolean;
}
```

### Modified: `src/extension-activation.ts`

- Register `saropaPackageVibrancy.comparePackages` command
- Wire up quick-pick for package selection

### Modified: `src/providers/tree-commands.ts`

- Add "Compare" to multi-select context menu

### Modified: `package.json`

- Add command: `saropaPackageVibrancy.comparePackages` / "Saropa: Compare
  Packages"
- Add to tree view context menu (when 2+ items selected)

### Tests

- `src/test/views/comparison-html.test.ts` — HTML rendering: 2 packages,
  3 packages, missing data fields, winner highlighting
- `src/test/scoring/comparison-ranker.test.ts` — ranking logic: clear
  winner, tied scores, one package missing data

## Out of Scope

- Comparing more than 3 packages (table becomes too wide)
- Historical comparison (how scores changed over time)
- Automatic replacement from the comparison view
