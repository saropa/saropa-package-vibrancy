import { VibrancyResult, PackageDependency, GitHubMetrics } from './types';
import { CacheService } from './services/cache-service';
import { fetchPackageInfo, fetchPackageScore } from './services/pub-dev-api';
import { extractGitHubRepo, fetchRepoMetrics } from './services/github-api';
import { extractRepoSubpath, buildUpdateInfo } from './services/changelog-service';
import { findKnownIssue } from './scoring/known-issues';
import {
    calcResolutionVelocity,
    calcEngagementLevel,
    calcPopularity,
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
    readonly githubToken?: string;
    readonly weights?: ScoringWeights;
    readonly repoOverrides?: Record<string, string>;
}

/** Analyze a single package and compute its vibrancy result. */
export async function analyzePackage(
    dep: PackageDependency,
    params: AnalyzeParams,
): Promise<VibrancyResult> {
    const knownIssue = findKnownIssue(dep.name);
    const pubDev = await fetchPackageInfo(dep.name, params.cache);
    const pubPoints = await fetchPackageScore(dep.name, params.cache);

    const repoUrl = resolveRepoUrl(dep.name, pubDev?.repositoryUrl, params);
    const { github, repoInfo } = await fetchGitHubData(repoUrl, params);

    const scores = computeScores(github, pubPoints, params.weights);
    const pubDevWithPoints = pubDev ? { ...pubDev, pubPoints } : null;
    const category = classifyStatus({
        score: scores.score, knownIssue, pubDev: pubDevWithPoints,
    });

    const updateInfo = pubDev
        ? await buildUpdateInfo(
            dep.version, pubDev.latestVersion, repoInfo,
            { token: params.githubToken, cache: params.cache },
        )
        : null;

    return {
        package: dep, pubDev: pubDevWithPoints, github, knownIssue,
        ...scores, category, updateInfo,
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
    });
    return { github, repoInfo };
}

function computeScores(
    github: GitHubMetrics | null,
    pubPoints: number,
    weights?: ScoringWeights,
) {
    const resolutionVelocity = github
        ? calcResolutionVelocity(github) : 0;
    const engagementLevel = github
        ? calcEngagementLevel(github) : 0;
    const popularity = calcPopularity(pubPoints, github?.stars ?? 0);

    const score = computeVibrancyScore(
        { resolutionVelocity, engagementLevel, popularity }, weights,
    );
    return { score, resolutionVelocity, engagementLevel, popularity };
}
