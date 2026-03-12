# Plan: Tree View Section Grouping

## Problem

The tree view shows all packages in a flat list sorted by vibrancy score.
For large projects, developers may want to see packages organized by their
pubspec section (dependencies vs dev_dependencies) to understand which
are production-critical vs development-only.

## Goal

Add optional grouping of packages in the tree view by pubspec section:

1. **Section tracking**: Track which section each dependency comes from
2. **Grouping mode**: Toggle between flat (score-sorted) and grouped views
3. **Transitive group**: Show transitive dependencies in their own group

## How It Works

### Section Tracking

Each parsed dependency includes its source section:

```typescript
type DependencySection = 'dependencies' | 'dev_dependencies' | 'transitive';

interface ParsedPackage {
  name: string;
  section: DependencySection;
  // ...
}
```

### Tree View Modes

**Flat mode** (default): All packages sorted by vibrancy score, worst first.

**Section mode**: Packages grouped under collapsible headers:

```
📦 Dependencies (12)
  ├─ http — 74 Vibrant
  ├─ provider — 68 Quiet
  └─ ...

🧪 Dev Dependencies (8)
  ├─ mockito — 82 Vibrant
  └─ ...

🔗 Transitive (45)
  └─ (optional, if enabled)
```

### Configuration

```json
{
  "saropaPackageVibrancy.treeGrouping": {
    "type": "string",
    "enum": ["none", "section"],
    "default": "none",
    "enumDescriptions": [
      "Flat list sorted by vibrancy score (worst first)",
      "Group by pubspec section (dependencies, dev_dependencies)"
    ]
  }
}
```

## Changes

### New Type: `src/types.ts`

```typescript
export type DependencySection = 'dependencies' | 'dev_dependencies' | 'transitive';
```

### Modified: `src/services/pubspec-parser.ts`

Track section when parsing:

```typescript
function parsePubspecYaml(content: string): ParsedPackage[] {
  // Track current section while parsing
  let currentSection: DependencySection = 'dependencies';
  // ...
}
```

### Modified: `src/providers/tree-data-provider.ts`

Add grouping logic:

```typescript
getChildren(element?: TreeItem): TreeItem[] {
  const grouping = this.getGroupingSetting();
  
  if (grouping === 'section') {
    return this.buildSectionGroups();
  }
  return this.buildFlatList();
}

buildSectionGroups(): TreeItem[] {
  const deps = this.results.filter(r => r.package.section === 'dependencies');
  const devDeps = this.results.filter(r => r.package.section === 'dev_dependencies');
  
  return [
    new SectionGroupItem('Dependencies', deps),
    new SectionGroupItem('Dev Dependencies', devDeps),
  ];
}
```

### New Class: `src/providers/tree-item-classes.ts`

```typescript
export class SectionGroupItem extends vscode.TreeItem {
  constructor(
    public readonly sectionName: string,
    public readonly packages: VibrancyResult[],
  ) {
    super(sectionName, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `(${packages.length})`;
    this.iconPath = this.getIcon();
  }
}
```

### Modified: `package.json`

Add `treeGrouping` setting (see Configuration above).

### Tests

- `src/test/providers/tree-data-provider.test.ts`:
  - Flat mode returns all packages sorted by score
  - Section mode returns group items
  - Groups contain correct packages
  - Section labels show correct counts
  - Responds to setting changes

## Out of Scope

- Grouping by category (vibrant/quiet/legacy/EOL)
- Custom grouping rules
- Drag-and-drop reordering
- Persistent collapse state across sessions
