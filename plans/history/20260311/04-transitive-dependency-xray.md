# Plan: Transitive Dependency X-Ray

## Problem

A direct dependency may look healthy, but it silently pulls in 15+ transitive
dependencies — some abandoned, some duplicated, some bloating the app. Developers
have zero visibility into this hidden layer. When a transitive dep causes a
conflict, they don't even know it exists until `pub get` fails.

## Goal

Parse the full dependency tree from `pubspec.lock`, count and display transitive
dependencies per direct package, and flag hidden risks — all in the sidebar,
hover, and report.

## How It Works

### Step 1: Build the Dependency Graph

`pubspec.lock` contains every resolved package but not parent-child
relationships. To get the actual tree:

- Run `dart pub deps --json` which outputs the full dependency graph as JSON:
  ```json
  {
    "packages": [
      {
        "name": "http",
        "version": "1.2.0",
        "dependencies": ["http_parser", "async", "meta"]
      }
    ]
  }
  ```
- Parse into an adjacency map: `Map<string, string[]>` (package → its
  direct deps)

### Step 2: Compute Per-Package Transitive Counts

For each direct dependency in `pubspec.yaml`:
- Walk the graph recursively (with cycle detection) to collect all transitive
  deps reachable from that package
- Count: "http pulls in 7 transitive dependencies"
- Identify **shared transitives**: packages depended on by 2+ direct deps
  (single points of failure)

### Step 3: Flag Risks

Cross-reference transitive packages with vibrancy scan data (if available) or
at minimum with `known_issues.json`:
- Transitive dep is discontinued or end-of-life
- Transitive dep has known vulnerabilities (if vuln radar is implemented)
- A single transitive is shared by 5+ direct deps (high blast radius)

### Step 4: Detect `dependency_overrides`

Parse `pubspec.yaml` for the `dependency_overrides:` section. Each override
is technical debt — show a warning with the specific risk: "Override on
`intl` bypasses version constraints. If the overridden version is
incompatible, runtime errors may occur."

## UI: Tree View

Add a `📊 Dependencies` count to each package's detail groups:

```
📦 http
  📊 Dependencies
    ├─ Transitive: 7 packages
    ├─ Shared: async (used by 4 direct deps)
    └─ ⚠️ http_parser — Legacy-Locked (22/100)
```

Add a top-level summary node when no package is expanded:

```
📊 Dependency Graph
  ├─ Direct: 12 packages
  ├─ Transitive: 87 packages
  ├─ Total unique: 99 packages
  └─ ⚠️ 3 overrides in pubspec.yaml
```

## UI: Hover

Add a "Dependencies" row to the hover tooltip:
```
| Transitive Deps | 7 (2 flagged) |
```

## UI: Report

Add "Transitives" column to the report table showing the count, with flagged
transitives highlighted in the detail view.

## Changes

### New File: `src/services/dep-graph.ts`

- `buildDepGraph(cwd: string): Promise<DepGraph>`
- Runs `dart pub deps --json` and parses output
- Returns adjacency map + metadata

### New File: `src/scoring/transitive-analyzer.ts`

- `countTransitives(graph, directDeps): TransitiveInfo[]` — pure function
- `findSharedDeps(graph, directDeps): SharedDep[]` — pure function
- `flagRiskyTransitives(transitives, knownIssues): FlaggedTransitive[]`

### New Types in `src/types.ts`

```typescript
interface TransitiveInfo {
  readonly directDep: string;
  readonly transitiveCount: number;
  readonly flaggedCount: number;
  readonly sharedDeps: readonly string[];
}

interface DepGraphSummary {
  readonly directCount: number;
  readonly transitiveCount: number;
  readonly totalUnique: number;
  readonly overrideCount: number;
  readonly sharedDeps: readonly { name: string; usedBy: number }[];
}
```

- Add `readonly transitiveInfo: TransitiveInfo | null` to `VibrancyResult`

### Modified: `src/extension-activation.ts`

- Run `buildDepGraph()` during scan, attach transitive info to results

### Modified: `src/providers/tree-items.ts`

- Add `buildDependencyGroup()` function
- Show transitive count, shared deps, flagged transitives

### Modified: `src/providers/tree-data-provider.ts`

- Add optional `DepGraphSummaryItem` at top of tree

### Modified: `src/providers/hover-provider.ts`

- Add transitive dep count row

### Modified: `src/views/report-html.ts`

- Add "Transitives" column

### Modified: `src/services/pubspec-parser.ts`

- Add `parseDependencyOverrides(content: string): string[]` to detect
  override entries

### Tests

- `src/test/services/dep-graph.test.ts` — parse `dart pub deps --json`
  fixture output
- `src/test/scoring/transitive-analyzer.test.ts` — count logic, shared dep
  detection, cycle handling, flagging

## Out of Scope

- Running vibrancy scans on every transitive dependency (too many API calls)
- Visualizing the graph as an interactive diagram (separate feature)
- Resolving transitive conflicts automatically
