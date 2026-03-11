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
