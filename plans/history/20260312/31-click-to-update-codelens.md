# Plan: Click-to-Update CodeLens

## Problem

Currently, CodeLens displays version information but updating requires:
1. Going to the tree view, or
2. Using the context menu, or
3. Manually editing the pubspec.yaml

This is friction when the developer is already looking at the CodeLens and
sees an available update. Similar extensions allow clicking directly on the version
number to apply the update.

## Goal

Make the version suggestion in CodeLens clickable. Clicking applies the
update immediately or shows a quick pick when multiple options exist
(stable vs prerelease).

## How It Works

### Single Version Available

When only a stable update is available:

**CodeLens display:**
```
provider ^6.0.0 — 74 Vibrant | [→ 6.1.0]
                               ↑ clickable
```

Clicking `→ 6.1.0` immediately:
1. Updates `pubspec.yaml` to `^6.1.0`
2. Shows brief notification: "Updated provider to ^6.1.0"
3. Refreshes CodeLens

### Multiple Versions Available

When both stable and prerelease are available:

**CodeLens display:**
```
provider ^6.0.0 — 74 Vibrant | [→ 6.1.0] | [🧪 7.0.0-dev.1]
```

Clicking either version applies that specific update.

Or, use a single clickable element that opens a quick pick:

**CodeLens display:**
```
provider ^6.0.0 — 74 Vibrant | [Update ▼]
```

**Quick pick options:**
```
┌─────────────────────────────────────────┐
│ Update provider to...                    │
├─────────────────────────────────────────┤
│ ⬆️ 6.1.0 (stable, minor bump)           │
│ 🧪 7.0.0-dev.1 (prerelease)             │
│ 📌 Keep ^6.0.0                          │
└─────────────────────────────────────────┘
```

## CodeLens Structure

Change CodeLens from informational to actionable:

**Current (informational):**
```typescript
new CodeLens(range, {
  title: "provider ^6.0.0 — 74 Vibrant | → 6.1.0",
  command: "", // No action
});
```

**New (actionable):**
```typescript
// Score/status lens (informational)
new CodeLens(range, {
  title: "provider ^6.0.0 — 74 Vibrant",
  command: "saropaPackageVibrancy.showPackageDetails",
  arguments: [packageName],
});

// Update lens (actionable)
new CodeLens(range, {
  title: "→ 6.1.0",
  command: "saropaPackageVibrancy.updateFromCodeLens",
  arguments: [packageName, "6.1.0"],
});
```

## UI: Multiple CodeLens Per Line

Split information across multiple lenses for distinct click targets:

```
provider ^6.0.0
├─ [74 Vibrant] ← Click opens detail view
├─ [→ 6.1.0] ← Click updates to stable
└─ [🧪 7.0.0-dev.1] ← Click updates to prerelease
```

VS Code renders multiple CodeLens on the same line separated by `|`.

## Changes

### New Command: `updateFromCodeLens`

```typescript
interface UpdateFromCodeLensArgs {
  packageName: string;
  targetVersion: string;
  pubspecPath: string;
}

async function updateFromCodeLens(args: UpdateFromCodeLensArgs): Promise<void>;
```

- Validates the package still exists at that version
- Updates pubspec.yaml
- Shows notification
- Triggers CodeLens refresh

### Modified: `src/providers/codelens-provider.ts`

Restructure CodeLens generation:

```typescript
function buildCodeLensesForPackage(result: VibrancyResult, range: Range): CodeLens[] {
  const lenses: CodeLens[] = [];
  
  // Status lens (always present)
  lenses.push(new CodeLens(range, {
    title: `${result.name} — ${result.score} ${result.category}`,
    command: "saropaPackageVibrancy.focusPackageInTree",
    arguments: [result.name],
  }));
  
  // Update lens (when update available)
  if (result.latestVersion && result.latestVersion !== result.pinnedVersion) {
    lenses.push(new CodeLens(range, {
      title: `→ ${result.latestVersion}`,
      command: "saropaPackageVibrancy.updateFromCodeLens",
      arguments: [{ packageName: result.name, targetVersion: result.latestVersion }],
    }));
  }
  
  // Prerelease lens (when enabled and available)
  if (prereleaseEnabled && result.latestPrerelease) {
    lenses.push(new CodeLens(range, {
      title: `🧪 ${result.latestPrerelease}`,
      command: "saropaPackageVibrancy.updateFromCodeLens",
      arguments: [{ packageName: result.name, targetVersion: result.latestPrerelease }],
    }));
  }
  
  return lenses;
}
```

### Modified: `src/providers/tree-commands.ts`

Add `updateFromCodeLens` command handler.

### Modified: `src/extension-activation.ts`

Register new command.

### Modified: `package.json`

```json
{
  "contributes": {
    "commands": [
      {
        "command": "saropaPackageVibrancy.updateFromCodeLens",
        "title": "Update Package Version"
      },
      {
        "command": "saropaPackageVibrancy.focusPackageInTree",
        "title": "Show Package in Tree View"
      }
    ]
  }
}
```

### Configuration

Add option for click behavior:

```json
{
  "saropaPackageVibrancy.codeLensClickAction": {
    "type": "string",
    "enum": ["update", "quickpick", "details"],
    "default": "update",
    "enumDescriptions": [
      "Immediately apply the update",
      "Show quick pick with version options",
      "Open package details view"
    ],
    "description": "Action when clicking on a version in CodeLens"
  }
}
```

### Tests

- `src/test/providers/codelens-provider.test.ts`:
  - Generates separate lenses for status and update
  - Update lens has correct command and arguments
  - Prerelease lens appears when enabled
  - No update lens when up-to-date

- `src/test/commands/update-from-codelens.test.ts`:
  - Updates pubspec correctly
  - Shows notification
  - Handles missing package gracefully
  - Respects click action setting

## Visual Design

### Minimal Mode (default)

```
provider ^6.0.0 — 74 Vibrant | → 6.1.0
```

### Detailed Mode

```
provider ^6.0.0 — 74 Vibrant | minor update → 6.1.0 | 🧪 7.0.0-dev.1
```

### Compact Mode

```
provider 74 | → 6.1.0
```

## Out of Scope

- Undo after update (use git)
- Batch update via CodeLens (use bulk commands)
- Version history in CodeLens dropdown
- Auto-refresh after external pubspec changes
