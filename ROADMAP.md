# Feature Roadmap

Planned features sorted by effort vs wow factor.

## Rating Scale

| Effort | Meaning                 | Wow     | Meaning                         |
| ------ | ----------------------- | ------- | ------------------------------- |
| **S**  | 1–2 days, mostly wiring | ⭐      | Nice-to-have, expected feature  |
| **M**  | 3–5 days, new logic     | ⭐⭐    | Impressive, clear differentiator |
| **L**  | 1–2 weeks, new systems  | ⭐⭐⭐  | Jaw-drop, nobody else does this |
| **XL** | 2+ weeks, multi-system  |         |                                 |

---

## M effort / ⭐ wow — Solid Additions

| Feature | What | Plan |
|---------|------|------|
| **Changelog Diff Webview** | Full searchable changelog between pinned and latest. BREAKING markers in red, migration instructions in blue. | [plan](plans/15-changelog-diff-webview.md) |

---

## XL effort / ⭐⭐⭐ wow — Moonshots

| Feature | What | Plan |
|---------|------|------|
| **Pre-Flight SDK Upgrade Simulator** | "What breaks if I upgrade to Flutter 3.29?" Simulates upgrade, cross-references with vibrancy data, shows before/after risk report. **Partial:** `flutter-releases.ts`, `pub-outdated.ts` exist. | [plan](plans/02-preflight-sdk-upgrade-simulator.md) |

---

## Other Plans (Unscheduled)

| Plan | Feature | Notes |
|------|---------|-------|
| 06 | Platform Support Matrix | — |
| 07 | Dependency Impact Score | — |
| 22 | Modularity Refactoring | Internal cleanup |
| 24 | Feature Graph Events | Internal |

---

## Shared Infrastructure

| File | Used By | Status |
|------|---------|--------|
| `pub-outdated.ts` | 02 | ✅ Built |
| `flutter-releases.ts` | 02 | ✅ Built |

---

## Completed Features

See `plans/history/` for implementation details.
