# Plan: Prerelease Version Display

## Problem

Some Flutter packages publish prerelease versions (dev, beta, rc, alpha) that
contain important fixes or features before stable release. Currently, the
extension only shows the latest stable version. Developers working on the
edge (or needing critical fixes) have no visibility into available prereleases.

VersionLens shows prerelease versions separately with a toggle command,
allowing developers to see both stable and prerelease options.

## Goal

1. Fetch and display prerelease versions alongside stable versions
2. Provide a toggle to show/hide prereleases
3. Indicate when a prerelease is newer than the latest stable
4. Allow updating to a specific prerelease version

## What Counts as Prerelease

Semantic versioning defines prereleases with a hyphen suffix:

| Version | Type |
|---------|------|
| `2.0.0` | Stable |
| `2.1.0-dev.1` | Prerelease (dev) |
| `2.1.0-beta.2` | Prerelease (beta) |
| `2.1.0-rc.1` | Prerelease (release candidate) |
| `2.1.0-alpha` | Prerelease (alpha) |
| `2.1.0-nullsafety.0` | Prerelease (null safety migration) |

## How It Works

### Step 1: Fetch All Versions

Pub.dev API already returns all versions including prereleases. Currently
we filter to `latest` only. Extend to capture the latest prerelease.

### Step 2: Classify Versions

For each package, identify:
- `latestStable`: Highest version without prerelease suffix
- `latestPrerelease`: Highest version with prerelease suffix (if newer than stable)

### Step 3: Display in UI

When prereleases are enabled:

**CodeLens:**
```
provider ^6.0.0 — 74 Vibrant | → 6.1.0 | 🧪 7.0.0-dev.1
```

**Tree View:**
```
📦 provider — 74 Vibrant
  ├─ ⬆️ Update: 6.0.0 → 6.1.0 (minor)
  └─ 🧪 Prerelease: 7.0.0-dev.1
```

**Hover:**
```
Versions
  Pinned:     ^6.0.0
  Latest:     6.1.0
  Prerelease: 7.0.0-dev.1 (dev)
```

### Step 4: Toggle Command

Toggle prerelease visibility without changing settings:
- `Saropa: Show Prerelease Versions`
- `Saropa: Hide Prerelease Versions`

## UI: Configuration

```json
{
  "saropaPackageVibrancy.showPrereleases": {
    "type": "boolean",
    "default": false,
    "description": "Show prerelease versions (dev, beta, rc) in CodeLens and tree view"
  },
  "saropaPackageVibrancy.prereleaseTagFilter": {
    "type": "array",
    "items": { "type": "string" },
    "default": [],
    "description": "Only show prereleases matching these tags (e.g., ['beta', 'rc']). Empty = show all prereleases."
  }
}
```

## UI: Commands

| Command | Title |
|---------|-------|
| `saropaPackageVibrancy.showPrereleases` | Saropa: Show Prerelease Versions |
| `saropaPackageVibrancy.hidePrereleases` | Saropa: Hide Prerelease Versions |
| `saropaPackageVibrancy.updateToPrerelease` | Update to Prerelease |

## UI: Tree View Item

When a prerelease is available, add a child item:

```
📦 provider — 74 Vibrant → 6.1.0
  └─ 🧪 Prerelease: 7.0.0-dev.1
       Context menu: [Update to Prerelease]
```

## UI: CodeLens

When prereleases are enabled, show alongside stable:

```
provider ^6.0.0 — 74 Vibrant | → 6.1.0 | 🧪 7.0.0-dev.1
```

The `🧪` prefix indicates prerelease. Clicking opens quick pick to choose
between stable and prerelease.

## Changes

### Modified: `src/types.ts`

Add to `VibrancyResult`:

```typescript
interface VibrancyResult {
  // ... existing fields
  readonly latestPrerelease: string | null;
  readonly prereleaseTag: string | null; // 'dev', 'beta', 'rc', etc.
}
```

### New File: `src/scoring/prerelease-classifier.ts`

```typescript
export function isPrerelease(version: string): boolean;
export function getPrereleaseTag(version: string): string | null;
export function findLatestPrerelease(versions: string[]): string | null;
export function filterByTags(versions: string[], tags: string[]): string[];
```

- Pure functions for prerelease detection
- Uses `semver` library for parsing

### Modified: `src/services/pub-dev-api.ts`

- Fetch all versions, not just `latest`
- Extract `latestPrerelease` from version list

### Modified: `src/scan-orchestrator.ts`

- Include prerelease in `VibrancyResult`

### New File: `src/ui/prerelease-toggle.ts`

```typescript
export class PrereleaseToggle implements Disposable {
  private enabled: boolean;
  
  toggle(): void;
  isEnabled(): boolean;
}
```

### Modified: `src/providers/codelens-provider.ts`

- Show prerelease version when enabled and available
- Add click action to choose between versions

### Modified: `src/providers/tree-items.ts`

- Add `PrereleaseItem` child when prerelease available and enabled

### Modified: `src/providers/hover-provider.ts`

- Add prerelease version to hover tooltip

### Modified: `src/extension-activation.ts`

- Register toggle commands
- Create `PrereleaseToggle` instance

### Modified: `package.json`

```json
{
  "contributes": {
    "commands": [
      {
        "command": "saropaPackageVibrancy.showPrereleases",
        "title": "Saropa: Show Prerelease Versions",
        "icon": "$(beaker)"
      },
      {
        "command": "saropaPackageVibrancy.hidePrereleases",
        "title": "Saropa: Hide Prerelease Versions"
      },
      {
        "command": "saropaPackageVibrancy.updateToPrerelease",
        "title": "Update to Prerelease",
        "icon": "$(beaker)"
      }
    ],
    "configuration": {
      "properties": {
        "saropaPackageVibrancy.showPrereleases": {
          "type": "boolean",
          "default": false,
          "description": "Show prerelease versions in CodeLens and tree view"
        },
        "saropaPackageVibrancy.prereleaseTagFilter": {
          "type": "array",
          "items": { "type": "string" },
          "default": [],
          "description": "Only show prereleases matching these tags"
        }
      }
    }
  }
}
```

### Tests

- `src/test/scoring/prerelease-classifier.test.ts`:
  - Detects prerelease versions
  - Extracts tag (dev, beta, rc)
  - Finds latest prerelease from list
  - Filters by tag
  - Handles edge cases (no prereleases, all prereleases)

- `src/test/providers/codelens-provider.test.ts`:
  - Shows prerelease when enabled
  - Hides when disabled
  - Respects tag filter

## Out of Scope

- Showing all prerelease versions (only latest prerelease)
- Prerelease version history
- Automatic prerelease adoption (always requires explicit action)
- Prerelease-specific vibrancy scoring
