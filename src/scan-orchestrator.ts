import { VibrancyResult, PackageDependency } from './types';
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

/** Analyze a single package and compute its vibrancy result. */
export async function analyzePackage(
    dep: PackageDependency,
    params: {
        cache: CacheService;
        githubToken?: string;
        weights?: ScoringWeights;
        repoOverrides?: Record<string, string>;
    },
): Promise<VibrancyResult> {
    const knownIssue = findKnownIssue(dep.name);
    const pubDev = await fetchPackageInfo(dep.name, params.cache);
    const pubPoints = await fetchPackageScore(dep.name, params.cache);

    let github = null;
    let repoInfo: { owner: string; repo: string; subpath: string | null } | null = null;
    const repoUrl = params.repoOverrides?.[dep.name]
        ?? pubDev?.repositoryUrl
        ?? null;
    if (repoUrl) {
        const parsed = extractGitHubRepo(repoUrl);
        if (parsed) {
            repoInfo = {
                ...parsed,
                subpath: extractRepoSubpath(repoUrl),
            };
            github = await fetchRepoMetrics(parsed.owner, parsed.repo, {
                token: params.githubToken,
                cache: params.cache,
            });
        }
    }

    const resolutionVelocity = github
        ? calcResolutionVelocity(github) : 0;
    const engagementLevel = github
        ? calcEngagementLevel(github) : 0;
    const popularity = calcPopularity(pubPoints, github?.stars ?? 0);

    const score = computeVibrancyScore({
        resolutionVelocity,
        engagementLevel,
        popularity,
    }, params.weights);

    const pubDevWithPoints = pubDev
        ? { ...pubDev, pubPoints } : null;

    const category = classifyStatus({
        score,
        knownIssue,
        pubDev: pubDevWithPoints,
    });

    const updateInfo = pubDev
        ? await buildUpdateInfo(
            dep.version,
            pubDev.latestVersion,
            repoInfo,
            { token: params.githubToken, cache: params.cache },
        )
        : null;

    return {
        package: dep,
        pubDev: pubDevWithPoints,
        github,
        knownIssue,
        score,
        category,
        resolutionVelocity,
        engagementLevel,
        popularity,
        updateInfo,
    };
}
