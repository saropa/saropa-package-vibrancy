# Plan: Dependency Impact Score

## Problem

When a dependency goes stale, developers need to decide: replace it now or
later? The answer depends on how deeply it's embedded in the codebase. A
package imported in 2 files is a 30-minute swap. One imported in 47 files
across every layer is a multi-day migration. No tool currently measures this.

## Goal

Scan the project's Dart source to measure how deeply each dependency is
embedded: import count, file count, and layer spread. Show a "migration
difficulty" badge that helps prioritize which stale deps to replace first.

## How It Works

### Step 1: Scan Imports (Extend Existing)

The existing `import-scanner.ts` already scans `lib/`, `bin/`, `test/` for
`import 'package:X/'` statements. Extend it to return per-package details:

- **File count**: How many `.dart` files import this package
- **Import count**: Total import statements (a file might import multiple
  entry points from the same package)
- **Layer spread**: Which top-level directories use it:
  - `lib/` = production code
  - `test/` = test code only
  - `bin/` = CLI entry points

### Step 2: Compute Impact Score

A simple 1–5 scale based on file count and layer spread:

| Score | Label        | Criteria                                    |
| ----- | ------------ | ------------------------------------------- |
| 1     | Trivial      | 1–2 files, single layer                     |
| 2     | Easy         | 3–5 files, single layer                     |
| 3     | Moderate     | 6–15 files OR 2 layers                      |
| 4     | Hard         | 16–30 files OR 3 layers AND 10+ files       |
| 5     | Entrenched   | 31+ files                                   |

Pure function, no I/O.

### Step 3: Combine with Vibrancy Score

The real insight is the combination:
- **Low vibrancy + high impact** = urgent risk (hard to replace, getting
  worse)
- **Low vibrancy + low impact** = easy win (replace it now)
- **High vibrancy + high impact** = fine (healthy and embedded)

Show a "priority" signal that combines both dimensions.

## UI: Tree View

Add impact details to each package:

```
📦 http
  🔧 Impact
    ├─ Files: 12
    ├─ Imports: 18
    ├─ Layers: lib/, test/
    └─ Difficulty: Moderate (3/5)
```

## UI: Hover

Add to hover tooltip:
```
| Migration Difficulty | Moderate (3/5) — 12 files, 2 layers |
```

## UI: Report

Add "Impact" column to the report table (1–5 with label).
Add a "Priority" column combining vibrancy + impact:
- Red: Low vibrancy + high impact
- Yellow: Low vibrancy + low impact (easy win)
- Green: High vibrancy (any impact)

## UI: Status Bar

Update the status bar tooltip to include: "2 high-priority replacements
(low health, high impact)"

## Changes

### Modified: `src/services/import-scanner.ts`

- Extend return type from `Set<string>` to a richer structure:
  ```typescript
  interface ImportDetails {
    readonly fileCount: number;
    readonly importCount: number;
    readonly layers: readonly string[];
  }
  ```
- Return `Map<string, ImportDetails>` instead of `Set<string>`
- The existing `detectUnused()` call adapts by checking for keys with
  fileCount === 0

### New File: `src/scoring/impact-calculator.ts`

- `calcImpactScore(details: ImportDetails): number` — returns 1–5
- `impactLabel(score: number): string` — "Trivial" through "Entrenched"
- `calcPriority(vibrancyScore, impactScore): 'high' | 'medium' | 'low'`
- Pure functions, no I/O

### New Types in `src/types.ts`

```typescript
interface ImpactInfo {
  readonly fileCount: number;
  readonly importCount: number;
  readonly layers: readonly string[];
  readonly impactScore: number;
  readonly priority: 'high' | 'medium' | 'low';
}
```

- Add `readonly impact: ImpactInfo | null` to `VibrancyResult`

### Modified: `src/extension-activation.ts`

- Pass enriched import data to result builder
- Compute impact scores after import scan

### Modified: `src/providers/tree-items.ts`

- Add `buildImpactGroup()` function

### Modified: `src/providers/hover-provider.ts`

- Add impact row to hover

### Modified: `src/views/report-html.ts`

- Add "Impact" and "Priority" columns

### Modified: `src/scoring/unused-detector.ts`

- Adapt to new `Map<string, ImportDetails>` return type from import scanner

### Tests

- `src/test/scoring/impact-calculator.test.ts` — score boundaries: 1 file,
  5 files, 15 files, 31 files; layer combinations; priority combos
- Update `src/test/services/import-scanner.test.ts` — verify enriched return
  type

## Out of Scope

- Analyzing which specific APIs/classes from a package are used
- Estimating hours-of-effort for migration
- Scanning generated code separately from handwritten code
