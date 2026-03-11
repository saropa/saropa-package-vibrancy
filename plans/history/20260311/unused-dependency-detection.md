# Plan: Unused Dependency Detection

## Goal

Flag packages declared in `pubspec.yaml` but never imported in any Dart source
file. Surfaces dead-weight dependencies the developer can safely remove.

## How It Works

1. **Collect declared dependencies** from `pubspec.yaml` (direct only, skip
   `flutter`, `flutter_test`, and SDK entries).
2. **Scan Dart source files** in `lib/`, `bin/`, and `test/` for `import`
   statements matching `package:<name>/`.
3. **Cross-reference**: any declared dependency with zero matching imports is
   flagged as unused.

### Edge Cases

- **Re-exported packages**: A dependency may be imported only via another
  package's barrel file. Accept `package:<name>/` appearing anywhere in `lib/`
  as "used" — don't try to resolve transitive re-exports.
- **Generated code**: Include `*.g.dart`, `*.freezed.dart`, and
  `*.gen.dart` files in the scan so build_runner outputs count.
- **Platform plugins**: Packages like `url_launcher_android` are often
  declared but never directly imported (they're endorsed plugins). Maintain a
  short allowlist of known platform interface packages to skip.
- **Dev dependencies**: Only flag unused `dev_dependencies` if
  `includeDevDependencies` setting is enabled. `test/` imports count for dev
  deps; `lib/` and `bin/` imports count for regular deps.
- **Asset-only packages**: Some packages provide only assets (fonts, icons)
  with no Dart imports. Allow suppression via the existing
  `suppressedPackages` setting.

## Changes

### New File: `src/services/import-scanner.ts`

- `scanDartImports(workspaceRoot: string): Promise<Set<string>>`
  - Glob `lib/**/*.dart`, `bin/**/*.dart`, `test/**/*.dart`
  - Regex each file for `import 'package:(\w+)/` and collect unique names
  - Return the set of imported package names

### New File: `src/scoring/unused-detector.ts`

- `detectUnused(declared: PackageDependency[], imported: Set<string>): string[]`
  - Pure function, no I/O
  - Filters out SDK entries, platform plugin allowlist
  - Returns names of declared-but-not-imported packages

### Modified: `src/types.ts`

- Add `readonly isUnused: boolean` to `VibrancyResult`

### Modified: `src/scan-orchestrator.ts`

- After existing scan completes, run import scan once
- Set `isUnused` flag on each result

### Modified: `src/providers/diagnostics.ts`

- New diagnostic for unused packages: **Hint** severity
- Message: `"Unused dependency — no imports found for {name} in lib/, bin/,
  or test/"`

### Modified: `src/providers/tree-items.ts`

- Add `⚠️ Unused` detail item in the Alerts group when `isUnused` is true

### Modified: `src/providers/hover-provider.ts`

- Append "**Unused** — no imports detected" row to hover tooltip

### Modified: `src/views/report-html.ts`

- Add "Unused" badge column to the report table

### Tests

- `src/test/services/import-scanner.test.ts` — fixture Dart files with
  various import styles (relative, package, show/hide, multiline)
- `src/test/scoring/unused-detector.test.ts` — pure logic: empty project,
  all used, some unused, platform plugin skip, SDK skip

## Out of Scope

- Detecting unused transitive dependencies (only direct)
- Analyzing which specific exports from a package are used
- Auto-removing unused deps from `pubspec.yaml` (too destructive for v1)
