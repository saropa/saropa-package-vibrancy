# Plan: Smart `dependency_overrides` Tracker

**Status: IMPLEMENTED** (2026-03-11)

## Problem

`dependency_overrides` in `pubspec.yaml` is the duct tape of Flutter
dependency management. Developers add overrides to unblock themselves, then
forget about them. DCM's lint rules flag overrides as code smells, but nobody
tells you *when an override is no longer needed* because the upstream
constraint was relaxed.

## Goal

Parse the `dependency_overrides:` section, explain each override, track its
age, and — critically — detect when an override can be safely removed because
the conflict it worked around no longer exists.

## How It Works

### Step 1: Parse Overrides

Read `pubspec.yaml` and extract the `dependency_overrides:` section. For each
override, record:

- Package name
- Overridden version/constraint
- Line number in pubspec.yaml

### Step 2: Determine Why Each Override Exists

For each overridden package, check if a version conflict would exist without
the override:

1. Get the package's version from `pubspec.lock` (the resolved version)
2. Check if any direct dependency constrains this package to a range that
   excludes the overridden version
3. If yes, the override is **active** — it's resolving a real conflict
4. If no, the override is **stale** — the conflict no longer exists and it
   can be removed

### Step 3: Track Age

Use `git log` to find when each override line was added:

```
git log -1 --format="%ai" -S "dependency_overrides" -- pubspec.yaml
```

Or more precisely, search for the specific package name in the overrides
section. This gives the date the override was introduced.

### Step 4: Surface in UI

Show overrides as a dedicated group in the tree view and as diagnostics.

## UI: Tree View

Add a top-level group when overrides exist:

```
🔧 Overrides (3)
  ├─ intl: 0.19.0
  │  ├─ Status: Active — resolves conflict with date_picker_timeline
  │  ├─ Age: 4 months (since 2025-11-10)
  │  └─ ⚠️ Risk: Bypasses version constraints
  ├─ meta: 1.12.0
  │  ├─ Status: ⚠️ Stale — no conflict detected, safe to remove
  │  └─ Age: 7 months
  └─ path: 1.9.0
     ├─ Status: Active — SDK constraint conflict
     └─ Age: 2 weeks
```

## UI: Diagnostics

For each override in `pubspec.yaml`:

- **Stale override** → Warning:
  `"Stale override: no conflict detected for {name}. Safe to remove."`
- **Active override** → Information:
  `"Active override on {name} — bypasses constraint from {blocker}.
  Added {N} months ago."`
- **Old override** (>6 months) → Hint:
  `"Override on {name} is {N} months old. Review whether it's still
  needed."`

## UI: Code Actions

- **"Remove stale override"** — deletes the override entry from
  `dependency_overrides:` section
- **"Show conflict details"** — jumps to the constraining package

## Changes

### New File: `src/services/override-parser.ts`

- `parseOverrides(yamlContent: string): OverrideEntry[]`
- Extracts package names, versions, and line ranges from the
  `dependency_overrides:` section
- Pure string parsing

### New File: `src/scoring/override-analyzer.ts`

- `analyzeOverrides(overrides, depGraph, results): OverrideAnalysis[]`
  — pure function
- Determines active vs stale status for each override
- Identifies the blocker package for active overrides

### New File: `src/services/override-age.ts`

- `getOverrideAge(packageName, cwd): Promise<Date | null>`
- Runs `git log` to find when the override was introduced
- Returns null if not in a git repo or can't determine

### New Types in `src/types.ts`

```typescript
interface OverrideEntry {
  readonly name: string;
  readonly version: string;
  readonly line: number;
}

interface OverrideAnalysis {
  readonly entry: OverrideEntry;
  readonly status: 'active' | 'stale';
  readonly blocker: string | null;
  readonly addedDate: Date | null;
  readonly ageDays: number | null;
}
```

### Modified: `src/extension-activation.ts`

- Run override analysis after scan completes
- Pass results to tree provider and diagnostics

### Modified: `src/providers/tree-data-provider.ts`

- Add `OverridesGroupItem` at top of tree when overrides exist

### Modified: `src/providers/tree-items.ts`

- New `OverrideItem` and detail items for status, age, risk

### Modified: `src/providers/diagnostics.ts`

- Add override diagnostics at the override line positions

### Modified: `src/providers/code-action-provider.ts`

- Add "Remove stale override" quick-fix for stale overrides

### Tests

- `src/test/services/override-parser.test.ts` — parse overrides: version
  string, path dep, git dep, empty section, no section
- `src/test/scoring/override-analyzer.test.ts` — active vs stale: real
  conflict, no conflict, SDK constraint, no dep graph available
- Fixture: pubspec.yaml with various override styles

## Out of Scope

- Automatically removing overrides (code action is manual)
- Suggesting the "correct" version to pin instead
- Tracking override history across multiple scans
