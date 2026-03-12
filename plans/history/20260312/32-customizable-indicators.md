# Plan: Customizable Status Indicators

## Problem

The extension uses hardcoded emoji and text for status indicators (Vibrant,
Quiet, Legacy-Locked, End of Life). Users may prefer:
- Different emoji styles
- Text-only indicators for accessibility
- Custom symbols matching their team's conventions
- No indicators at all (minimal mode)

VersionLens allows customizing the indicator symbols via settings.

## Goal

Let users customize the visual indicators used throughout the extension:
- Status category emoji (🟢 Vibrant, 🟡 Quiet, etc.)
- Update indicator (→, ↑, ⬆️)
- Alert symbols (⚠️, 🚨, etc.)
- Or disable indicators entirely

## Default Indicators

| Status | Default Emoji | Default Text |
|--------|---------------|--------------|
| Vibrant | 🟢 | Vibrant |
| Quiet | 🟡 | Quiet |
| Legacy-Locked | 🟠 | Legacy-Locked |
| End of Life | 🔴 | End of Life |
| Update Available | → | (update available) |
| Prerelease | 🧪 | (prerelease) |
| Warning | ⚠️ | Warning |
| Error | 🚨 | Error |
| Unused | 👻 | Unused |

## Configuration

```json
{
  "saropaPackageVibrancy.indicators": {
    "type": "object",
    "default": {
      "vibrant": "🟢",
      "quiet": "🟡",
      "legacyLocked": "🟠",
      "endOfLife": "🔴",
      "updateAvailable": "→",
      "prerelease": "🧪",
      "warning": "⚠️",
      "error": "🚨",
      "unused": "👻",
      "suppressed": "🔇"
    },
    "description": "Custom symbols for status indicators. Set to empty string to hide.",
    "properties": {
      "vibrant": { "type": "string" },
      "quiet": { "type": "string" },
      "legacyLocked": { "type": "string" },
      "endOfLife": { "type": "string" },
      "updateAvailable": { "type": "string" },
      "prerelease": { "type": "string" },
      "warning": { "type": "string" },
      "error": { "type": "string" },
      "unused": { "type": "string" },
      "suppressed": { "type": "string" }
    }
  },
  "saropaPackageVibrancy.indicatorStyle": {
    "type": "string",
    "enum": ["emoji", "text", "both", "none"],
    "default": "emoji",
    "enumDescriptions": [
      "Show emoji only (🟢)",
      "Show text only (Vibrant)",
      "Show both (🟢 Vibrant)",
      "Show neither (score only)"
    ],
    "description": "How to display status indicators"
  }
}
```

## Preset Themes

Provide preset configurations for common preferences:

### Minimal (Text Only)
```json
{
  "saropaPackageVibrancy.indicatorStyle": "text"
}
```
Result: `provider — 74 Vibrant`

### Emoji Only
```json
{
  "saropaPackageVibrancy.indicatorStyle": "emoji"
}
```
Result: `provider — 74 🟢`

### Arrows Theme
```json
{
  "saropaPackageVibrancy.indicators": {
    "vibrant": "✓",
    "quiet": "~",
    "legacyLocked": "!",
    "endOfLife": "✗",
    "updateAvailable": "↑"
  }
}
```
Result: `provider — 74 ✓ | ↑ 6.1.0`

### Accessibility (High Contrast)
```json
{
  "saropaPackageVibrancy.indicators": {
    "vibrant": "[OK]",
    "quiet": "[WARN]",
    "legacyLocked": "[OLD]",
    "endOfLife": "[EOL]"
  },
  "saropaPackageVibrancy.indicatorStyle": "text"
}
```
Result: `provider — 74 [OK]`

## How It Works

### Step 1: Load Configuration

On activation and configuration change, load indicator settings into a
central configuration object.

### Step 2: Provide to Formatters

Pass indicator configuration to all formatting functions:
- CodeLens formatter
- Tree item label builder
- Hover content builder
- Diagnostic message builder

### Step 3: Apply in UI

Use the configured symbols when building display strings.

## Changes

### New File: `src/services/indicator-config.ts`

```typescript
interface IndicatorConfig {
  readonly vibrant: string;
  readonly quiet: string;
  readonly legacyLocked: string;
  readonly endOfLife: string;
  readonly updateAvailable: string;
  readonly prerelease: string;
  readonly warning: string;
  readonly error: string;
  readonly unused: string;
  readonly suppressed: string;
}

type IndicatorStyle = 'emoji' | 'text' | 'both' | 'none';

export function loadIndicatorConfig(): IndicatorConfig;
export function formatStatus(
  category: VibrancyCategory,
  config: IndicatorConfig,
  style: IndicatorStyle
): string;
```

### Modified: `src/scoring/codelens-formatter.ts`

- Accept `IndicatorConfig` parameter
- Use configured symbols instead of hardcoded emoji
- Apply style setting

### Modified: `src/providers/tree-items.ts`

- Use `IndicatorConfig` for tree item icons and labels

### Modified: `src/providers/hover-provider.ts`

- Use configured indicators in hover content

### Modified: `src/extension-activation.ts`

- Load indicator config on activation
- Listen for config changes
- Pass config to providers

### Modified: `package.json`

Add configuration schema (see Configuration section above).

### Tests

- `src/test/services/indicator-config.test.ts`:
  - Loads default config
  - Merges partial user config
  - Handles empty strings (hide indicator)
  - Validates config shape

- `src/test/scoring/codelens-formatter.test.ts`:
  - Uses custom emoji
  - Respects style setting
  - Handles missing indicators

## Migration

Existing hardcoded emoji references:
- `src/scoring/codelens-formatter.ts`: Category badges
- `src/providers/tree-items.ts`: Tree item icons
- `src/providers/hover-provider.ts`: Status section
- `src/providers/diagnostics.ts`: Message prefixes

All must be updated to use `IndicatorConfig`.

## Out of Scope

- Custom icons (ThemeIcon) for tree view (VS Code limitation)
- Per-package indicator overrides
- Animated indicators
- Color customization (use VS Code themes)
