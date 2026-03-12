# Plan: Dependency Budget

## Problem

Technical debt from dependencies accumulates silently. Teams add packages
without limits until the project has 80+ dependencies, 50MB of archives, and
3 End-of-Life packages nobody noticed. There is no mechanism to set and
enforce health policy on a Flutter project's dependency profile.

## Goal

Let teams define project-level dependency budgets (max count, max size,
minimum average vibrancy, max unhealthy packages). Show a visual gauge in
the sidebar. Return a non-zero exit code when budgets are exceeded for CI
enforcement.

## Budget Dimensions

| Dimension            | Setting Key                        | Default | Unit      |
| -------------------- | ---------------------------------- | ------- | --------- |
| Max total deps       | `budget.maxDependencies`           | `null`  | count     |
| Max total size       | `budget.maxTotalSizeMB`            | `null`  | megabytes |
| Min avg vibrancy     | `budget.minAverageVibrancy`        | `null`  | 0–100     |
| Max End-of-Life      | `budget.maxEndOfLife`              | `null`  | count     |
| Max Legacy-Locked    | `budget.maxLegacyLocked`           | `null`  | count     |
| Max unused deps      | `budget.maxUnused`                 | `null`  | count     |

All defaults are `null` (no limit). When a value is set, it becomes an
enforced budget.

## How It Works

### Step 1: Compute Actuals

After each scan, calculate actual values for each budget dimension from the
scan results:

- Total dependency count (from results array length)
- Total archive size (sum of `archiveSizeBytes` across results)
- Average vibrancy score (mean of all `score` values)
- End-of-Life count (filter by category)
- Legacy-Locked count (filter by category)
- Unused count (filter by `isUnused`)

### Step 2: Compare Against Budgets

For each dimension where a budget is configured:
- Compare actual vs budget
- Compute percentage: `actual / budget * 100`
- Classify: `under` (< 80%), `warning` (80–99%), `exceeded` (>= 100%)

### Step 3: Surface Results

Show budget status in the sidebar header and as diagnostics.

## UI: Sidebar Header

Add a budget summary below the tree view title:

```
Package Vibrancy v0.1.2
📊 Budget: 2/4 limits OK, 1 warning, 1 exceeded
```

Or if all budgets pass:
```
📊 Budget: All limits OK ✓
```

## UI: Tree View Group

Add a top-level `📊 Budget` group when any budget is configured:

```
📊 Budget
  ├─ Dependencies: 42/50 (84%) ⚠️ Warning
  ├─ Total Size: 28.5/40.0 MB (71%) ✅
  ├─ Avg Vibrancy: 68/60 min ✅
  └─ End of Life: 3/1 max ❌ Exceeded
```

## UI: Diagnostics

When a budget is exceeded, add a **Warning** diagnostic at the top of
`pubspec.yaml` (line 0):

```
Budget exceeded: 3 End-of-Life packages (limit: 1). Remove or replace:
flutter_datetime_picker, apple_sign_in, progress_dialog
```

## CI Mode

New command: `Saropa: Check Budget (CI)`

- Runs scan + budget check
- Writes results to stdout as JSON
- Returns exit code 0 (all pass), 1 (warning), 2 (exceeded)
- Designed for `npx` invocation in CI pipelines:
  ```bash
  npx saropa-vibrancy-check --budget
  ```

Note: VS Code extensions can't return exit codes directly. The CI mode
would be a separate thin CLI wrapper that invokes the scoring/budget logic
without VS Code APIs (the scoring layer is already pure functions).

## Changes

### New File: `src/scoring/budget-checker.ts`

- `checkBudgets(results, config): BudgetResult[]` — pure function
- Computes actuals, compares against configured limits
- Returns per-dimension status

### New Types in `src/types.ts`

```typescript
interface BudgetConfig {
  readonly maxDependencies: number | null;
  readonly maxTotalSizeMB: number | null;
  readonly minAverageVibrancy: number | null;
  readonly maxEndOfLife: number | null;
  readonly maxLegacyLocked: number | null;
  readonly maxUnused: number | null;
}

type BudgetStatus = 'under' | 'warning' | 'exceeded' | 'unconfigured';

interface BudgetResult {
  readonly dimension: string;
  readonly actual: number;
  readonly limit: number | null;
  readonly percentage: number | null;
  readonly status: BudgetStatus;
  readonly details: string;
}
```

### Modified: `src/extension-activation.ts`

- Run budget check after scan
- Pass results to tree provider and diagnostics

### Modified: `src/providers/tree-data-provider.ts`

- Add `BudgetGroupItem` at top of tree when budgets are configured

### Modified: `src/providers/tree-items.ts`

- New `BudgetItem` with emoji and percentage display

### Modified: `src/providers/diagnostics.ts`

- Add budget-exceeded diagnostic at line 0 of pubspec.yaml

### Modified: `package.json`

- Add settings under `saropaPackageVibrancy.budget.*` for each dimension
- Add command: `saropaPackageVibrancy.checkBudget`

### Tests

- `src/test/scoring/budget-checker.test.ts` — all budgets pass, one
  exceeded, warning zone, no budgets configured (all unconfigured),
  edge case: zero dependencies

## Out of Scope

- Standalone CLI tool for CI (v1 is VS Code only; CI wrapper is a future
  separate package)
- Per-package budgets (only project-level)
- Budget history/trends
