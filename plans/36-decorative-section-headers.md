# Plan: Decorative Section Headers

## Problem

Large pubspec.yaml files become hard to navigate. Dependencies, dev dependencies,
Flutter config, and other sections blend together. Visual separators help
developers quickly locate sections when scrolling.

## Goal

Add optional ornamental comment blocks above major pubspec sections:

1. **Section headers**: Decorative dividers above dependencies, dev_dependencies,
   dependency_overrides, flutter, flutter_launcher_icons, flutter_native_splash
2. **Override markers**: Special annotation above dependencies that have
   corresponding overrides (helps developers remember why an override exists)

## How It Works

### Section Headers

When running the Annotate command, insert decorative headers:

```yaml
# ╔═══════════════════════════════════════════════════════════════════╗
# ║  DEPENDENCIES                                                      ║
# ╚═══════════════════════════════════════════════════════════════════╝
dependencies:
  http: ^1.0.0
```

Configurable via `annotateSectionHeaders` setting (default: true).

### Override Markers

When a dependency has a corresponding entry in dependency_overrides, insert
a marker comment:

```yaml
dependencies:
  # ⚠️ DEP OVERRIDDEN BELOW — see dependency_overrides section
  http: ^1.0.0
  provider: ^6.0.0
```

This helps developers remember that the resolved version differs from the
constraint.

### Sub-Section Headers

Within the `flutter:` section, add smaller headers for assets and fonts:

```yaml
flutter:
  # ─── Assets ───────────────────────────────────────────
  assets:
    - assets/images/
  
  # ─── Fonts ────────────────────────────────────────────
  fonts:
    - family: Roboto
```

## Changes

### Modified: `src/providers/annotate-command.ts`

Add section header generation:

```typescript
const SECTION_HEADERS: Record<string, string> = {
  dependencies: 'DEPENDENCIES',
  dev_dependencies: 'DEV DEPENDENCIES',
  dependency_overrides: 'DEPENDENCY OVERRIDES',
  flutter: 'FLUTTER CONFIG',
};

function buildSectionHeader(title: string): string[] {
  return [
    '# ╔═══════════════════════════════════════════════════════════════════╗',
    `# ║  ${title.padEnd(64)}║`,
    '# ╚═══════════════════════════════════════════════════════════════════╝',
  ];
}
```

Add override marker detection:

```typescript
function shouldMarkOverride(packageName: string, overrides: Set<string>): boolean {
  return overrides.has(packageName);
}
```

### Modified: `package.json`

```json
{
  "saropaPackageVibrancy.annotateSectionHeaders": {
    "type": "boolean",
    "default": true,
    "description": "Insert decorative section headers above major pubspec sections"
  }
}
```

### Tests

- `src/test/providers/annotate-command.test.ts`:
  - Section headers inserted above each section
  - Override marker inserted for overridden deps
  - Headers not duplicated on re-run
  - Sub-section headers for assets/fonts
  - Respects `annotateSectionHeaders` setting

## Out of Scope

- Custom header styles
- Color/icon customization (YAML comments are plain text)
- Automatic header updates when sections change
