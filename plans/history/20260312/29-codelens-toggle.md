# Plan: CodeLens Toggle Commands

## Problem

The current CodeLens visibility is controlled only via settings
(`enableCodeLens`). Changing settings requires navigating to preferences,
which interrupts workflow. Developers may want to quickly toggle CodeLens
on/off without leaving the editor.

Similar extensions provide "Show Version Lenses" and "Hide Version Lenses" commands
that toggle visibility with a single action, plus a status bar indicator.

## Goal

Add commands and a status bar item to quickly toggle CodeLens visibility:

1. **Show/Hide Commands**: Instant toggle without opening settings
2. **Status Bar Indicator**: Shows current state, clickable to toggle
3. **Editor Title Button**: Quick access from pubspec.yaml editor

## How It Works

### State Management

Use VS Code's context API to track CodeLens state:

```typescript
vscode.commands.executeCommand('setContext', 'saropaPackageVibrancy.codeLensEnabled', true);
```

This enables conditional menu items and button visibility.

### Toggle Behavior

When toggled:
1. Update internal state
2. Update VS Code context
3. Refresh CodeLens provider (triggers re-render)
4. Update status bar item

The setting `enableCodeLens` remains the default. The toggle command creates
a session-level override that resets on reload.

## UI: Commands

| Command | Title | Visible When |
|---------|-------|--------------|
| `saropaPackageVibrancy.showCodeLens` | Saropa: Show Vibrancy Badges | CodeLens hidden |
| `saropaPackageVibrancy.hideCodeLens` | Saropa: Hide Vibrancy Badges | CodeLens visible |
| `saropaPackageVibrancy.toggleCodeLens` | Saropa: Toggle Vibrancy Badges | Always |

## UI: Status Bar Item

Add a status bar item showing current CodeLens state:

**When enabled:**
```
$(eye) Vibrancy
```

**When disabled:**
```
$(eye-closed) Vibrancy
```

Clicking toggles the state. Tooltip shows: "Click to hide/show vibrancy badges"

### Status Bar Position

- Alignment: Right side
- Priority: 100 (near other extension indicators)

## UI: Editor Title Bar

When viewing `pubspec.yaml`, show toggle button in editor title:

**When enabled:**
```
[$(eye)] — Click to hide badges
```

**When disabled:**
```
[$(eye-closed)] — Click to show badges
```

## Changes

### New File: `src/ui/codelens-toggle.ts`

```typescript
export class CodeLensToggle implements Disposable {
  private enabled: boolean;
  private statusBarItem: StatusBarItem;
  
  constructor(initialState: boolean);
  
  toggle(): void;
  show(): void;
  hide(): void;
  isEnabled(): boolean;
  
  dispose(): void;
}
```

- Manages toggle state
- Updates VS Code context
- Manages status bar item
- Emits change events for CodeLens provider

### Modified: `src/providers/codelens-provider.ts`

- Accept `CodeLensToggle` instance
- Check `isEnabled()` before returning lenses
- Subscribe to toggle changes for refresh

```typescript
provideCodeLenses(document: TextDocument): CodeLens[] {
  if (!this.toggle.isEnabled()) {
    return [];
  }
  // ... existing logic
}
```

### Modified: `src/extension-activation.ts`

- Create `CodeLensToggle` instance with initial state from settings
- Pass to CodeLens provider
- Register toggle commands

### Modified: `package.json`

```json
{
  "contributes": {
    "commands": [
      {
        "command": "saropaPackageVibrancy.showCodeLens",
        "title": "Saropa: Show Vibrancy Badges",
        "icon": "$(eye)"
      },
      {
        "command": "saropaPackageVibrancy.hideCodeLens",
        "title": "Saropa: Hide Vibrancy Badges",
        "icon": "$(eye-closed)"
      },
      {
        "command": "saropaPackageVibrancy.toggleCodeLens",
        "title": "Saropa: Toggle Vibrancy Badges"
      }
    ],
    "menus": {
      "editor/title": [
        {
          "command": "saropaPackageVibrancy.hideCodeLens",
          "when": "resourceFilename == pubspec.yaml && saropaPackageVibrancy.codeLensEnabled",
          "group": "navigation"
        },
        {
          "command": "saropaPackageVibrancy.showCodeLens",
          "when": "resourceFilename == pubspec.yaml && !saropaPackageVibrancy.codeLensEnabled",
          "group": "navigation"
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
}
```

### Tests

- `src/test/ui/codelens-toggle.test.ts`:
  - Initial state from settings
  - Toggle flips state
  - Show/hide explicit methods
  - Context updated on change
  - Status bar text updates
  - Events emitted on change

- `src/test/providers/codelens-provider.test.ts`:
  - Returns empty when disabled
  - Returns lenses when enabled
  - Responds to toggle changes

## Configuration

Keep existing setting as the default:

```json
{
  "saropaPackageVibrancy.enableCodeLens": {
    "type": "boolean",
    "default": true,
    "description": "Show vibrancy score badges as CodeLens annotations (can be toggled with commands)"
  }
}
```

The toggle creates a session override. Reloading VS Code resets to the
configured default.

## Out of Scope

- Persisting toggle state across sessions (use the setting for that)
- Per-file toggle (all pubspec files share the same state)
- Keyboard shortcut binding (users can bind via keybindings.json)
