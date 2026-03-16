# Plan: Package Family Conflict Detector

**Update (2025-03-14):** The "Google" family was removed from the implementation. The `google_` prefix groups unrelated products (e.g. google_fonts, google_sign_in, google_maps_flutter) with independent version lifecycles. See `bugs/history/20250314/family-conflict-google-family-removed.md`.

**Update (2026-03-15):** The "Firebase" family was also removed. Firebase packages (`firebase_core` v4, `firebase_messaging` v16, etc.) use independent version tracks, not a shared major version scheme — same issue as Google. Only truly version-coupled families remain: Riverpod, Bloc, Freezed, Drift.

## Problem

Google's own packages frequently conflict with each other. A project might
have `firebase_core ^2.x` alongside `cloud_firestore ^4.x` which expects
`firebase_core ^3.x`. Developers discover these incompatibilities only when
`pub get` fails, with no explanation of which family is split. This is a
top-5 Flutter pain point (Flutter issue #77681).

## Goal

Detect when packages from the same ecosystem/family are on incompatible
version tracks and warn proactively — before `pub get` fails.

## Package Families

Define known package families where version alignment matters:

### Bundled Family Definitions

```typescript
const FAMILIES: Record<string, FamilyDef> = {
  firebase: {
    label: 'Firebase',
    pattern: /^(firebase_|cloud_|flutterfire)/,
    versionGroupField: 'major',
  },
  google: {
    label: 'Google',
    pattern: /^google_/,
    versionGroupField: 'major',
  },
  riverpod: {
    label: 'Riverpod',
    pattern: /^(riverpod|flutter_riverpod|hooks_riverpod)/,
    versionGroupField: 'major',
  },
  bloc: {
    label: 'Bloc',
    pattern: /^(bloc|flutter_bloc|hydrated_bloc|replay_bloc)/,
    versionGroupField: 'major',
  },
  freezed: {
    label: 'Freezed',
    pattern: /^(freezed|freezed_annotation|json_serializable)/,
    versionGroupField: 'major',
  },
  drift: {
    label: 'Drift',
    pattern: /^(drift|drift_dev|drift_postgres)/,
    versionGroupField: 'major',
  },
};
```

This is bundled data (like `known_issues.json`), stored as a TypeScript
constant — not a JSON file.

## How It Works

### Step 1: Group Packages by Family

For each dependency in the scan results, match against family patterns.
A package may belong to at most one family.

### Step 2: Detect Version Splits

Within each family, group packages by their major version. If packages in
the same family span 2+ major versions, that's a **split**.

Example:
```
Firebase family:
  Major v2: firebase_core ^2.31.0, firebase_auth ^4.20.0
  Major v3: cloud_firestore ^5.0.0 (expects firebase_core ^3.0.0)
→ Split detected: firebase_core is on major v2 but cloud_firestore
  expects major v3
```

### Step 3: Check Publisher Consistency

For families without a clear version alignment rule, fall back to checking
if packages from the same publisher are on divergent update schedules
(one updated recently, another not updated in 6+ months).

## UI: Tree View

Add a top-level group when splits are detected:

```
👨‍👩‍👧‍👦 Family Conflicts (1)
  └─ Firebase — version split
     ├─ Major v2: firebase_core, firebase_auth
     ├─ Major v3: cloud_firestore
     └─ 💡 Upgrade firebase_core and firebase_auth to align
```

## UI: Diagnostics

Add a **Warning** diagnostic on each package involved in a split:

```
Family conflict: firebase_core is on major v2, but cloud_firestore
expects major v3. Upgrade firebase_core to align the Firebase family.
```

## UI: Hover

Add a "Family" row when the package belongs to a known family:
```
| Family | Firebase (v2 — split detected) |
```

## Changes

### New File: `src/data/package-families.ts`

- Exported `FAMILIES` constant with family definitions
- `matchFamily(name: string): string | null` — returns family ID or null
- Pure data + lookup, no I/O

### New File: `src/scoring/family-conflict-detector.ts`

- `detectFamilySplits(results: VibrancyResult[]): FamilySplit[]`
  — pure function
- Groups packages by family, checks major version alignment
- Returns split descriptions

### New Types in `src/types.ts`

```typescript
interface FamilySplit {
  readonly familyId: string;
  readonly familyLabel: string;
  readonly versionGroups: readonly {
    readonly majorVersion: number;
    readonly packages: readonly string[];
  }[];
  readonly suggestion: string;
}
```

### Modified: `src/extension-activation.ts`

- Run family conflict detection after scan completes
- Pass splits to tree provider

### Modified: `src/providers/tree-data-provider.ts`

- Add `FamilyConflictGroupItem` at top of tree when splits exist

### Modified: `src/providers/tree-items.ts`

- New `FamilySplitItem` and detail items

### Modified: `src/providers/diagnostics.ts`

- Add family split diagnostics per affected package

### Modified: `src/providers/hover-provider.ts`

- Add family row to hover

### Tests

- `src/test/data/package-families.test.ts` — pattern matching: Firebase
  packages, non-family packages, edge cases
- `src/test/scoring/family-conflict-detector.test.ts` — split detection:
  no split, single split, multiple families split, single-package family
  (no split possible)

## Maintenance

Family definitions are low-maintenance — major ecosystems rarely change
their naming patterns. New families can be added by extending the constant.

## Out of Scope

- Detecting version conflicts within non-family packages
- Resolving splits automatically
- Supporting user-defined custom families (v1 uses bundled list only)
