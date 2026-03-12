# Plan: Unified Problem Model

**Status: PLANNED**

## Problem

The extension has grown organically with each feature adding its own:

- Data types (`TransitiveInfo`, `OverrideAnalysis`, `FamilySplit`, etc.)
- UI sections (tree groups, hover sections, diagnostic types)
- Display logic (formatters, tree items, tooltips)

This creates a fragmented user experience. A single package might show:

- Vibrancy warning in Problems panel
- Override info in tree view
- Transitive count in hover
- Family conflict in separate tree group

The user must mentally combine these signals. There's no unified "here are all
the problems with this package" view.

## Goal

Replace the per-feature display model with a first-class `Problem` abstraction:

1. **All features produce `Problem` objects** — Not their own custom types
2. **One Problem Registry** — Stores, deduplicates, and links problems
3. **Unified rendering** — Single tree view, hover format, diagnostics approach

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Problem Types                              │
│  ─────────────────────────────────────────────────────────   │
│  • UnhealthyPackage       • RiskyTransitive                  │
│  • StaleOverride          • BlockedUpgrade                   │
│  • ActiveOverride         • UnusedDependency                 │
│  • FamilyConflict         • LicenseRisk                      │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Problem Registry                          │
│  ─────────────────────────────────────────────────────────   │
│  • Stores all problems keyed by (package, type)              │
│  • Links related problems (A causes B)                       │
│  • Computes priority score per package                       │
│  • Tracks resolution chains                                  │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                   Unified Renderers                          │
│  ─────────────────────────────────────────────────────────   │
│  • ProblemTreeProvider — replaces multiple tree groups       │
│  • ProblemHoverProvider — unified hover format               │
│  • ProblemDiagnostics — consistent diagnostic messages       │
└─────────────────────────────────────────────────────────────┘
```

## Problem Type Definitions

```typescript
type Problem =
  | UnhealthyPackageProblem
  | StaleOverrideProblem
  | ActiveOverrideProblem
  | FamilyConflictProblem
  | RiskyTransitiveProblem
  | BlockedUpgradeProblem
  | UnusedDependencyProblem
  | LicenseRiskProblem;

interface UnhealthyPackageProblem {
  type: 'unhealthy';
  package: string;
  score: number;
  category: VibrancyCategory;
  line: number;
}

interface StaleOverrideProblem {
  type: 'stale-override';
  package: string;
  overrideName: string;
  ageDays: number | null;
  line: number;
}

interface FamilyConflictProblem {
  type: 'family-conflict';
  package: string;
  familyId: string;
  familyLabel: string;
  currentMajor: number;
  conflictingPackages: readonly string[];
  line: number;
}

interface RiskyTransitiveProblem {
  type: 'risky-transitive';
  package: string;
  transitiveName: string;
  transitiveStatus: string;
  line: number;
}

// ... similar for other types
```

## Problem Registry

```typescript
class ProblemRegistry {
  private problems = new Map<string, Problem[]>();
  private links = new Map<string, ProblemLink[]>();

  add(problem: Problem): void {
    const key = problem.package;
    const existing = this.problems.get(key) ?? [];
    // Deduplicate by type
    if (!existing.some(p => this.isSameProblem(p, problem))) {
      existing.push(problem);
      this.problems.set(key, existing);
    }
  }

  link(cause: Problem, effect: Problem): void {
    // "Fixing cause resolves effect"
  }

  getForPackage(name: string): readonly Problem[] {
    return this.problems.get(name) ?? [];
  }

  getAllSortedByPriority(): PackageProblems[] {
    // Return packages sorted by combined problem severity
  }

  getResolutionChain(problem: Problem): Problem[] {
    // What other problems get resolved if this one is fixed?
  }
}

interface PackageProblems {
  package: string;
  problems: readonly Problem[];
  priorityScore: number;
  suggestedAction: SuggestedAction;
}
```

## How Features Change

### Before (Current)

Each feature returns its own type:

```typescript
// transitive-analyzer.ts
function enrichTransitiveInfo(...): TransitiveInfo[] { ... }

// override-analyzer.ts
function analyzeOverrides(...): OverrideAnalysis[] { ... }

// family-conflict-detector.ts
function detectFamilySplits(...): FamilySplit[] { ... }
```

### After (Unified)

Each feature produces `Problem` objects:

```typescript
// transitive-analyzer.ts
function analyzeTransitives(..., registry: ProblemRegistry): void {
  for (const flagged of flaggedTransitives) {
    registry.add({
      type: 'risky-transitive',
      package: flagged.directDep,
      transitiveName: flagged.name,
      transitiveStatus: flagged.reason,
      line: getPackageLine(flagged.directDep),
    });
  }
}

