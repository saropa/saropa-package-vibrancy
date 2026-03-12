# Plan: Sort Dependencies Command

## Problem

Dependency lists in `pubspec.yaml` grow organically and become disorganized.
Alphabetically sorted dependencies are easier to scan, reduce merge conflicts,
and follow common style guides. Currently developers must manually reorder
entries.

VersionLens provides a "Sort Dependencies" command that alphabetizes all
dependency entries in place.

## Goal

Add a command that alphabetically sorts entries within each dependency
section of `pubspec.yaml`:

- `dependencies:`
- `dev_dependencies:`
- `dependency_overrides:`

Preserve comments and formatting where possible.

## How It Works

### Step 1: Parse YAML Structure

Use the existing YAML parser to read `pubspec.yaml` with comment preservation.
The `yaml` package preserves document structure.

### Step 2: Identify Dependency Sections

Locate the three dependency map nodes:
- `dependencies`
- `dev_dependencies`
- `dependency_overrides`

### Step 3: Sort Each Section

For each section:
1. Extract all key-value pairs
2. Sort alphabetically by package name (case-insensitive)
3. Reorder entries in the YAML document

### Step 4: Write Back

Write the modified YAML back to disk, preserving:
- Header comments
- Inline comments attached to dependencies
- Blank lines between sections
- Original indentation style

## UI: Command

| Command | Title |
|---------|-------|
| `saropaPackageVibrancy.sortDependencies` | Saropa: Sort Dependencies Alphabetically |

## UI: Entry Points

1. **Command Palette**: "Saropa: Sort Dependencies Alphabetically"
2. **Tree View Title Bar**: Secondary menu (⋮) → "Sort Dependencies"
3. **Editor Context Menu**: Right-click in `pubspec.yaml` → "Sort Dependencies"

## Example

**Before:**
```yaml
dependencies:
  flutter:
    sdk: flutter
  http: ^1.0.0
  provider: ^6.0.0
  path: ^1.8.0
  dio: ^5.0.0
  cached_network_image: ^3.0.0
```

**After:**
```yaml
dependencies:
  cached_network_image: ^3.0.0
  dio: ^5.0.0
  flutter:
    sdk: flutter
  http: ^1.0.0
  path: ^1.8.0
  provider: ^6.0.0
```

## Edge Cases

### SDK Dependencies First

Option to keep SDK dependencies (`flutter`, `flutter_test`, `flutter_localizations`)
at the top of the list before alphabetized packages:

```yaml
dependencies:
  flutter:
    sdk: flutter
  # Then alphabetical
  cached_network_image: ^3.0.0
  dio: ^5.0.0
```

### Hosted Dependencies with URL

Preserve complex dependency specs:

```yaml
dependencies:
  my_package:
    hosted:
      name: my_package
      url: https://my-private-pub.example.com
    version: ^1.0.0
```

### Git Dependencies

Preserve git dependency structure:

```yaml
dependencies:
  my_fork:
    git:
      url: https://github.com/me/my_fork.git
      ref: main
```

### Comments

Preserve inline comments:

```yaml
dependencies:
  http: ^1.0.0  # For HTTP requests
  path: ^1.8.0  # Path manipulation
```

## Changes

### New File: `src/services/pubspec-sorter.ts`

```typescript
interface SortOptions {
  readonly sdkFirst: boolean;
  readonly caseSensitive: boolean;
}

export async function sortDependencies(
  pubspecPath: string,
  options?: SortOptions
): Promise<SortResult>;

interface SortResult {
  readonly sorted: boolean;
  readonly sectionsModified: string[];
  readonly entriesMoved: number;
}
```

- Parses YAML with comment preservation
- Sorts each dependency section
- Returns summary of changes

### Modified: `src/providers/tree-commands.ts`

- Add handler for `sortDependencies` command
- Show notification on completion

### Modified: `src/extension-activation.ts`

- Register command

### Modified: `package.json`

```json
{
  "contributes": {
    "commands": [
      {
        "command": "saropaPackageVibrancy.sortDependencies",
        "title": "Saropa: Sort Dependencies Alphabetically",
        "icon": "$(list-ordered)"
      }
    ],
    "menus": {
      "view/title": [
        {
          "command": "saropaPackageVibrancy.sortDependencies",
          "when": "view == saropaPackageVibrancy.packages",
          "group": "3_organize@1"
        }
      ],
      "editor/context": [
        {
          "command": "saropaPackageVibrancy.sortDependencies",
          "when": "resourceFilename == pubspec.yaml",
          "group": "saropa@1"
        }
      ]
    }
  }
}
```

Add configuration:

```json
{
  "saropaPackageVibrancy.sortSdkFirst": {
    "type": "boolean",
    "default": true,
    "description": "Keep SDK dependencies (flutter, flutter_test) at the top when sorting"
  }
}
```

### Tests

- `src/test/services/pubspec-sorter.test.ts`:
  - Sorts simple version constraints
  - Preserves SDK dependencies at top (when enabled)
  - Handles git dependencies
  - Handles hosted dependencies
  - Preserves inline comments
  - Handles empty sections
  - No-op when already sorted
  - Handles mixed dependency types

## Out of Scope

- Sorting other pubspec sections (not dependencies)
- Custom sort order (always alphabetical)
- Sort on save (too invasive)
- Group by category (e.g., state management, networking)
