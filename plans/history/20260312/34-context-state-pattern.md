# Plan: Context State Pattern

## Problem

The extension uses basic `when` clauses in `package.json` for menu visibility,
but doesn't leverage VS Code's full context state system. This leads to:

- Menu items that should be hidden still appearing
- No programmatic control over UI state
- Duplicate visibility logic across providers
- State not shared between components

Similar extensions use a `ContextState<T>` pattern that syncs extension state with
VS Code's context API, enabling fine-grained UI control.

## Goal

Implement a centralized state management pattern that:

1. Syncs extension state with VS Code context for `when` clauses
2. Provides type-safe access to state across components
3. Enables reactive UI updates when state changes
4. Simplifies menu visibility logic

## Current State Problems

### Menu Visibility

Currently scattered in `package.json`:
```json
{
  "when": "view == saropaPackageVibrancy.packages"
}
```

Should be:
```json
{
  "when": "saropaPackageVibrancy.hasResults && saropaPackageVibrancy.hasUpdates"
}
```

### State Tracking

Currently implicit:
- "Has scan run?" — check if results array exists
- "Is scanning?" — check progress notification
- "Has updates?" — filter results each time

Should be explicit:
```typescript
state.hasResults // true/false
state.isScanning // true/false
state.updatableCount // number
```

## Context State Design

### Core Pattern

```typescript
class ContextState<T> {
  constructor(
    private readonly key: string,
    private readonly defaultValue: T
  );
  
  get value(): T;
  set value(newValue: T);
  
  // Automatically calls setContext when value changes
}
```

### Extension State

```typescript
interface VibrancyState {
  // Scan state
  hasResults: boolean;
  isScanning: boolean;
  lastScanTime: number | null;
  
  // Results summary
  packageCount: number;
  updatableCount: number;
  problemCount: number;
  
  // Feature toggles
  codeLensEnabled: boolean;
  prereleaseEnabled: boolean;
  
  // Active provider
  activeProvider: 'tree' | 'editor' | null;
  
  // Selected package
  selectedPackage: string | null;
}
```

### Usage in When Clauses

```json
{
  "menus": {
    "view/title": [
      {
        "command": "saropaPackageVibrancy.updateAllLatest",
        "when": "saropaPackageVibrancy.hasResults && saropaPackageVibrancy.updatableCount > 0"
      },
      {
        "command": "saropaPackageVibrancy.scan",
        "when": "!saropaPackageVibrancy.isScanning"
      }
    ],
    "editor/title": [
      {
        "command": "saropaPackageVibrancy.hideCodeLens",
        "when": "resourceFilename == pubspec.yaml && saropaPackageVibrancy.codeLensEnabled"
      }
    ]
  }
}
```

## How It Works

### Step 1: Define State Schema

```typescript
const STATE_KEYS = {
  hasResults: 'saropaPackageVibrancy.hasResults',
  isScanning: 'saropaPackageVibrancy.isScanning',
  packageCount: 'saropaPackageVibrancy.packageCount',
  updatableCount: 'saropaPackageVibrancy.updatableCount',
  problemCount: 'saropaPackageVibrancy.problemCount',
  codeLensEnabled: 'saropaPackageVibrancy.codeLensEnabled',
  prereleaseEnabled: 'saropaPackageVibrancy.prereleaseEnabled',
  selectedPackage: 'saropaPackageVibrancy.selectedPackage',
} as const;
```

### Step 2: Create State Manager

```typescript
class VibrancyStateManager {
  private states: Map<string, ContextState<any>>;
  
  constructor() {
    this.states = new Map([
      ['hasResults', new ContextState(STATE_KEYS.hasResults, false)],
      ['isScanning', new ContextState(STATE_KEYS.isScanning, false)],
      // ...
    ]);
  }
  
  get hasResults(): boolean {
    return this.states.get('hasResults')!.value;
  }
  
  set hasResults(value: boolean) {
    this.states.get('hasResults')!.value = value;
  }
  
  // Called after scan completes
  updateFromResults(results: VibrancyResult[]): void {
    this.hasResults = results.length > 0;
    this.packageCount = results.length;
    this.updatableCount = results.filter(r => r.latestVersion !== r.pinnedVersion).length;
    this.problemCount = results.filter(r => r.category === 'End of Life' || r.category === 'Legacy-Locked').length;
  }
}
```

