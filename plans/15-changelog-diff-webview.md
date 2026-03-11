# Plan: Changelog Diff Webview

## Problem

The existing hover tooltip shows up to 5 truncated changelog entries. The
tree view shows 3 entries with 60-char previews. When deciding whether to
upgrade — especially a major version — developers need the *full* changelog
between their version and latest, with breaking changes and migration
instructions highlighted. Currently they leave VS Code and read changelogs
on GitHub manually.

## Goal

A dedicated webview panel showing the complete, searchable, formatted
changelog between the installed version and latest — with breaking changes
highlighted, deprecation notices flagged, and migration instructions
extracted and grouped.

## How It Works

### Step 1: Fetch Full Changelog

Reuse the existing `changelog-service.ts` but request a higher entry limit
(current max is 20). For this feature, fetch up to 50 entries to cover major
version jumps.

If the changelog is from GitHub releases API, fetch all releases between the
two versions. If scraped from pub.dev CHANGELOG.md, parse the full document.

### Step 2: Filter to Relevant Range

Only show entries between the installed version and the latest version
(inclusive). Skip entries for versions the user has already passed.

### Step 3: Annotate Entries

Scan each entry body for markers:

- **BREAKING CHANGE** / **Breaking:** — highlight in red
- **Deprecated** / **Deprecation:** — highlight in yellow
- **Migration:** / **How to migrate** — highlight in blue
- **Fix** / **Bug fix** — highlight in green

Use regex to detect these markers, then wrap them in styled `<span>` tags
in the HTML output.

### Step 4: Render Webview

HTML panel with:
- Header: package name, version range (current → latest), entry count
- Search/filter bar (client-side JavaScript)
- Each entry: version heading, date, annotated body with syntax highlighting
  for inline code blocks
- Collapsible sections per version
- Sticky summary bar: "3 breaking changes, 2 deprecations, 5 fixes"

## UI: Entry Points

Multiple ways to open the changelog diff:

1. **Tree view**: Right-click a package → "View Full Changelog"
2. **CodeLens**: Click the update segment of the CodeLens badge
3. **Hover**: "View full changelog" link at bottom of changelog section
4. **Command palette**: `Saropa: View Changelog Diff` → quick-pick package

## Changes

### New File: `src/views/changelog-diff-html.ts`

- `buildChangelogDiffHtml(params): string` — HTML template
- Accepts package name, version range, annotated entries
- Includes search bar JavaScript and collapsible sections

### New File: `src/views/changelog-diff-webview.ts`

- `ChangelogDiffPanel` class — manages webview lifecycle
- `createOrShow(packageName, currentVersion, entries)` — static factory
- Same pattern as `report-webview.ts`

### New File: `src/scoring/changelog-annotator.ts`

- `annotateChangelog(entries: ChangelogEntry[]): AnnotatedEntry[]`
  — pure function
- Scans for breaking/deprecation/migration/fix markers
- Returns entries with marker metadata

### New Types in `src/types.ts`

```typescript
interface ChangelogAnnotation {
  readonly type: 'breaking' | 'deprecation' | 'migration' | 'fix';
  readonly text: string;
  readonly lineIndex: number;
}

interface AnnotatedChangelogEntry {
  readonly version: string;
  readonly date: string | null;
  readonly body: string;
  readonly annotations: readonly ChangelogAnnotation[];
}
```

### Modified: `src/services/changelog-service.ts`

- Add an optional `maxEntries` parameter (default 20, allow up to 50)
- Add a `fetchFullChangelog()` variant that fetches all entries between
  two versions

### Modified: `src/providers/tree-commands.ts`

- Add `saropaPackageVibrancy.viewChangelog` command
- Opens the changelog diff panel for the selected package

### Modified: `src/providers/hover-provider.ts`

- Add clickable "View full changelog" command link in changelog section

### Modified: `package.json`

- Add command: `saropaPackageVibrancy.viewChangelog` / "View Full Changelog"
- Add to tree view context menu for updatable packages

### Tests

- `src/test/scoring/changelog-annotator.test.ts` — annotation detection:
  BREAKING CHANGE in various formats, deprecation notices, migration
  instructions, entries with no markers, mixed markers
- `src/test/views/changelog-diff-html.test.ts` — HTML output: search bar
  present, entries rendered, annotations styled, empty changelog

## Out of Scope

- Comparing changelogs across alternative packages
- Auto-generating migration code from changelog instructions
- Fetching changelogs for packages not in the project
