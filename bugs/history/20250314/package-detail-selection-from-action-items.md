# Bug fix: Package Details not updating when selecting from Action Items

**Date:** 2025-03-14

## Summary

Selecting a package from the **Problems / Action Items** list (e.g. "mock_data — 30 risk — 1 problem(s)") did not update the Package Details panel; it continued to show "Select a package to see details". Only selections from the main package list (PackageItem) were syncing.

## Cause

The tree selection handler in `extension-activation.ts` only updated the detail view when the selected item had a `result: VibrancyResult` property (PackageItem). Action Items are `InsightItem` nodes with `insight: PackageInsight` (package name + problems), so the handler fell through to `clear()`.

## Change

- **extension-activation.ts**: On selection, if the item has `insight`, resolve the package name via `provider.getResultByName(name)` and call `detailViewProvider.update(result)` when found; otherwise clear.
- **tree-data-provider.ts**: Added `getResultByName(name: string): VibrancyResult | undefined` to look up result by package name for InsightItem-driven sync.

## Related

- Plan: `plans/history/20260312/21-package-detail-view.md` (selection sync now supports both PackageItem and InsightItem).
