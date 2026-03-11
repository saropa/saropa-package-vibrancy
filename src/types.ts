/** Status categories for package vibrancy. */
export type VibrancyCategory = 'vibrant' | 'quiet' | 'legacy-locked' | 'end-of-life';

/** A dependency extracted from pubspec.lock. */
export interface PackageDependency {
    readonly name: string;
    /** Resolved version from pubspec.lock (e.g. "3.0.7"). */
    readonly version: string;
    /** Version constraint from pubspec.yaml (e.g. "^3.0.3"). */
    readonly constraint: string;
    readonly source: string;
    readonly isDirect: boolean;
}

/** Pub.dev metadata for a package. */
export interface PubDevPackageInfo {
    readonly name: string;
    readonly latestVersion: string;
    readonly publishedDate: string;
    readonly repositoryUrl: string | null;
    readonly isDiscontinued: boolean;
    readonly isUnlisted: boolean;
    readonly pubPoints: number;
    readonly publisher: string | null;
    readonly license: string | null;
    readonly description: string | null;
}

/** A GitHub issue flagged as high-signal for compatibility/deprecation. */
export interface FlaggedIssue {
    readonly number: number;
    readonly title: string;
    readonly url: string;
    readonly matchedSignals: readonly string[];
    readonly commentCount: number;
}

/** GitHub repository metrics. */
export interface GitHubMetrics {
    readonly stars: number;
    readonly openIssues: number;
    readonly closedIssuesLast90d: number;
    readonly mergedPrsLast90d: number;
    readonly avgCommentsPerIssue: number;
    readonly daysSinceLastUpdate: number;
    readonly daysSinceLastClose: number;
    readonly flaggedIssues: readonly FlaggedIssue[];
}

/** Known issue entry from bundled JSON. */
export interface KnownIssue {
    readonly name: string;
    readonly status: string;
    readonly reason?: string;
    readonly as_of?: string;
    readonly replacement?: string;
    readonly migrationNotes?: string;
    readonly archiveSizeBytes?: number;
    readonly archiveSizeMB?: number;
    readonly license?: string;
    readonly lastUpdated?: string;
    readonly pubPoints?: number;
    readonly wasmReady?: boolean;
    readonly verifiedPublisher?: boolean;
    readonly platforms?: readonly string[];
}

/** Live metrics from pub.dev /metrics endpoint. Null wasmReady = API failed. */
export interface PubDevMetrics {
    readonly pubPoints: number;
    readonly platforms: readonly string[];
    readonly wasmReady: boolean | null;
}

/** Granularity of available update. */
export type UpdateStatus = 'up-to-date' | 'patch' | 'minor' | 'major' | 'unknown';

/** A single version entry from CHANGELOG.md. */
export interface ChangelogEntry {
    readonly version: string;
    readonly date?: string;
    readonly body: string;
}

/** Parsed changelog entries between current and latest versions. */
export interface ChangelogInfo {
    readonly entries: readonly ChangelogEntry[];
    readonly truncated: boolean;
    readonly unavailableReason?: string;
}

/** Update information for a package. */
export interface UpdateInfo {
    readonly currentVersion: string;
    readonly latestVersion: string;
    readonly updateStatus: UpdateStatus;
    readonly changelog: ChangelogInfo | null;
}

/** Ecosystem drift relative to Flutter stable releases. */
export interface DriftInfo {
    readonly releasesBehind: number;
    readonly driftScore: number;
    readonly label: 'current' | 'recent' | 'drifting' | 'stale' | 'abandoned';
    readonly latestFlutterVersion: string;
}

/** Computed vibrancy result for one package. */
export interface VibrancyResult {
    readonly package: PackageDependency;
    readonly pubDev: PubDevPackageInfo | null;
    readonly github: GitHubMetrics | null;
    readonly knownIssue: KnownIssue | null;
    readonly score: number;
    readonly category: VibrancyCategory;
    readonly resolutionVelocity: number;
    readonly engagementLevel: number;
    readonly popularity: number;
    readonly publisherTrust: number;
    readonly updateInfo: UpdateInfo | null;
    readonly license: string | null;
    readonly drift: DriftInfo | null;
    readonly archiveSizeBytes: number | null;
    readonly bloatRating: number | null;
    readonly isUnused: boolean;
    readonly platforms: readonly string[] | null;
    readonly verifiedPublisher: boolean;
    readonly wasmReady: boolean | null;
    readonly blocker: BlockerInfo | null;
    readonly upgradeBlockStatus: UpgradeBlockStatus;
}

/** A single package entry from `dart pub outdated --json`. */
export interface PubOutdatedEntry {
    readonly package: string;
    readonly current: string | null;
    readonly upgradable: string | null;
    readonly resolvable: string | null;
    readonly latest: string | null;
}

/** How a package's upgrade is blocked or available. */
export type UpgradeBlockStatus =
    | 'up-to-date'
    | 'upgradable'
    | 'blocked'
    | 'constrained';

/** Information about what blocks a package upgrade. */
export interface BlockerInfo {
    readonly blockedPackage: string;
    readonly currentVersion: string;
    readonly latestVersion: string;
    readonly blockerPackage: string;
    readonly blockerVibrancyScore: number | null;
    readonly blockerCategory: VibrancyCategory | null;
}

/** A single step in an upgrade plan. */
export interface UpgradeStep {
    readonly packageName: string;
    readonly currentVersion: string;
    readonly targetVersion: string;
    readonly updateType: UpdateStatus;
    readonly familyId: string | null;
    readonly order: number;
}

/** Outcome of executing one upgrade step. */
export type StepOutcome =
    | 'success'
    | 'pub-get-failed'
    | 'test-failed'
    | 'skipped';

/** Result of executing one upgrade step. */
export interface UpgradeStepResult {
    readonly step: UpgradeStep;
    readonly outcome: StepOutcome;
    readonly output: string;
}

/** Summary report of an upgrade execution. */
export interface UpgradeReport {
    readonly steps: readonly UpgradeStepResult[];
    readonly completedCount: number;
    readonly failedAt: string | null;
}

/** A reverse-dependency edge: "dependentPackage depends on the target". */
export interface DepEdge {
    readonly dependentPackage: string;
}

/** Cache entry with TTL. */
export interface CacheEntry<T> {
    readonly data: T;
    readonly timestamp: number;
}

/** Position of a package name in pubspec.yaml. */
export interface PackageRange {
    readonly line: number;
    readonly startChar: number;
    readonly endChar: number;
}

/** A version group within a family split. */
export interface FamilyVersionGroup {
    readonly majorVersion: number;
    readonly packages: readonly string[];
}

/** Detected version split within a package family. */
export interface FamilySplit {
    readonly familyId: string;
    readonly familyLabel: string;
    readonly versionGroups: readonly FamilyVersionGroup[];
    readonly suggestion: string;
}
