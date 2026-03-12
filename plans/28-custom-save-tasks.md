# Plan: Custom Save Tasks

## Problem

After modifying `pubspec.yaml`, developers must manually run `flutter pub get`
to resolve dependencies. This is a friction point that interrupts workflow.
Some teams also want to run linting, formatting, or custom scripts after
dependency changes.

VersionLens provides a "custom install task" feature that runs a configured
VS Code task when package files are saved.

## Goal

Automatically run a configurable command or VS Code task when `pubspec.yaml`
is saved. Default to `flutter pub get` but allow customization.

## How It Works

### Step 1: Watch for Save Events

Listen to `workspace.onDidSaveTextDocument` for files named `pubspec.yaml`.

### Step 2: Detect Dependency Changes

Compare the saved content against the last known state:
- If dependencies changed, trigger the task
- If only metadata changed (name, description), skip

This prevents unnecessary `pub get` runs when editing non-dependency fields.

### Step 3: Run Configured Task

Execute the configured command:
1. If a VS Code task name is configured, run that task
2. Otherwise, run the default command in the integrated terminal

### Step 4: Show Feedback

Display progress notification while task runs. Show success/failure status.

## Configuration

```json
{
  "saropaPackageVibrancy.onSaveChanges": {
    "type": "string",
    "default": "",
    "description": "Command or VS Code task name to run when pubspec.yaml is saved with dependency changes. Empty = disabled. Examples: 'flutter pub get', 'task:my-custom-task'"
  },
  "saropaPackageVibrancy.onSaveChangesDetection": {
    "type": "string",
    "enum": ["any", "dependencies"],
    "default": "dependencies",
    "enumDescriptions": [
      "Run on any pubspec.yaml save",
      "Run only when dependency sections change"
    ],
    "description": "When to trigger the on-save task"
  }
}
```

## Command Format

The `onSaveChanges` setting supports:

| Format | Example | Behavior |
|--------|---------|----------|
| Shell command | `flutter pub get` | Run in integrated terminal |
| VS Code task | `task:Build` | Run VS Code task by name |
| Empty string | `""` | Disabled (default) |

## UI: Status Bar

While task is running, show in status bar:

```
$(sync~spin) flutter pub get...
```

On completion:
```
$(check) pub get complete
```

Auto-hide after 3 seconds.

## Changes

### New File: `src/services/save-task-runner.ts`

```typescript
interface SaveTaskConfig {
  readonly command: string;
  readonly detection: 'any' | 'dependencies';
}

export class SaveTaskRunner implements Disposable {
  constructor(config: SaveTaskConfig);
  
  onDocumentSaved(document: TextDocument): Promise<void>;
  dispose(): void;
}
```

- Caches last-known dependency content per file
- Compares on save to detect changes
- Executes configured command or task
- Handles errors gracefully

### New File: `src/services/dependency-differ.ts`

```typescript
export function hasDependencyChanges(
  oldContent: string,
  newContent: string
): boolean;
```

- Parses both YAML contents
- Compares `dependencies`, `dev_dependencies`, `dependency_overrides`
- Returns true if any dependency added, removed, or version changed

### Modified: `src/extension-activation.ts`

- Create `SaveTaskRunner` instance
- Register save event listener
- Dispose on deactivation

### Modified: `package.json`

```json
{
  "contributes": {
    "configuration": {
      "properties": {
        "saropaPackageVibrancy.onSaveChanges": {
          "type": "string",
          "default": "",
          "description": "Command to run when pubspec.yaml is saved with dependency changes. Empty = disabled."
        },
        "saropaPackageVibrancy.onSaveChangesDetection": {
          "type": "string",
          "enum": ["any", "dependencies"],
          "default": "dependencies",
          "description": "When to trigger the on-save task"
        }
      }
    }
  }
}
```

### Tests

- `src/test/services/dependency-differ.test.ts`:
  - Detects added dependency
  - Detects removed dependency
  - Detects version change
  - Ignores non-dependency changes
  - Handles malformed YAML gracefully

- `src/test/services/save-task-runner.test.ts`:
  - Runs command on dependency change
  - Skips when only metadata changes
  - Handles VS Code task format
  - Respects disabled setting
  - Error handling for failed commands

## Edge Cases

### Multiple Pubspec Files (Monorepo)

Each `pubspec.yaml` has its own cached state. Task runs in the directory
containing the modified file.

### Concurrent Saves

Debounce rapid saves (300ms) to avoid running multiple tasks.

### Task Failure

Show error notification but don't block. Log to output channel.

### No Flutter in PATH

If `flutter` command fails, show helpful error message suggesting Flutter
SDK configuration.

## Out of Scope

- Pre-save hooks (only post-save)
- Multiple sequential tasks
- Task output capture (use VS Code's task output)
- Workspace-specific task configuration (use VS Code tasks.json for that)