### Step 3: Wire to Components

```typescript
// In scan orchestrator
async function runScan(): Promise<void> {
  stateManager.isScanning = true;
  try {
    const results = await scan();
    stateManager.updateFromResults(results);
  } finally {
    stateManager.isScanning = false;
  }
}

// In tree view
treeView.onDidChangeSelection(e => {
  stateManager.selectedPackage = e.selection[0]?.name ?? null;
});

// In CodeLens toggle
toggle.onChange(enabled => {
  stateManager.codeLensEnabled = enabled;
});
```

## Changes

### New File: `src/state/context-state.ts`

```typescript
export class ContextState<T> {
  private _value: T;
  
  constructor(
    private readonly key: string,
    defaultValue: T
  ) {
    this._value = defaultValue;
    this.sync();
  }
  
  get value(): T {
    return this._value;
  }
  
  set value(newValue: T) {
    if (this._value !== newValue) {
      this._value = newValue;
      this.sync();
    }
  }
  
  private sync(): void {
    vscode.commands.executeCommand('setContext', this.key, this._value);
  }
}
```

### New File: `src/state/vibrancy-state.ts`

```typescript
export class VibrancyStateManager implements Disposable {
  readonly hasResults: ContextState<boolean>;
  readonly isScanning: ContextState<boolean>;
  readonly packageCount: ContextState<number>;
  readonly updatableCount: ContextState<number>;
  readonly problemCount: ContextState<number>;
  readonly codeLensEnabled: ContextState<boolean>;
  readonly prereleaseEnabled: ContextState<boolean>;
  readonly selectedPackage: ContextState<string | null>;
  
  constructor(config: ConfigService);
  
  updateFromResults(results: VibrancyResult[]): void;
  reset(): void;
  dispose(): void;
}
```

### Modified: `src/extension-activation.ts`

- Create `VibrancyStateManager` instance
- Pass to components that need to update state
- Wire state updates to scan lifecycle

### Modified: `src/scan-orchestrator.ts`

- Update state at scan start/end
- Update result counts after scan

### Modified: `src/providers/tree-data-provider.ts`

- Update `selectedPackage` on selection change

### Modified: `src/ui/codelens-toggle.ts`

- Update `codeLensEnabled` state on toggle

### Modified: `package.json`

Update all `when` clauses to use context keys:

```json
{
  "menus": {
    "view/title": [
      {
        "command": "saropaPackageVibrancy.updateAllLatest",
        "when": "view == saropaPackageVibrancy.packages && saropaPackageVibrancy.updatableCount > 0",
        "group": "2_bulk@1"
      }
    ],
    "commandPalette": [
      {
        "command": "saropaPackageVibrancy.showCodeLens",
        "when": "!saropaPackageVibrancy.codeLensEnabled"
      },
      {
        "command": "saropaPackageVibrancy.hideCodeLens",
        "when": "saropaPackageVibrancy.codeLensEnabled"
      }
    ]
  }
}
```

### Tests

- `src/test/state/context-state.test.ts`:
  - Initial value set
  - Value changes sync to context
  - No sync on same value
  - Handles null values

- `src/test/state/vibrancy-state.test.ts`:
  - Updates from results
  - Reset clears all state
  - Individual state changes
  - Multiple subscribers

## Benefits

1. **Cleaner package.json**: `when` clauses are semantic, not implementation details
2. **Reactive UI**: Menu items appear/disappear based on actual state
3. **Centralized state**: Single source of truth for extension state
4. **Type safety**: TypeScript catches invalid state access
5. **Testability**: State can be mocked in tests

## Migration

All existing `when` clauses need review:

| Current | New |
|---------|-----|
| `view == saropaPackageVibrancy.packages` | Keep (view identity) |
| `viewItem =~ /vibrancyPackage/` | Keep (item context) |
| N/A | Add `saropaPackageVibrancy.hasResults` |
| N/A | Add `saropaPackageVibrancy.updatableCount > 0` |

## Out of Scope

- Persisting state across sessions (use settings for that)
- State history/undo
- Cross-workspace state sync
- Observable state with multiple subscribers (keep it simple)
