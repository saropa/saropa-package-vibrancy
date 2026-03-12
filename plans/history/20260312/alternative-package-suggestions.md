# Plan: Alternative Package Suggestions

**Status: IMPLEMENTED** (2026-03-12)

## Goal

When a package scores poorly, suggest healthier alternatives that serve the
same purpose — beyond the manually curated `replacement` field in
`known_issues.json`.

## What Already Exists

`known_issues.json` provides a `replacement` field for ~10 curated End-of-Life
packages. This covers a tiny fraction of the ecosystem and requires manual
maintenance.

## What This Adds

A broader, automated suggestion system with two tiers:

1. **Curated tier** (existing): `known_issues.json` replacements — high
   confidence, shown as "Recommended replacement."
2. **Discovery tier** (new): Query pub.dev search API for packages with
   overlapping topics/keywords — lower confidence, shown as "Consider also."

## How It Works

### Discovery Tier Logic

1. Fetch the target package's `pubspec.topics` from the pub.dev API (topics
   are the new pub.dev categorization system, e.g. `["networking", "http"]`).
2. If topics exist, search pub.dev for packages sharing the same topics,
   sorted by popularity.
3. Filter results: exclude the package itself, exclude packages already in the
   project's `pubspec.yaml`, exclude packages with vibrancy score < 50.
4. Return top 3 suggestions with name, score, and like count.
5. If the package has no topics, skip discovery (don't guess).

### When to Show Suggestions

- Only for packages scoring below **40** (Legacy-Locked or End-of-Life)
- Curated replacement always shown if available (any score)
- Discovery suggestions only shown if no curated replacement exists

## Changes

### New File: `src/services/pub-dev-search.ts`

- `searchAlternatives(topics: string[], exclude: string[]): Promise<Alternative[]>`
  - Calls `https://pub.dev/api/search?q=topic:<topic>&sort=popularity`
  - Filters and ranks results
  - Cached with same TTL as other pub.dev calls

### New Type in `src/types.ts`

```typescript
interface AlternativeSuggestion {
  readonly name: string;
  readonly source: 'curated' | 'discovery';
  readonly score: number | null;
  readonly likes: number;
}
```

- Add `readonly alternatives: readonly AlternativeSuggestion[]` to
  `VibrancyResult`

### Modified: `src/services/pub-dev-api.ts`

- Extract `topics` array from `latest.pubspec.topics` in `fetchPackageInfo()`
- Add `readonly topics: readonly string[]` to `PubDevPackageInfo`

### Modified: `src/scan-orchestrator.ts`

- After scoring, if score < 40 and no curated replacement, call
  `searchAlternatives()` with the package's topics

### Modified: `src/providers/tree-items.ts`

- New group `💡 Alternatives` in `buildGroupItems()` when alternatives exist
- Show source badge: "Recommended" (curated) vs "Similar" (discovery)

### Modified: `src/providers/hover-provider.ts`

- Append alternatives section to hover markdown

### Modified: `src/providers/code-action-provider.ts`

- Existing quick-fix uses curated replacement — extend to also offer
  discovery suggestions as additional code actions (lower priority)

### Tests

- `src/test/services/pub-dev-search.test.ts` — mock pub.dev search responses,
  filtering logic, empty topics, exclusion
- `src/test/scoring/alternatives.test.ts` — threshold logic, curated vs
  discovery priority

## Out of Scope

- API compatibility analysis between original and alternative
- Auto-migration from one package to another
- Suggesting alternatives for "Quiet" packages (only Legacy/EOL for now)