// override-analyzer.ts
function analyzeOverrides(..., registry: ProblemRegistry): void {
  for (const analysis of analyses) {
    if (analysis.status === 'stale') {
      registry.add({
        type: 'stale-override',
        package: analysis.entry.name,
        overrideName: analysis.entry.name,
        ageDays: analysis.ageDays,
        line: analysis.entry.line,
      });
    }
  }
}
```

## Unified Tree View

Replace multiple tree groups with a single problem-centric view:

```
📦 Dependencies
├─ 🔴 firebase_core (3 problems)
│  ├─ Family conflict: v2 vs v3 split
│  ├─ Override active: blocks intl
│  ├─ Update blocked by cloud_firestore
│  └─ 💡 Upgrade all Firebase packages together
├─ 🟡 http (2 problems)
│  ├─ Risky transitive: http_parser (EOL)
│  ├─ Score: 45 (Legacy-Locked)
│  └─ 💡 Upgrade http for safer transitives
├─ 🟢 path (0 problems)
│  └─ Score: 85 (Vibrant)
└─ ⚪ old_package (1 problem)
   ├─ Unused — no imports found
   └─ 💡 Remove this package
```

## Unified Hover Format

```markdown
## 📦 firebase_core

| Metric | Value |
|--------|-------|
| Score | 72 (Quiet) |
| Version | 2.31.0 → 3.0.0 available |
| License | BSD-3-Clause |

### ⚠️ Problems (3)

1. **Family conflict** — Firebase packages split between v2 and v3
2. **Override active** — Blocking intl upgrade
3. **Update blocked** — cloud_firestore constrains to ^2.0.0

### 💡 Suggested Action

Upgrade all Firebase packages together (firebase_core, firebase_auth,
cloud_firestore) to resolve the version split.

*Resolves 2 additional problems: intl override, cloud_firestore update*
```

## Unified Diagnostics

All problems use a consistent diagnostic format:

```
[Saropa] {ProblemType}: {message} ({package})
```

Examples:
- `[Saropa] Family conflict: Firebase packages on incompatible versions (firebase_core)`
- `[Saropa] Risky transitive: http_parser is end-of-life (http)`
- `[Saropa] Unused: No imports found in lib/, bin/, test/ (old_package)`

## Changes

### New File: `src/problems/problem-types.ts`

- `Problem` union type
- All specific problem interfaces
- `ProblemSeverity` type

### New File: `src/problems/problem-registry.ts`

- `ProblemRegistry` class
- Problem deduplication
- Linking logic
- Priority calculation

### New File: `src/problems/problem-actions.ts`

- `SuggestedAction` interface
- Action determination logic
- Resolution chain calculation

### New File: `src/providers/problem-tree-provider.ts`

- Replaces or extends `VibrancyTreeProvider`
- Problem-centric tree structure

### New File: `src/providers/problem-tree-items.ts`

- `PackageWithProblemsItem`
- `ProblemItem`
- `SuggestionItem`

### New File: `src/providers/problem-hover-provider.ts`

- Unified hover format
- Problem list rendering

### Modified: `src/scoring/transitive-analyzer.ts`

- Accept `ProblemRegistry` parameter
- Add problems directly to registry

### Modified: `src/scoring/override-analyzer.ts`

- Accept `ProblemRegistry` parameter
- Add problems directly to registry

### Modified: `src/scoring/family-conflict-detector.ts`

- Accept `ProblemRegistry` parameter
- Add problems directly to registry

### Modified: `src/scoring/unused-detector.ts`

- Accept `ProblemRegistry` parameter
- Add problems directly to registry

### Modified: `src/extension-activation.ts`

- Create `ProblemRegistry` on scan start
- Pass to all analyzers
- Use registry for UI updates

### Migration Path

1. Implement `ProblemRegistry` and types
2. Add problem production to existing features (alongside current output)
3. Create new unified providers
4. Gradually migrate UI to use new providers
5. Remove legacy per-feature UI components

### Tests

- `src/test/problems/problem-registry.test.ts`
  - Add/get/deduplicate
  - Linking
  - Priority sorting
- `src/test/problems/problem-actions.test.ts`
  - Action determination
  - Resolution chains
- `src/test/providers/problem-tree-provider.test.ts`
  - Tree structure
  - Problem grouping

## Pros

- True unification — one mental model for all issues
- Natural deduplication
- Problems relate to each other natively
- Cleaner UX ("3 problems" vs scattered warnings)
- Extensible — new problem types fit naturally

## Cons

- Largest refactor of the three options
- Existing feature-specific views need migration
- Requires updating diagnostics, hover, tree view, report
- Higher implementation effort (~8-12 hours)
- Risk of breaking existing functionality during migration

## Out of Scope

- Auto-fix functionality (problems are informational)
- Problem history/tracking across scans
- User-defined problem severity overrides
