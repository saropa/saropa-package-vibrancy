# Review: Known-issue “replacement” semantics

## Problem

The `replacement` field in `known_issues.json` is used for **two different semantics**, but all consumers treat it as **one**: a package name to “replace with.”

| Semantics | Examples | Intended meaning |
|-----------|----------|-------------------|
| **Alternative package** | `dio`, `path_provider`, `flutter_secure_storage` | Use this other pub package instead. |
| **Instruction / freeform** | `Update to v9+`, `Update to latest version`, `Use Native Channels`, `Native \`showDialog\`` | Advice only; not a package name. |

When `replacement` is an instruction, the UI is wrong or broken:

- **Diagnostics**: “Replace flutter_secure_storage with Update to v9+” — wrong wording; for v10 users the advice is wrong.
- **Code action**: “Replace with Update to v9+” runs `edit.replace(range, "Update to v9+")` and **overwrites the package name** in `pubspec.yaml` with that string → invalid YAML and broken dependency.
- **CodeLens / tree / detail view**: “Replace with Update to v9+” or “Consider migrating to Update to v9+” — misleading and nonsensical.
- **Suggested action**: “Consider replacing with Update to v9+” — wrong for v10; “replacing with” is the wrong verb for an in-place upgrade.

So the behaviour is inconsistent and, for instruction-style replacements, **fundamentally broken** (code action can corrupt the pubspec).

## Affected code

| Location | Current behaviour | Required behaviour |
|----------|-------------------|---------------------|
| `providers/diagnostics.ts` | `Replace ${name} with ${replacement}` whenever replacement is set | Use “Replace with X” only when replacement is a package name; otherwise e.g. “Deprecated: X — {replacement}”. |
| `providers/code-action-provider.ts` | Adds “Replace with X” and replaces range with `issue.replacement` | Add that action only when replacement is a **package name**. Never replace with an instruction string. |
| `scoring/codelens-formatter.ts` | “Replace with ${replacement}” | “Replace with X” only for package name; for instruction use “Consider: X” or “Known issue”. |
| `providers/codelens-provider.ts` | Same as above (uses formatter). | Same. |
| `views/detail-view-html.ts` | “Consider migrating to ${replacement}” | “Consider migrating to X” only for package; “Consider: X” for instruction. |
| `services/detail-logger.ts` | Same as detail-view. | Same. |
| `scan-orchestrator.ts` | Uses replacement as curated alternative; we already suppress “Update to v9+” for v10+. | Do not add instruction-style replacements to alternatives at all (so “Consider replacing with Update to v9+” never appears). |
| `problems/problem-actions.ts` | “Consider replacing with ${alternatives[0]}” | No change if we stop putting instructions in alternatives. |
| `scoring/consolidate-insights.ts` | Uses result.alternatives[0] for action text | No change. |
| `views/known_issues_html.ts` | Shows replacement as text; no pub.dev link for freeform. | Keep as-is. |

## Model

- **Package name**: string that is a valid pub package name (e.g. `[a-z0-9_]+`). Safe to use in “Replace with X” and as the target of a code action that edits the dependency name.
- **Instruction / freeform**: anything else (e.g. “Update to v9+”, “Update to latest version”, “Use Native Channels”). Must never be used as the target of a replace-in-pubspec code action; may be shown as advice only (e.g. “Consider: Update to v9+”).

## Implementation

1. **Single predicate** (e.g. in `scoring/known-issues.ts`):  
   `isReplacementPackageName(replacement: string): boolean`  
   True only when `replacement` looks like a pub package name (e.g. `/^[a-z0-9_]+$/.test(replacement)`).

2. **Alternatives**: When building alternatives from `knownIssue.replacement`, only use it as the curated alternative when `isReplacementPackageName(replacement)`. Otherwise treat as “no curated replacement” (discovery only or empty). Version-based suppression for “Update to vN+” (e.g. v10 vs v9) stays in scan-orchestrator.

3. **Diagnostics / CodeLens / detail view / detail-logger / code-action-provider**: Branch on `isReplacementPackageName(replacement)` and use the appropriate message or action as in the table above.

4. **Code action**: Only add the “Replace with X” quick fix when `isReplacementPackageName(issue.replacement)` so we never write an instruction string into the pubspec.

This keeps the data format unchanged and fixes the broken behaviour and wording everywhere.

---

**Implementation completed.** Single predicate `isReplacementPackageName()` in `scoring/known-issues.ts`; all consumers (diagnostics, code actions, CodeLens, detail view, detail logger, scan-orchestrator) branch on it. Unit tests cover package-name vs instruction-style replacement in known-issues, diagnostics, code-action-provider, and codelens-formatter.
