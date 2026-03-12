# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**VSCode Marketplace** — [Saropa Package Vibrancy](https://marketplace.visualstudio.com/items?itemName=saropa.saropa-package-vibrancy)

**Source Code** - [GitHub](https://github.com/saropa/saropa-package-vibrancy)

## [0.1.3]

### Added

- **Action Items Consolidator**: cross-references all feature signals (vibrancy score, overrides, transitives, family conflicts, unused deps, blockers) into a unified "Action Items" view at the top of the tree; ranks packages by combined risk score; suggests specific actions ("Remove this package", "Upgrade blocker first", "Upgrade all Firebase packages together"); shows what gets unblocked when a problem is fixed; surfaces in tree view, hover tooltips, and status bar
- Transitive risk now penalizes vibrancy score: packages with EOL/discontinued transitives or >20 transitive deps receive score penalties
- Freshness watch notifications now include blocker info: "http 1.3.0 available [blocked by meta]"
- Unused packages no longer show alternative suggestions (removal is the better action)
- Upgrade sequencer now shows which overrides may become stale after an upgrade
- Transitive Dependency X-Ray: parses full dependency graph via `dart pub deps --json`, counts transitive dependencies per direct package, identifies shared transitives (single points of failure), flags risky transitives (discontinued/EOL), surfaces dependency graph summary at top of tree view, adds transitive count to hover tooltips and report table
- Alternative Package Suggestions: for packages scoring below 40 (Legacy-Locked/End-of-Life), automatically suggests healthier alternatives by searching pub.dev for packages with matching topics; curated replacements from known_issues.json shown as "Recommended", discovery suggestions shown as "Similar"; displayed in tree view Alternatives group, hover tooltips, and quick-fix code actions
- Smart dependency_overrides Tracker: parses overrides section, detects stale overrides (no longer needed), tracks override age via git history, surfaces in tree view as collapsible group, adds inline diagnostics with severity levels, and provides quick-fix to remove stale overrides
- Dependency Freshness Watch: background polling for new package versions with configurable interval (1-24 hours), filter modes (all/unhealthy/custom), and VS Code toast notifications with one-click actions
- Unused dependency detection: scans lib/, bin/, and test/ for imports and flags dependencies with no matching imports
- CodeLens vibrancy badges above each dependency line in pubspec.yaml with clickable score and update segments
- SPDX license display in tree view, hover tooltips, and reports
- Dependency drift timeline showing version history relative to Flutter stable releases
- Package family conflict detection: warns when Firebase/Riverpod/Bloc packages are on incompatible major versions
- License and health metric fields in known issues database
- Clickable URLs in tree view detail items via openUrl command
- Annotate Dependencies command: adds pub.dev description and URL comments above each dependency in pubspec.yaml
- Decorative section headers: optional ornamental comment blocks above major pubspec sections (dependencies, dev_dependencies, dependency_overrides, flutter, flutter_launcher_icons, flutter_native_splash) and sub-sections (assets, fonts within flutter)
- Override marker: auto-inserts "DEP OVERRIDDEN BELOW" header above the first dependency that has a corresponding override
- Tree view section grouping: optional grouping by pubspec section (dependencies, dev_dependencies, transitive) via `treeGrouping` setting
- Section tracking: `DependencySection` type tracks which pubspec section each package belongs to

### Improved

- Smarter annotation detection: recognizes URL suffixes like `/changelog`, removes ALL duplicate annotations scattered in comments, preserves user comments (NOTE:, TODO:, FIXME:, Because, etc.)

### Fixed

- No longer shows "Update available" when the version constraint already covers the latest version
- Sidebar icon star shape and watch task problem matcher

### Changed

- Enriched About panel with full company profile, consumer apps, developer ecosystem, social links, and company details from ABOUT_SAROPA.md
- Tree view packages now expand into logical groups (Version, Update, Community, Size, Alerts) with colored emoji indicators for update severity and bloat rating
- End-of-life diagnostic severity now configurable via `endOfLifeDiagnostics` setting (none/hint/smart); defaults to "none" to avoid warning fatigue for unfixable issues; changed message from "Replace" to "Deprecated:" when no replacement is known

### Internal

- Extracted pubspec editing utilities to `services/pubspec-editor.ts` to fix layer violation (services importing from providers)
- Created centralized `services/config-service.ts` for typed access to all extension settings
- Improved modularity: clear separation between providers (UI), services (data), and scoring (pure logic)

---

## [0.1.2]

### Added

- About panel with version number, Marketplace link, and GitHub link (info icon in sidebar header)
- Extension version displayed in sidebar tree view header

### Changed

- Redesigned extension and sidebar icons to match Saropa family style (cream background, gem hexagon, centered pulse line, status pills)

---

## [0.1.1]

### Added

- Flagged issues detection: scans open GitHub issues for high-signal keywords (deprecated, obsolete, breaking change, build failure, null safety, etc.) and surfaces them in hover tooltips, tree view, and diagnostics
- Scoring penalty for flagged issues (5–15 points based on count)
- Pub.dev-inspired gem icon for sidebar activity bar and marketplace listing
- Copy as JSON context menu action on tree view package nodes
- Expanded known issues database to 472 entries covering top 100 Flutter packages (active, maintenance, freemium, commercial statuses)
- Tree view click-to-navigate: clicking a package opens its line in pubspec.yaml; context menu to open on pub.dev and update to latest version
- Suppress package: right-click any package to suppress it from diagnostics and hover; suppressed packages appear dimmed in a collapsible "Suppressed" group at the bottom of the tree view
- Upgrade-and-test command: upgrades a dependency, runs flutter test, and auto-rolls back if tests fail
- Export vibrancy report as timestamped Markdown and JSON files to a report/ directory
- Retry with exponential backoff for API calls (handles 429 rate-limits and 5xx errors)
- Pub.dev changelog fallback when GitHub API is unavailable
- Publish pipeline reports known issues summary: entry counts by status, duplicate check, oldest as_of date

### Fixed

- Stable packages with low GitHub activity but recent pub.dev publishes no longer falsely classified as End of Life
- Known issues loader normalizes "N/A" and empty strings as unset values

### Changed

- Diagnostic messages now lead with actionable verbs (Replace, Review, Monitor) instead of category labels
- Vibrancy score shown as 0–10 scale instead of decimal out of 100
- Severity downgraded: end-of-life is now Warning (was Error), legacy-locked is Information, quiet is Hint
- Package name included in all diagnostic messages for readability in the Problems panel

---

## [0.1.0]

### Added

- Pub update check: detects outdated dependencies by comparing current vs latest versions
- Changelog fetching from GitHub (with monorepo subpath support) and parsing
- Update indicators in tree view, hover tooltips, diagnostics, report, and status bar
- Report "Updates" summary card and sortable "Update" column with severity coloring
- Tree view sidebar showing package vibrancy scores, sorted worst-first
- Diagnostics (error/warning/info squiggles) in pubspec.yaml
- Quick-fix code actions for known-bad packages with replacements
- Hover tooltips with score, category, dates, stars, and pub.dev links
- Status bar showing overall project vibrancy score
- Webview report dashboard with sortable table and category breakdown
- Pub.dev API integration (package info + scores)
- GitHub API integration (issues, PRs, stars)
- 24-hour response caching via VS Code globalState
- 100 bundled known-bad packages database
- Vibrancy scoring: V = (0.5 _ Resolution) + (0.4 _ Engagement) + (0.1 \* Popularity)
- Four categories: Vibrant, Quiet, Legacy-Locked, End of Life
- Auto-scan on workspace open (configurable)
- File watcher re-scans on pubspec.lock changes
- GitHub PAT support for increased rate limits
- Option to include dev_dependencies in scan
