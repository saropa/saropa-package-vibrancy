# Plan: Post-Processing Consolidator

**Status: IMPLEMENTED** (2026-03-12)

## Problem

Features in the extension operate independently. Each computes its own data and
surfaces results in its own UI slot (tree group, hover section, diagnostic).
The result is a fragmented view where users see:

- Vibrancy score warning
- Override tracker alert
- Transitive risk flag
- Family conflict notice
- Unused dependency hint

...all for the same package, without understanding how they relate or which to
fix first.

## Goal

Add a consolidation pass that runs after all features complete. This pass
cross-references results from every feature and produces:

1. **Unified problem list** — Deduplicated, ranked by combined severity
2. **Action suggestions** — "Fix A to resolve 3 issues"
3. **Dependency links** — "Fixing X will unblock Y and Z"

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                    Scan Phase                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │Vibrancy │ │Override │ │Transitive│ │ Family │      │
│  │ Score   │ │ Tracker │ │ X-Ray   │ │Conflict│      │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬───┘      │
└───────┼──────────┼──────────┼──────────┼─────────────┘
        └──────────┴──────────┴──────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │    Consolidator Pass         │
        │  ─────────────────────────   │
        │  • Deduplicate problems      │
        │  • Rank by combined risk     │
        │  • Link cause → effect       │
        │  • Generate action items     │
        └──────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │    PackageInsight[]          │
        └──────────────────────────────┘
```

## How It Works

### Step 1: Collect All Signals

After the scan completes, gather:

- `VibrancyResult[]` — scores, categories, blockers, transitives
- `OverrideAnalysis[]` — stale/active overrides
- `FamilySplit[]` — ecosystem version conflicts
- Unused package set
- Blocker relationships (reverse deps)

### Step 2: Build Per-Package Problem List

For each package, enumerate all problems:

```typescript
interface Problem {
  type: ProblemType;
  severity: 'high' | 'medium' | 'low';
  message: string;
  relatedPackage?: string;
}

type ProblemType =
  | 'unhealthy'
  | 'stale-override'
  | 'active-override'
  | 'family-conflict'
  | 'risky-transitive'
  | 'blocked-upgrade'
  | 'unused'
  | 'license-risk';
```

### Step 3: Compute Combined Risk Score

Each problem type has a base severity weight:

| Problem Type | Weight |
|--------------|--------|
| `unhealthy` (EOL) | 30 |
| `unhealthy` (legacy) | 20 |
| `family-conflict` | 25 |
| `risky-transitive` | 15 |
| `blocked-upgrade` | 10 |
| `stale-override` | 10 |
| `unused` | 5 |
| `active-override` | 5 |

Combined risk = sum of all problem weights for the package.

### Step 4: Determine Suggested Action

For each package, pick the single best action:

1. **Unused + unhealthy** → "Remove this package"
2. **Blocked upgrade** → "Upgrade {blocker} first"
3. **Family conflict** → "Upgrade all {family} packages together"
4. **Stale override** → "Remove override from pubspec.yaml"
5. **Unhealthy only** → "Consider replacing with {alternative}"
6. **Risky transitive** → "Upgrade {directDep} to get safer transitives"

### Step 5: Link "Unlocks If Fixed"

For each package, determine what gets unblocked if this package is fixed:

- If package X blocks Y's upgrade, fixing X unlocks Y
- If override on X is active due to Y, upgrading Y makes override stale
- If family conflict involves X, upgrading X may resolve conflict

## Output Type

```typescript
interface PackageInsight {
  readonly name: string;
  readonly combinedRiskScore: number;
  readonly problems: readonly Problem[];
  readonly suggestedAction: string | null;
  readonly actionType: ActionType;
  readonly unlocksIfFixed: readonly string[];
}

type ActionType =
  | 'remove'
  | 'upgrade-blocker'
  | 'upgrade-family'
  | 'remove-override'
  | 'replace'
  | 'upgrade'
  | 'none';
```

## UI Integration

### Tree View

Add a top-level "Action Items" group showing packages sorted by combined risk:

```
🎯 Action Items (5)
├─ firebase_core — 55 risk
│  ├─ Family conflict (v2 vs v3)
│  ├─ Override active (intl)
│  └─ 💡 Upgrade all Firebase packages together
├─ http — 35 risk
│  ├─ EOL transitive: http_parser
│  └─ 💡 Upgrade http to get safer transitives
└─ old_package — 30 risk
   ├─ Unused
   ├─ Legacy-Locked
   └─ 💡 Remove this package
```

### Hover Tooltip

Add "Action Items" section to hover:

```
📦 firebase_core
─────────────────
Score: 72 (Quiet)

⚠️ Action Items:
• Family conflict with cloud_firestore
• Override on intl still active

💡 Suggested: Upgrade all Firebase packages together
   Unlocks: intl override will become stale
```

### Status Bar

Update status bar to show action item count:

```
[📦 Vibrancy: 68] [🎯 5 actions]
```

## Changes

### New File: `src/scoring/consolidate-insights.ts`

- `consolidateInsights(...)` — main consolidation function
- `collectProblems(result, overrides, splits)` — per-package problem list
- `computeCombinedRisk(problems)` — sum of weights
- `determineSuggestedAction(problems, result)` — pick best action
- `findUnlockedPackages(packageName, results, overrides)` — dependency links

### New Types in `src/types.ts`

- `Problem` interface
- `ProblemType` union
- `PackageInsight` interface
- `ActionType` union

### Modified: `src/extension-activation.ts`

- Call `consolidateInsights()` after all feature passes
- Store `lastInsights` alongside `latestResults`
- Pass insights to tree provider

### Modified: `src/providers/tree-data-provider.ts`

- Add `updateInsights(insights: PackageInsight[])`
- Render "Action Items" group at top of tree

### Modified: `src/providers/tree-items.ts`

- New `ActionItemsGroupItem` class
- New `InsightItem` class for individual packages
- New `ProblemItem` class for problem details

### Modified: `src/providers/hover-provider.ts`

- Add "Action Items" section when insights exist for package

### Modified: `src/ui/status-bar.ts`

- Add action item count to status bar text

### Tests

- `src/test/scoring/consolidate-insights.test.ts`
  - Problem collection: all types detected
  - Risk calculation: weights applied correctly
  - Action selection: priority order respected
  - Unlock detection: blocker relationships found
  - Edge cases: no problems, all problems, duplicates

## Pros

- Minimal refactoring — features stay independent
- Single place for cross-cutting logic
- Easy to add new insight rules incrementally
- Quick to implement (~2-3 hours)

## Cons

- Consolidator can become a "god function" over time
- Features still don't influence each other's core logic
- Some redundant computation (features compute, consolidator re-analyzes)

## Out of Scope

- Changing how individual features compute their data
- Replacing existing per-feature UI (this adds a new view on top)
- Auto-fix functionality (insights are informational only)
