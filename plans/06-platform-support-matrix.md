# Plan: Platform Support Matrix

## Problem

Developers discover at build time that a package doesn't support web, macOS,
or Windows. By then they've already written code depending on it. The Flutter
Dependency Platform Checker extension exists but has no integration with health
scoring and provides no persistent inline feedback.

## Goal

Show which platforms each dependency supports as a color-coded grid in the
tree view and report. Flag gaps proactively: "3 of your dependencies don't
support Web" — before you hit build errors.

## Data Source

The pub.dev API returns platform data in two places:

1. **Package endpoint** (`/api/packages/{name}`): The pubspec may contain
   `platforms:` field listing supported platforms
2. **Score endpoint** (`/api/packages/{name}/score`): Returns `tags` array
   including platform tags:
   ```json
   {
     "tags": [
       "platform:android",
       "platform:ios",
       "platform:web",
       "platform:windows",
       "platform:macos",
       "platform:linux"
     ]
   }
   ```

The score endpoint is the authoritative source — it reflects pana's static
analysis of actual platform compatibility, not just what the pubspec claims.

## How It Works

1. **During scan**, fetch platform tags from the score endpoint (already
   calling `fetchPackageScore()` — extend to also extract tags)
2. **Parse tags**: Extract `platform:*` entries into a set per package
3. **Detect project target platforms**: Read `pubspec.yaml` for
   `flutter.platforms` or infer from existing platform directories
   (`android/`, `ios/`, `web/`, `macos/`, `windows/`, `linux/`)
4. **Flag gaps**: If the project targets Web but a dependency doesn't
   support Web, that's a gap

## Platform Icons

```
Android: 🤖    iOS: 🍎    Web: 🌐
macOS: 💻      Windows: 🪟   Linux: 🐧
```

Supported = green/shown, Unsupported = dimmed/hidden, Gap = red/warning

## UI: Tree View

Add a `🎯 Platforms` group to each package's detail:

```
🎯 Platforms
  ├─ 🤖 Android  🍎 iOS  🌐 Web
  └─ ⚠️ Missing: macOS, Windows, Linux
```

Only show the "Missing" line when the project targets those platforms.

## UI: Hover

Add platforms row to hover:
```
| Platforms | Android, iOS, Web |
| ⚠️ Gap | No macOS support (your project targets macOS) |
```

## UI: Report

Add "Platforms" column to the report table showing supported platform icons.
Add a summary card: "Platform gaps: 3 packages lack Web support."

## UI: Diagnostics

When a dependency doesn't support a platform the project targets, add an
**Information** diagnostic:
```
platform_gap: {name} does not support Web (your project targets Web)
```

## Changes

### Modified: `src/services/pub-dev-api.ts`

- Extend `fetchPackageScore()` to also return platform tags from the
  `tags` array in the response
- Return type becomes `{ points: number; platforms: string[] }`

### New File: `src/services/platform-detector.ts`

- `detectProjectPlatforms(workspaceRoot: Uri): Promise<Set<string>>`
- Checks for platform directories (`android/`, `ios/`, `web/`, etc.)
- Also reads `pubspec.yaml` `flutter.platforms` if present

### New File: `src/scoring/platform-analyzer.ts`

- `findPlatformGaps(packagePlatforms, projectPlatforms): PlatformGap[]`
  — pure function
- `formatPlatformList(platforms: string[]): string` — "Android, iOS, Web"

### New Types in `src/types.ts`

```typescript
interface PlatformInfo {
  readonly supported: readonly string[];
  readonly gaps: readonly string[];
}
```

- Add `readonly platforms: PlatformInfo | null` to `VibrancyResult`

### Modified: `src/scan-orchestrator.ts`

- Pass platform tags through to `VibrancyResult`

### Modified: `src/extension-activation.ts`

- Detect project platforms once at scan start
- Compute gaps per package

### Modified: `src/providers/tree-items.ts`

- Add `buildPlatformGroup()` function

### Modified: `src/providers/hover-provider.ts`

- Add platforms row and gap warning

### Modified: `src/providers/diagnostics.ts`

- Add platform gap diagnostic (Information severity)

### Modified: `src/views/report-html.ts`

- Add "Platforms" column with icons

### Tests

- `src/test/services/platform-detector.test.ts` — detect from directories,
  from pubspec, empty project
- `src/test/scoring/platform-analyzer.test.ts` — gap detection: no gaps,
  single gap, all platforms missing, package with no platform data

## Out of Scope

- Plugin platform implementation checks (endorsed vs direct)
- Conditional import analysis
- Platform-specific dependency resolution
