# Plan: Conflict Forensics

## Problem

`flutter pub get` fails with "version solving failed" and dumps a wall of
cryptic text. Developers spend hours on Reddit/StackOverflow decoding which
package is the actual bottleneck. This is the #1 Flutter dependency pain point.

## Goal

When `pub get` fails, parse the error output, identify the conflicting
constraint chains, and surface them as a readable diagnostic in the editor with
actionable quick-fix suggestions.

## How It Works

1. **Detect failure**: After a `flutter pub get` fails (either from the
   Upgrade & Test command or from the file watcher detecting a broken
   `pubspec.lock`), capture stderr.
2. **Parse error**: Extract constraint conflict pairs from the pub solver
   error output. The format is predictable:
   ```
   Because package_a >=2.0.0 depends on intl ^0.19.0 and package_b >=1.0.0
   depends on intl ^0.17.0, package_a >=2.0.0 is incompatible with package_b.
   ```
3. **Build conflict graph**: For each conflict, record:
   - The two (or more) packages with incompatible constraints
   - The shared transitive dependency they disagree on
   - The version ranges each demands
4. **Enrich with vibrancy data**: Cross-reference conflicting packages with
   existing scan results to show which one is the weaker link (lower vibrancy
   score = more likely candidate for replacement).
5. **Surface in UI**: Show a diagnostic on the conflicting package lines in
   `pubspec.yaml` with a plain-English explanation and suggested action.

## Error Parsing

The pub solver output follows a structured "Because X depends on Y" pattern.
Parse with regex:

```
/Because (.+?) depends on (.+?) (.+?) and (.+?) depends on (.+?) (.+?),/
```

Also detect:
- `version solving failed` as the trigger line
- `So, because <root> depends on both X and Y` as the summary
- SDK constraint conflicts: `requires SDK version >=X.Y.Z`

## UI: Conflict Diagnostic

When a conflict is detected, add a **Warning** diagnostic on each involved
package line in `pubspec.yaml`:

```
Conflict: package_a requires intl ^0.17.0, but flutter_localizations
requires intl 0.19.0. package_a (vibrancy 12/100) is the likely bottleneck.
```

## UI: Conflict Tree View

Add a new top-level group in the sidebar when conflicts exist:

```
⚡ Conflicts (2)
  └─ intl version mismatch
     ├─ package_a requires ^0.17.0 (vibrancy 12/100)
     └─ flutter_localizations requires 0.19.0 (vibrancy 95/100)
```

## UI: Quick-Fix Code Actions

- **"Replace {weakest_package}"** — if a curated or discovery alternative
  exists
- **"Pin dependency_overrides for {shared_dep}"** — adds an override to
  pubspec.yaml (with a warning comment that this is temporary)
- **"Open {package} on pub.dev"** — for manual investigation

## Changes

### New File: `src/services/conflict-parser.ts`

- `parseConflictOutput(stderr: string): ConflictInfo[]`
- Pure string parsing, no I/O
- Returns structured conflict descriptions

### New Type in `src/types.ts`

```typescript
interface ConflictInfo {
  readonly sharedDependency: string;
  readonly demanders: readonly {
    readonly packageName: string;
    readonly requiredRange: string;
    readonly vibrancyScore: number | null;
  }[];
  readonly summary: string;
}
```

### Modified: `src/services/flutter-cli.ts`

- `runPubGet()` already returns `CommandResult` with `output` — ensure stderr
  is captured separately or parsed from combined output

### New File: `src/providers/conflict-diagnostics.ts`

- Watches for `pub get` failures
- Calls `parseConflictOutput()` and enriches with scan data
- Publishes diagnostics to `pubspec.yaml`

### Modified: `src/providers/tree-data-provider.ts`

- Add optional `ConflictGroupItem` at the top of the tree when conflicts exist

### Modified: `src/providers/code-action-provider.ts`

- Add conflict-specific quick-fix actions

### Modified: `src/extension-activation.ts`

- Wire up the conflict parser to fire after failed `pub get` calls

### Tests

- `src/test/services/conflict-parser.test.ts` — parse real pub solver error
  outputs (fixture files with known conflict patterns)
- `src/test/providers/conflict-diagnostics.test.ts` — diagnostic generation
  from parsed conflicts

## Out of Scope

- Automatically resolving conflicts (too risky)
- Parsing non-pub solver errors (Gradle, CocoaPods)
- Conflict detection without a `pub get` failure (proactive constraint
  analysis is a separate feature)
