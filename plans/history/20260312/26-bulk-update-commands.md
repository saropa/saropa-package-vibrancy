# Plan: Bulk Update Commands

## Problem

Updating dependencies one-by-one is tedious when multiple packages need
attention. The current `planUpgrades` command provides intelligent sequencing
but requires stepping through each upgrade. Developers often want a quick
"update everything" option with control over version bump granularity.

Similar extensions provide bulk update commands: latest, major, minor, patch.
This gives developers control over risk level while still being fast.

## Goal

Add four bulk update commands that update all updatable dependencies in
`pubspec.yaml` with a single action:

1. **Update All (Latest)** — Update every package to its latest version
2. **Update All (Major)** — Only apply major version bumps
3. **Update All (Minor)** — Only apply minor version bumps
4. **Update All (Patch)** — Only apply patch version bumps

## How It Works

### Step 1: Identify Updatable Packages

From the current scan results, filter packages where:
- `latestVersion` exists and differs from `pinnedVersion`
- Package is not suppressed
- Package is not in allowlist

### Step 2: Classify Update Type

For each updatable package, determine the increment type:
- **Major**: Major version changed (1.x.x → 2.x.x)
- **Minor**: Minor version changed (1.1.x → 1.2.x)
- **Patch**: Patch version changed (1.1.1 → 1.1.2)
- **Prerelease**: Prerelease tag changed

Use `semver` library already in devDependencies.

### Step 3: Filter by Command

Based on the command invoked:
- **Latest**: Include all updatable packages
- **Major**: Include only packages with major increment available
- **Minor**: Include packages with minor or major increment
- **Patch**: Include only packages with patch increment

### Step 4: Apply Updates

For each filtered package:
1. Parse `pubspec.yaml`
2. Update version constraint to `^{latestVersion}`
3. Write back to file

Show progress notification during update.

### Step 5: Post-Update Actions

After all updates applied:
1. Show summary notification: "Updated 12 packages"
2. Optionally run `flutter pub get` (if save task enabled)
3. Trigger re-scan to refresh tree view

## UI: Commands

Add to Command Palette:

| Command | Title |
|---------|-------|
| `saropaPackageVibrancy.updateAllLatest` | Saropa: Update All Dependencies (Latest) |
| `saropaPackageVibrancy.updateAllMajor` | Saropa: Update All Dependencies (Major Only) |
| `saropaPackageVibrancy.updateAllMinor` | Saropa: Update All Dependencies (Minor Only) |
| `saropaPackageVibrancy.updateAllPatch` | Saropa: Update All Dependencies (Patch Only) |

## UI: Tree View Title

Add to tree view title bar (secondary menu):

```
[Refresh] [Plan Upgrades] [▼ More]
                            ├─ Update All (Latest)
                            ├─ Update All (Major)
                            ├─ Update All (Minor)
                            └─ Update All (Patch)
```

## UI: Confirmation Dialog

Before applying bulk updates, show confirmation:

```
Update 12 dependencies to latest versions?

• http: ^0.13.0 → ^1.2.0 (major)
• provider: ^6.0.0 → ^6.1.0 (minor)
• path: ^1.8.0 → ^1.8.3 (patch)
... and 9 more

[Cancel] [Update All]
```

## Changes

### New File: `src/services/bulk-updater.ts`

```typescript
interface BulkUpdateOptions {
  readonly incrementFilter: 'all' | 'major' | 'minor' | 'patch';
}

interface BulkUpdateResult {
  readonly updated: { name: string; from: string; to: string; increment: string }[];
  readonly skipped: { name: string; reason: string }[];
}

export async function bulkUpdate(
  results: VibrancyResult[],
  pubspecPath: string,
  options: BulkUpdateOptions
): Promise<BulkUpdateResult>;
```

- Filters packages by increment type
- Uses existing `pubspec-editor.ts` for YAML modification
- Returns summary of what was updated/skipped

### New File: `src/scoring/version-increment.ts`

```typescript
type VersionIncrement = 'major' | 'minor' | 'patch' | 'prerelease' | 'none';

export function classifyIncrement(from: string, to: string): VersionIncrement;
export function filterByIncrement(
  packages: VibrancyResult[],
  filter: 'all' | 'major' | 'minor' | 'patch'
): VibrancyResult[];
```

- Pure functions for version comparison
- Uses `semver` library

### Modified: `src/providers/tree-commands.ts`

- Add handlers for four new commands
- Show confirmation dialog
- Call `bulkUpdate()` and display results
- Trigger re-scan on completion

### Modified: `src/extension-activation.ts`

- Register four new commands

### Modified: `package.json`

```json
{
  "contributes": {
    "commands": [
      {
        "command": "saropaPackageVibrancy.updateAllLatest",
        "title": "Saropa: Update All Dependencies (Latest)",
        "icon": "$(cloud-download)"
      },
      {
        "command": "saropaPackageVibrancy.updateAllMajor",
        "title": "Saropa: Update All Dependencies (Major Only)"
      },
      {
        "command": "saropaPackageVibrancy.updateAllMinor",
        "title": "Saropa: Update All Dependencies (Minor Only)"
      },
      {
        "command": "saropaPackageVibrancy.updateAllPatch",
        "title": "Saropa: Update All Dependencies (Patch Only)"
      }
    ],
    "menus": {
      "view/title": [
        {
          "command": "saropaPackageVibrancy.updateAllLatest",
          "when": "view == saropaPackageVibrancy.packages",
          "group": "2_bulk@1"
        },
        {
          "command": "saropaPackageVibrancy.updateAllMajor",
          "when": "view == saropaPackageVibrancy.packages",
          "group": "2_bulk@2"
        },
        {
          "command": "saropaPackageVibrancy.updateAllMinor",
          "when": "view == saropaPackageVibrancy.packages",
          "group": "2_bulk@3"
        },
        {
          "command": "saropaPackageVibrancy.updateAllPatch",
          "when": "view == saropaPackageVibrancy.packages",
          "group": "2_bulk@4"
        }
      ]
    }
  }
}
```

### Tests

- `src/test/scoring/version-increment.test.ts`:
  - Major increment detection (1.0.0 → 2.0.0)
  - Minor increment detection (1.0.0 → 1.1.0)
  - Patch increment detection (1.0.0 → 1.0.1)
  - Prerelease handling
  - No change detection

- `src/test/services/bulk-updater.test.ts`:
  - Filter by increment type
  - Update multiple packages
  - Skip suppressed packages
  - Handle empty updatable list
  - Error handling for invalid pubspec

## Configuration

Add setting for confirmation behavior:

```json
{
  "saropaPackageVibrancy.bulkUpdateConfirmation": {
    "type": "boolean",
    "default": true,
    "description": "Show confirmation dialog before bulk updating dependencies"
  }
}
```

## Out of Scope

- Undo functionality (users can git revert)
- Dry-run mode (confirmation dialog serves this purpose)
- Transitive dependency updates (direct only)
- Lock file regeneration (user runs `flutter pub get`)
