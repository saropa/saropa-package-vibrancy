# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**VSCode Marketplace** — [marketplace.visualstudio.com / saropa.saropa-package-vibrancy](https://marketplace.visualstudio.com/items?itemName=saropa.saropa-package-vibrancy)

**Open VSX Registry** — [open-vsx.org / extension / saropa / saropa-package-vibrancy](https://open-vsx.org/extension/saropa/saropa-package-vibrancy)

**Source Code** - [GitHub](https://github.com/saropa/saropa-package-vibrancy)

---

## [Unreleased]

*Upcoming changes; nothing released yet.*

### Fixed

- **Dev dependencies no longer flagged as unused**: Packages in `dev_dependencies` (e.g. `build_runner`, `drift_dev`, `flutter_lints`) are no longer suggested for removal when no imports are found. They are used by tooling (codegen, linters) and typically have no direct imports in source.

---

## [1.0.1]

*Adds a second source for security advisories (GitHub Advisory Database alongside OSV) and keeps the extension’s own dependencies up to date via Dependabot.*

### Added

- **GitHub Advisory Database Integration**: complementary security advisory source alongside OSV; queries GitHub's Security Advisory API for Pub ecosystem packages; results automatically merged and deduplicated with OSV data; configurable via `enableGitHubAdvisory` setting (default: true); uses existing GitHub token for authentication when available
- **Dependabot Configuration**: `.github/dependabot.yml` added to keep npm dev dependencies up to date; weekly schedule with grouped minor/patch updates

---

## [1.0.0]

*Major release: vulnerability scanning with inline diagnostics and tree view, CI pipeline generator, private registry auth, package comparison view, dependency budgets, prerelease version display, custom save tasks, bulk update commands, package details sidebar, and a unified problem model. Plus transitive X-ray, alternative suggestions, override tracking, freshness watch, and many UX and internal improvements.*

### Added

- **Vulnerability Radar**: queries OSV database (Google's open vulnerability DB) for known CVEs affecting dependencies; displays security vulnerabilities inline as diagnostics with severity-mapped squiggles (Error/Warning/Info/Hint); shows vulnerability count and worst severity in hover tooltips; adds 🛡️ Security group in tree view with clickable advisory links; adds "Vulns" column to report table with severity indicator; configurable via `enableVulnScan` (default: true) and `vulnSeverityThreshold` (default: "low") settings; batch endpoint for efficient single HTTP call; results cached per package@version
- **CI Pipeline Generator**: one command generates a ready-to-commit CI workflow (GitHub Actions, GitLab CI, or portable shell script) that checks dependency health on every PR; auto-suggests thresholds based on current scan results (max EOL, max legacy-locked, min average vibrancy, fail on vulnerability); threshold customization wizard; file overwrite protection; templates include Flutter setup, pub outdated JSON parsing, artifact upload, and PR comment with health summary table
- **Private Registry Authentication**: support for private Pub servers (self-hosted pub_server, Cloudsmith, Artifactory, JFrog); securely store auth tokens in VS Code's SecretStorage; auto-detect hosted URLs from pubspec.yaml; three new commands: "Add Registry Authentication" (3-step wizard), "Remove Registry Authentication", "List Configured Registries"; HTTPS enforced for security; tokens never logged or synced
- **Package Comparison View**: compare 2-3 packages side-by-side in a responsive webview table; entry points via Command Palette ("Saropa: Compare Packages") or multi-select in tree view; shows vibrancy score, category, version, publisher, pub points, GitHub stars, issues, archive size, bloat rating, license, and platforms; highlights "winner" per dimension in green; generates recommendation text based on overall performance; "Add to Project" button for external packages; works with both scanned packages and pub.dev lookups
- **Dependency Budget**: define project-level health policy with configurable limits for total dependencies, archive size, minimum average vibrancy, max end-of-life packages, max legacy-locked packages, and max unused dependencies; visual gauge in sidebar tree view (📊 Budget group at top); diagnostics at line 0 of pubspec.yaml when budgets are exceeded; status classification (under/warning/exceeded) with 80% threshold for warnings; configure via `budget.*` settings (all null/unlimited by default)
- **Prerelease Version Display**: show prerelease versions (dev, beta, rc, alpha) alongside stable versions; toggle visibility via `showPrereleases` setting or commands; filter by specific tags (e.g., only show beta/rc) via `prereleaseTagFilter` setting; 🧪 indicator in CodeLens, hover tooltips, and tree view; click to update with confirmation warning about potential breaking changes
- **Custom Save Tasks**: automatically run `flutter pub get` or any custom command when pubspec.yaml is saved with dependency changes; configure via `onSaveChanges` setting (shell command or `task:TaskName` for VS Code tasks); `onSaveChangesDetection` setting controls whether to run on any save or only when dependencies change; status bar shows spinning indicator during execution with success/error feedback; debounces rapid saves (300ms)
- **Bulk Update Commands**: four new commands to update all dependencies at once—"Update All (Latest)" updates everything, "Update All (Major)" applies only major version bumps, "Update All (Minor)" applies minor or major bumps, "Update All (Patch)" applies only patch bumps; accessible from Command Palette and tree view title menu; shows confirmation dialog with preview of changes; respects suppressed and allowlisted packages; optionally disable confirmation via `bulkUpdateConfirmation` setting
- **Package Details sidebar view**: selection-synced webview below the tree view showing full package information—version, score, category, suggestions, alerts, community stats, platforms, and links; collapsible sections with smooth transitions; action buttons for upgrade and changelog; placeholder state when no package selected
- **Vibrancy Details output channel**: dedicated output channel for searchable/persistent package logs; "Log to Output" context menu on tree items; "Log All Package Details" command for full scan dump with timestamps and formatted sections
- **Click-to-update CodeLens**: CodeLens now shows separate clickable elements—click the status badge to focus the package in the tree view, click the version arrow (→ 2.0.0) to immediately update pubspec.yaml; instant feedback with success notification
- **Sort Dependencies command**: alphabetically sort entries in dependencies, dev_dependencies, and dependency_overrides sections; SDK packages (flutter, flutter_test) optionally kept at top; accessible from Command Palette, tree view menu, and editor context menu
- **CodeLens toggle**: show/hide vibrancy badges instantly via commands or status bar; click status bar indicator to toggle; editor title button when viewing pubspec.yaml; session-level override of setting
- **Customizable status indicators**: configure emoji/text for each status category via `indicators` setting; choose display style (emoji/text/both/none) via `indicatorStyle` setting; preset options for accessibility and minimal displays
- **Suppress from Problems panel**: code actions now include "Suppress [package] diagnostics" for every vibrancy diagnostic, allowing quick suppression directly from the Problems panel or lightbulb menu
- **Bulk suppression commands**: new commands "Suppress by Category..." (end-of-life, legacy-locked, quiet, or blocked packages) and "Suppress All Unhealthy Packages" accessible from tree view toolbar; "Unsuppress All Packages" to reset
- **Action Items Consolidator**: cross-references all feature signals (vibrancy score, overrides, transitives, family conflicts, unused deps, blockers) into a unified "Action Items" view at the top of the tree; ranks packages by combined risk score; suggests specific actions ("Remove this package", "Upgrade blocker first", "Upgrade all Firebase packages together"); shows what gets unblocked when a problem is fixed; surfaces in tree view, hover tooltips, and status bar
- Transitive risk now penalizes vibrancy score: packages with EOL/discontinued transitives or >20 transitive deps receive score penalties
- Freshness watch notifications now include blocker info: "http 1.3.0 available [blocked by meta]"
- Unused packages no longer show alternative suggestions (removal is the better action)
- Upgrade sequencer now shows which overrides may become stale after an upgrade
- Transitive Dependency X-Ray: parses full dependency graph via `dart pub deps --json`, counts transitive dependencies per direct package, identifies shared transitives (single points of failure), flags risky transitives (discontinued/EOL), surfaces dependency graph summary at top of tree view, adds transitive count to hover tooltips and report table
- Alternative Package Suggestions: for packages scoring below 40 (Legacy-Locked/End-of-Life), automatically suggests healthier alternatives by searching pub.dev for packages with matching topics; curated replacements from known_issues.json shown as "Recommended", discovery suggestions shown as "Similar"; displayed in tree view Alternatives group, hover tooltips, and quick-fix code actions
- Smart dependency_overrides Tracker: parses overrides section, detects stale overrides (no longer needed), tracks override age via git history, surfaces in tree view as collapsible group, adds inline diagnostics with severity levels, and provides quick-fix to remove stale overrides
- Dependency Freshness Watch: background polling for new package versions with configurable interval (1-24 hours), filter modes (all/unhealthy/custom), and VS Code toast notifications with one-click actions
- Decorative section headers: optional ornamental comment blocks above major pubspec sections (dependencies, dev_dependencies, dependency_overrides, flutter, flutter_launcher_icons, flutter_native_splash) and sub-sections (assets, fonts within flutter)
- Override marker: auto-inserts "DEP OVERRIDDEN BELOW" header above the first dependency that has a corresponding override
- Tree view section grouping: optional grouping by pubspec section (dependencies, dev_dependencies, transitive) via `treeGrouping` setting
- Section tracking: `DependencySection` type tracks which pubspec section each package belongs to

### Improved

- Smarter annotation detection: recognizes URL suffixes like `/changelog`, removes ALL duplicate annotations scattered in comments, preserves user comments (NOTE:, TODO:, FIXME:, Because, etc.)

### Fixed

- Packages without GitHub repositories no longer falsely classified as "end-of-life"; publish recency now contributes to engagement score even when GitHub data is unavailable

### Changed

- End-of-life diagnostic severity now configurable via `endOfLifeDiagnostics` setting (none/hint/smart); defaults to "none" to avoid warning fatigue for unfixable issues; changed message from "Replace" to "Deprecated:" when no replacement is known

### Internal

- **Unified Problem Model**: new `src/problems/` module with `ProblemRegistry` class for centralized problem storage, deduplication, linking, and priority scoring; type-safe Problem union with 9 specific interfaces (UnhealthyPackageProblem, VulnerabilityProblem, etc.); `SuggestedAction` system for action determination and resolution chain tracking; `ProblemTreeProvider` for problem-centric sidebar view; comprehensive test coverage in `src/test/problems/`
- Extracted pubspec editing utilities to `services/pubspec-editor.ts` to fix layer violation (services importing from providers)
- Created centralized `services/config-service.ts` for typed access to all extension settings
- Split `tree-items.ts` (579 lines) into `tree-item-classes.ts` and `tree-item-builders.ts` for better maintainability
- Extracted `override-runner.ts` from `extension-activation.ts`
- Improved modularity: clear separation between providers (UI), services (data), and scoring (pure logic)

---

## [0.1.3]

*Unused dependency detection, CodeLens vibrancy badges on each dependency line, SPDX license display, dependency drift timeline, package family conflict detection (e.g. Firebase/Riverpod/Bloc), and an “Annotate Dependencies” command. Fixes for “Update available” when already on latest and sidebar icon.*

### Added

- Unused dependency detection: scans lib/, bin/, and test/ for imports and flags dependencies with no matching imports
- CodeLens vibrancy badges above each dependency line in pubspec.yaml with clickable score and update segments
- SPDX license display in tree view, hover tooltips, and reports
- Dependency drift timeline showing version history relative to Flutter stable releases
- Package family conflict detection: warns when Firebase/Riverpod/Bloc packages are on incompatible major versions
- License and health metric fields in known issues database
- Clickable URLs in tree view detail items via openUrl command
- Annotate Dependencies command: adds pub.dev description and URL comments above each dependency in pubspec.yaml

### Fixed

- No longer shows "Update available" when the version constraint already covers the latest version
- Sidebar icon star shape and watch task problem matcher

### Changed

- Enriched About panel with full company profile, consumer apps, developer ecosystem, social links, and company details from ABOUT_SAROPA.md
- Tree view packages now expand into logical groups (Version, Update, Community, Size, Alerts) with colored emoji indicators for update severity and bloat rating

---

## [0.1.2]

*About panel (version, Marketplace, GitHub), extension version in the sidebar header, and redesigned Saropa-family icons for the extension and sidebar.*

### Added

- About panel with version number, Marketplace link, and GitHub link (info icon in sidebar header)
- Extension version displayed in sidebar tree view header

### Changed

- Redesigned extension and sidebar icons to match Saropa family style (cream background, gem hexagon, centered pulse line, status pills)

---

## [0.1.1]

*Flagged-issues detection from GitHub, suppress-by-package, upgrade-and-test with rollback, report export (Markdown/JSON), retry/backoff for APIs, and a larger known-issues database. Diagnostic wording and severity tuned for the Problems panel.*

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

*Initial release: outdated dependency detection, vibrancy scoring (Vibrant / Quiet / Legacy-Locked / End of Life), tree view and webview report, inline diagnostics and hover tooltips, quick-fix code actions, status bar, and Pub.dev + GitHub API integration with caching.*

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
