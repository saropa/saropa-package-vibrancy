import { VibrancyResult, PackageDependency, GitHubMetrics, KnownIssue } from './types';
import { CacheService } from './services/cache-service';
import { ScanLogger } from './services/scan-logger';
import {
    fetchPackageInfo, fetchPackageScore, fetchPublisher,
    fetchArchiveSize,
} from './services/pub-dev-api';
import { calcBloatRating } from './scoring/bloat-calculator';
import { calcDrift } from './scoring/drift-calculator';
import { FlutterRelease } from './services/flutter-releases';
import { extractGitHubRepo, fetchRepoMetrics } from './services/github-api';
import { extractRepoSubpath, buildUpdateInfo } from './services/changelog-service';
import { findKnownIssue } from './scoring/known-issues';
import {
    calcResolutionVelocity,
    calcEngagementLevel,
    calcPopularity,
    calcFlaggedIssuePenalty,
    calcPublisherTrust,
    computeVibrancyScore,
    ScoringWeights,
} from './scoring/vibrancy-calculator';
import { classifyStatus } from './scoring/status-classifier';

interface RepoInfo {
    readonly owner: string;
    readonly repo: string;
    readonly subpath: string | null;
}

interface AnalyzeParams {
    readonly cache: CacheService;
    readonly logger?: ScanLogger;
    readonly githubToken?: string;
    readonly weights?: ScoringWeights;
    readonly repoOverrides?: Record<string, string>;
    readonly publisherTrustBonus?: number;
    readonly flutterReleases?: readonly FlutterRelease[];
}

/** Analyze a single package and compute its vibrancy result. */
export async function analyzePackage(
    dep: PackageDependency,
    params: AnalyzeParams,
): Promise<VibrancyResult> {
    const log = params.logger;
    const knownIssue = findKnownIssue(dep.name);
    if (knownIssue) { log?.info(`Known issue: ${knownIssue.status}`); }

    const [pubDev, pubPoints, publisher] = await Promise.all([
        fetchPackageInfo(dep.name, params.cache, log),
        fetchPackageScore(dep.name, params.cache, log),
        fetchPublisher(dep.name, params.cache, log),
    ]);

    const repoUrl = resolveRepoUrl(dep.name, pubDev?.repositoryUrl, params);
    const { github, repoInfo } = await fetchGitHubData(repoUrl, params);

    const scores = computeScores({
        github, pubPoints, publishedDate: pubDev?.publishedDate ?? null,
        publisher, weights: params.weights,
        maxPublisherBonus: params.publisherTrustBonus,
    });
    const pubDevWithPoints = pubDev
        ? { ...pubDev, pubPoints, publisher } : null;
    const category = classifyStatus({
        score: scores.score, knownIssue, pubDev: pubDevWithPoints,
    });

    log?.score({
        name: dep.name, total: scores.score, category,
        rv: scores.resolutionVelocity, eg: scores.engagementLevel,
        pop: scores.popularity, pt: scores.publisherTrust,
    });

    const [updateInfo, archiveSizeBytes] = await Promise.all([
        pubDev
            ? buildUpdateInfo(
                { current: dep.version, latest: pubDev.latestVersion, constraint: dep.constraint },
                repoInfo, {
                    token: params.githubToken, cache: params.cache,
                    packageName: dep.name,
                },
            )
            : null,
        resolveArchiveSize(dep.name, knownIssue, params),
    ]);
    const bloatRating = archiveSizeBytes !== null
        ? calcBloatRating(archiveSizeBytes) : null;

    const drift = calcDrift(
        pubDev?.publishedDate ?? null, params.flutterReleases ?? [],
    );

    return {
        package: dep, pubDev: pubDevWithPoints, github, knownIssue,
        ...scores, category, updateInfo,
        license: pubDevWithPoints?.license ?? null,
        drift, archiveSizeBytes, bloatRating, isUnused: false,
    };
}

function resolveRepoUrl(
    name: string,
    pubDevUrl: string | null | undefined,
    params: AnalyzeParams,
): string | null {
    return params.repoOverrides?.[name] ?? pubDevUrl ?? null;
}

async function fetchGitHubData(
    repoUrl: string | null,
    params: AnalyzeParams,
): Promise<{ github: GitHubMetrics | null; repoInfo: RepoInfo | null }> {
    if (!repoUrl) { return { github: null, repoInfo: null }; }

    const parsed = extractGitHubRepo(repoUrl);
    if (!parsed) { return { github: null, repoInfo: null }; }

    const repoInfo = { ...parsed, subpath: extractRepoSubpath(repoUrl) };
    const github = await fetchRepoMetrics(parsed.owner, parsed.repo, {
        token: params.githubToken, cache: params.cache,
        logger: params.logger,
    });
    return { github, repoInfo };
}

async function resolveArchiveSize(
    name: string,
    knownIssue: KnownIssue | null,
    params: AnalyzeParams,
): Promise<number | null> {
    if (knownIssue?.archiveSizeBytes != null) { return knownIssue.archiveSizeBytes; }
    return fetchArchiveSize(name, params.cache, params.logger);
}

function daysSince(isoDate: string): number | undefined {
    const ms = Date.parse(isoDate);
    if (isNaN(ms)) { return undefined; }
    return Math.max(0, Math.floor((Date.now() - ms) / 86_400_000));
}

function computeScores(params: {
    readonly github: GitHubMetrics | null;
    readonly pubPoints: number;
    readonly publishedDate: string | null;
    readonly publisher: string | null;
    readonly weights?: ScoringWeights;
    readonly maxPublisherBonus?: number;
}) {
    const { github, pubPoints, publishedDate, publisher } = params;
    const daysSincePublish = publishedDate
        ? daysSince(publishedDate) : undefined;
    const resolutionVelocity = github
        ? calcResolutionVelocity(github) : 0;
    const engagementLevel = github
        ? calcEngagementLevel(github, daysSincePublish) : 0;
    const popularity = calcPopularity(pubPoints, github?.stars ?? 0);
    const publisherTrust = calcPublisherTrust(
        publisher, params.maxPublisherBonus,
    );

    const flaggedPenalty = github
        ? calcFlaggedIssuePenalty(github.flaggedIssues?.length ?? 0) : 0;
    const score = computeVibrancyScore(
        { resolutionVelocity, engagementLevel, popularity }, params.weights,
        flaggedPenalty, publisherTrust,
    );
    return {
        score, resolutionVelocity, engagementLevel,
        popularity, publisherTrust,
    };
}
