# Plan 22: Modularity Refactoring

## Problem Statement

Recent commit `5ff01bb` bundled two unrelated features (annotation improvements + EOL diagnostics) because files had overlapping concerns. This indicates architectural coupling that should be addressed.

## Architecture Analysis Summary

| Layer | Files | Coupling Level | Issues |
|-------|-------|----------------|--------|
| `src/` root | 5 | High (expected) | `extension-activation.ts` has too many responsibilities |
| `providers/` | 10 | Medium | 2 layer violations, `tree-items.ts` too large |
| `scoring/` | 14 | Low | Excellent - pure functions |
| `services/` | 18 | Low-Medium | Some utilities belong elsewhere |
| `ui/` | 1 | Low | Good |
| `views/` | 11 | Low | Good |

## Identified Issues

### 1. Layer Inversions (High Priority)

**Problem**: Services import from providers - this is inverted.

```
providers/upgrade-executor.ts → providers/tree-commands.ts  (wrong)
services/ should NOT import from providers/
```

**Files affected:**
- `providers/tree-commands.ts` contains utility functions (`buildVersionEdit`, `readVersionConstraint`, `findPubspecYaml`, `findPackageLines`) that should be in services
- `providers/adoption-gate.ts` imports `getLatestResults` from `extension-activation.ts`

### 2. Large Multi-Purpose Files (High Priority)

**`tree-items.ts` (~500 lines)**
- Contains 15+ classes
- Contains 10+ builder functions
- Mixes class definitions with formatting logic

**`extension-activation.ts` (~550 lines)**
- Provider instantiation
- Command registration
- Scan orchestration
- Results publishing
- Upgrade planning
- Override analysis
- Navigation commands
- Freshness notification handling

### 3. Configuration Coupling (Medium Priority)

`scan-helpers.ts` mixes configuration reading with scanning logic.

### 4. State Management (Medium Priority)

Module-level variables in `extension-activation.ts` for state - harder to test, implicit dependencies.

---

## Refactoring Plan

### Phase 1: Extract Service Layer Utilities

**Goal**: Eliminate layer inversions by moving utilities to proper locations.

#### 1.1 Create `services/pubspec-editor.ts`

Move from `providers/tree-commands.ts`:
- `buildVersionEdit()`
- `readVersionConstraint()`
- `findPubspecYaml()`
- `findPackageLines()`
- `parsePubspecSections()`

```
Before: providers/tree-commands.ts (commands + utilities mixed)
After:  providers/tree-commands.ts (commands only)
        services/pubspec-editor.ts (pubspec manipulation utilities)
```

#### 1.2 Create `services/config-service.ts`

Extract from `scan-helpers.ts`:
- `readScanConfig()` → `ConfigService.getScanConfig()`
- Typed getters for all settings
- Setting change listeners

```typescript
// services/config-service.ts
export class ConfigService {
    static getScanConfig(): ScanConfig { }
    static getEndOfLifeDiagnostics(): 'none' | 'hint' | 'smart' { }
    static getGithubToken(): string | undefined { }
    // ... etc
}
```

### Phase 2: Split Large Files

#### 2.1 Split `tree-items.ts`

```
Before: providers/tree-items.ts (~500 lines)

After:  providers/tree-item-classes.ts (~200 lines)
          - PackageItem
          - DetailItem
          - GroupItem
          - SuppressedGroupItem
          - OverridesGroupItem
          - OverrideItem
          - DepGraphSummaryItem
        
        providers/tree-item-builders.ts (~300 lines)
          - buildGroupItems()
          - buildVersionGroup()
          - buildUpdateGroup()
          - buildCommunityGroup()
          - buildSizeGroup()
          - buildAlertsGroup()
          - buildDependencyGroup()
          - buildAlternativesGroup()
          - buildOverrideDetails()
          - buildDepGraphSummaryDetails()
```

#### 2.2 Extract from `extension-activation.ts`

```
Before: extension-activation.ts (~550 lines, 8+ responsibilities)

After:  extension-activation.ts (~200 lines, wiring only)
        services/scan-runner.ts (scan orchestration)
        services/upgrade-planner.ts (upgrade planning logic)
        services/override-runner.ts (override analysis orchestration)
        services/notification-handler.ts (freshness notifications)
```

### Phase 3: Dependency Injection for State

#### 3.1 Create `ScanState` class

Replace module-level variables with explicit state container.

```typescript
// services/scan-state.ts
export class ScanState {
    private _results: VibrancyResult[] = [];
    private _isScanning = false;
    private _lastScanTime: Date | null = null;
    
    get results(): readonly VibrancyResult[] { return this._results; }
    get isScanning(): boolean { return this._isScanning; }
    
    updateResults(results: VibrancyResult[]): void { }
    startScan(): void { }
    endScan(): void { }
}
```

#### 3.2 Inject state into providers

```typescript
// Before
import { getLatestResults } from '../extension-activation';

// After
class AdoptionGateProvider {
    constructor(private readonly state: ScanState) { }
    
    provideCodeLenses() {
        const results = this.state.results;
    }
}
```

### Phase 4: Extract Formatting Logic

#### 4.1 Create `scoring/hover-formatter.ts`

Move markdown building from `providers/hover-provider.ts` to pure functions.

```typescript
// scoring/hover-formatter.ts
export function buildHoverContent(result: VibrancyResult): HoverContent {
    return {
        sections: [
            buildScoreSection(result),
            buildUpdateSection(result),
            buildCommunitySection(result),
            // ...
        ]
    };
}
```

#### 4.2 Create `scoring/diagnostic-formatter.ts`

Already mostly done - `buildMessage()` and `computeSeverity()` are in `diagnostics.ts`. Consider moving to scoring layer for consistency.

---

## Implementation Order

| Phase | Task | Effort | Risk | Depends On |
|-------|------|--------|------|------------|
| 1.1 | Extract `pubspec-editor.ts` | Medium | Low | - |
| 1.2 | Create `config-service.ts` | Low | Low | - |
| 2.1 | Split `tree-items.ts` | Medium | Low | - |
| 2.2 | Extract from `extension-activation.ts` | High | Medium | 1.1 |
| 3.1 | Create `ScanState` class | Medium | Medium | - |
| 3.2 | Inject state into providers | Medium | Medium | 3.1, 2.2 |
| 4.1 | Create `hover-formatter.ts` | Low | Low | - |
| 4.2 | Create `diagnostic-formatter.ts` | Low | Low | - |

**Recommended order**: 1.1 → 1.2 → 2.1 → 4.1 → 4.2 → 2.2 → 3.1 → 3.2

---

## Success Criteria

1. **No layer inversions**: `services/` never imports from `providers/`
2. **Single responsibility**: No file > 300 lines with multiple concerns
3. **Testability**: State injectable, formatters pure
4. **Clear boundaries**: Changes to one feature don't touch files for another

## File Changes Summary

### New Files (8)
- `services/pubspec-editor.ts`
- `services/config-service.ts`
- `services/scan-runner.ts`
- `services/upgrade-planner.ts`
- `services/override-runner.ts`
- `services/notification-handler.ts`
- `services/scan-state.ts`
- `providers/tree-item-builders.ts`

### Modified Files (4)
- `providers/tree-commands.ts` - remove utilities
- `providers/tree-items.ts` → rename to `tree-item-classes.ts`
- `extension-activation.ts` - reduce to wiring
- `scan-helpers.ts` - simplify

### Renamed Files (1)
- `providers/tree-items.ts` → `providers/tree-item-classes.ts`

---

## Notes

- Each phase should be a separate commit
- Run full test suite after each phase
- Update imports incrementally
- Consider feature flags for gradual rollout
